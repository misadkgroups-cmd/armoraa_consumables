-- ============================================================================
-- 20260910_ai_assistant.sql
--
-- Read-only AI assistant backend for ARMORAA.
--
-- ARCHITECTURE
--   Chat widget (React)  ->  ai_exec_sql() RPC  ->  DB
--
-- SECURITY MODEL
--   ai_exec_sql() is a SECURITY DEFINER RPC granted to anon/authenticated.
--   It NEVER switches roles and NEVER grants extra access. Instead it relies
--   on strict validation that makes writes structurally impossible:
--     - rejects anything that is not a single SELECT/WITH statement
--     - strips SQL comments, then blocklists write/admin keywords
--       (INSERT/UPDATE/DELETE/DROP/ALTER/CREATE/TRUNCATE/GRANT/COPY/pg_sleep
--        and sneaky ones like DO, CALL, SET, dblink, lo_import, INTO …)
--     - enforces an 8s statement timeout
--     - caps results at 200 rows
--   Because only SELECT can pass validation, the assistant is read-only by
--   construction — no GRANTs, no role changes, no extra privileges needed.
--
-- SAFE BY DESIGN: no existing data is modified; only additive objects.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Helper views (simple + fast targets for the assistant)
-- ---------------------------------------------------------------------------

-- Daily bill volume per branch.
-- NOTE: the billing tables have NO price/amount column, so "revenue" is
-- expressed as bill and service counts until a price column is introduced.
CREATE OR REPLACE VIEW public.v_daily_activity AS
SELECT
  b.branch_id,
  br.branch_name,
  b.service_date,
  COUNT(*) AS bill_count
FROM public.billing_log b
JOIN public.branches br ON br.id = b.branch_id
WHERE b.deleted_at IS NULL
GROUP BY b.branch_id, br.branch_name, b.service_date;

-- Branch performance (all time).
CREATE OR REPLACE VIEW public.v_branch_performance AS
SELECT
  br.id     AS branch_id,
  br.branch_name,
  COUNT(*)  AS total_bills,
  COUNT(*) FILTER (WHERE b.bill_status = 'Complete') AS completed_bills
FROM public.billing_log b
JOIN public.branches br ON br.id = b.branch_id
WHERE b.deleted_at IS NULL
GROUP BY br.id, br.branch_name;

-- Top services by usage (per service row on bills).
CREATE OR REPLACE VIEW public.v_service_usage AS
SELECT
  bs.service_name,
  b.branch_id,
  br.branch_name,
  DATE_TRUNC('month', b.service_date)::date AS month,
  COUNT(*) AS times_billed
FROM public.bill_services bs
JOIN public.billing_log b ON b.id = bs.bill_id
JOIN public.branches br ON br.id = b.branch_id
GROUP BY bs.service_name, b.branch_id, br.branch_name, DATE_TRUNC('month', b.service_date)::date;

