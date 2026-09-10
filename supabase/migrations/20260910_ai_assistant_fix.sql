-- ============================================================================
-- 20260910_ai_assistant_fix.sql
--
-- Standalone RE-RUN of the corrected ai_exec_sql() RPC from
-- 20260910_ai_assistant.sql (same body, kept as a separate file so it can be
-- pasted into the Supabase SQL Editor to repair deployments where an older
-- revision of the function — e.g. one that tried to SET ROLE — is installed).
-- SAFE: CREATE OR REPLACE + GRANT only; touches no existing data.
-- ============================================================================

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
  IF p_sql IS NULL OR length(btrim(p_sql)) = 0 THEN
    RAISE EXCEPTION 'Empty query';
  END IF;

  v_sql := btrim(p_sql);

  IF position(';' IN v_sql) > 0 THEN
    IF right(v_sql, 1) = ';' AND position(';' IN left(v_sql, length(v_sql) - 1)) = 0 THEN
      v_sql := left(v_sql, length(v_sql) - 1);
    ELSE
      RAISE EXCEPTION 'Only a single statement is allowed';
    END IF;
  END IF;

  IF v_sql !~* '^\s*(SELECT|WITH)\s' THEN
    RAISE EXCEPTION 'Only SELECT queries are allowed';
  END IF;

  v_no_comm := regexp_replace(v_sql, '--[^\n]*', ' ', 'g');
  v_no_comm := regexp_replace(v_no_comm, '/\*.*?\*/', ' ', 'gs');

  IF v_no_comm ~* '\m(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE|COPY|VACUUM|CALL|DO|SET|RESET|LISTEN|NOTIFY|ANALYZE|REINDEX|CLUSTER|LOCK|pg_sleep|pg_read_file|pg_ls_dir|lo_import|lo_export|dblink)\M'
     OR v_no_comm ~* '\mINTO\M'
     OR v_no_comm ~* '\mFOR\s+UPDATE\M' THEN
    RAISE EXCEPTION 'Forbidden keyword in query — only plain SELECTs are allowed';
  END IF;

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

GRANT EXECUTE ON FUNCTION public.ai_exec_sql(TEXT) TO anon, authenticated;