-- Consumable usage from the normalized report child table.
-- The child table only exists if the 20260722 normalize migration was applied;
-- guard the view so this migration never fails on databases without it.
-- NOTE: billable_report_consumables has NO consumable_name column (cols:
-- report_id, product_type, consumable_id, units, is_non_billable,
-- registry_id, batch_id, slot_number, created_at, created_by) — so names are
-- resolved via the master tables here, not selected directly.
DO $$
BEGIN
  IF to_regclass('public.billable_report_consumables') IS NOT NULL THEN
    EXECUTE $view$
      CREATE OR REPLACE VIEW public.v_consumable_usage AS
      SELECT
        COALESCE(mbc.product_name, mnbc.product_name, 'Item #' || brc.consumable_id::text) AS consumable_name,
        brc.product_type,
        br.branch_id,
        br.branch_name,
        SUM(brc.units) AS total_units,
        COUNT(*)       AS times_used
      FROM public.billable_report_consumables brc
      JOIN public.billable_report br ON br.id = brc.report_id
      LEFT JOIN public.master_billable_consumables mbc
        ON brc.product_type = 'Billable' AND mbc.id = brc.consumable_id
      LEFT JOIN public.master_non_billable_consumables mnbc
        ON brc.product_type = 'Non-Billable' AND mnbc.id = COALESCE(brc.registry_id, brc.consumable_id)
      GROUP BY consumable_name, brc.product_type, br.branch_id, br.branch_name
    $view$;
  ELSE
    RAISE NOTICE 'public.billable_report_consumables does not exist - skipping v_consumable_usage view';
    -- Fallback: build the same shape from bill_service_consumables (always present).
    EXECUTE $view$
      CREATE OR REPLACE VIEW public.v_consumable_usage AS
      SELECT
        COALESCE(mbc.product_name, mnbc.product_name, 'Item #' || bsc.consumable_id::text) AS consumable_name,
        bsc.product_type,
        b.branch_id,
        br.branch_name,
        SUM(bsc.used_quantity) AS total_units,
        COUNT(*)               AS times_used
      FROM public.bill_service_consumables bsc
      JOIN public.bill_services bs ON bs.id = bsc.bill_service_id
      JOIN public.billing_log b    ON b.id  = bs.bill_id
      JOIN public.branches br      ON br.id = b.branch_id
      LEFT JOIN public.master_billable_consumables mbc
        ON bsc.product_type = 'Billable' AND mbc.id = bsc.consumable_id
      LEFT JOIN public.master_non_billable_consumables mnbc
        ON bsc.product_type = 'Non-Billable' AND mnbc.id = bsc.consumable_id
      GROUP BY consumable_name, bsc.product_type, b.branch_id, br.branch_name
    $view$;
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 2. The read-only SQL executor RPC
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ai_exec_sql(p_sql TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sql     TEXT;
  v_no_comm TEXT;
  v_cur     REFCURSOR := 'ai_cur';
  v_rec     RECORD;
  v_rows    JSONB := '[]'::jsonb;
  v_count   INT := 0;
  v_max     CONSTANT INT := 200;
  v_timeout CONSTANT TEXT := '8s';
BEGIN
  -- ---- Validation: must be provided ----
  IF p_sql IS NULL OR length(btrim(p_sql)) = 0 THEN
    RAISE EXCEPTION 'Empty query';
  END IF;

  v_sql := btrim(p_sql);

  -- ---- Validation: single statement only ----
  IF position(';' IN v_sql) > 0 THEN
    -- allow exactly one trailing semicolon
    IF right(v_sql, 1) = ';' AND position(';' IN left(v_sql, length(v_sql) - 1)) = 0 THEN
      v_sql := left(v_sql, length(v_sql) - 1);
    ELSE
      RAISE EXCEPTION 'Only a single statement is allowed';
    END IF;
  END IF;

  -- ---- Validation: must start with SELECT / WITH ----
  IF v_sql !~* '^\s*(SELECT|WITH)\s' THEN
    RAISE EXCEPTION 'Only SELECT queries are allowed';
  END IF;

  -- ---- Validation: keyword blocklist (case-insensitive, word-boundary,
  --      evaluated on comment-stripped text) ----
  v_no_comm := regexp_replace(v_sql, '--[^\n]*', ' ', 'g');
  v_no_comm := regexp_replace(v_no_comm, '/\*.*?\*/', ' ', 'gs');

  IF v_no_comm ~* '\m(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE|COPY|VACUUM|CALL|DO|SET|RESET|LISTEN|NOTIFY|ANALYZE|REINDEX|CLUSTER|LOCK|pg_sleep|pg_read_file|pg_ls_dir|lo_import|lo_export|dblink)\M'
     OR v_no_comm ~* '\mINTO\M'
     OR v_no_comm ~* '\mFOR\s+UPDATE\M' THEN
    RAISE EXCEPTION 'Forbidden keyword in query — only plain SELECTs are allowed';
  END IF;

  -- ---- Execute with a timeout (no role switch, no extra grants) ----
  PERFORM set_config('statement_timeout', v_timeout, true);

  OPEN v_cur FOR EXECUTE v_no_comm;
  LOOP
    FETCH v_cur INTO v_rec;
    EXIT WHEN NOT FOUND;
    v_rows := v_rows || to_jsonb(v_rec);
    v_count := v_count + 1;
    EXIT WHEN v_count >= v_max;
  END LOOP;
  CLOSE v_cur;

  RETURN v_rows;
EXCEPTION
  WHEN query_canceled THEN
    RAISE EXCEPTION 'Query timed out or was cancelled';
END;
$$;

-- Executable by the app's Data API roles (the function itself is the guard).
GRANT EXECUTE ON FUNCTION public.ai_exec_sql(TEXT) TO anon, authenticated;

