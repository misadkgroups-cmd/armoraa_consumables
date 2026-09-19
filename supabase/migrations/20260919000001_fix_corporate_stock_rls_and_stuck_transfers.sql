-- ==============================================================================
-- 20260919000001_fix_corporate_stock_rls_and_stuck_transfers.sql
--
-- PERMANENT FIX for: "Branch -> Corporate transfer stays Pending forever and
--                     the Corporate Warehouse stock never updates."
--
-- ROOT CAUSE
-- ----------
-- The app authenticates against the custom `users` table using the Supabase
-- ANON key. It never signs in through Supabase Auth, so PostgREST executes
-- EVERY request as the `anon` role (this is documented in
-- 20260807_add_user_sessions_rls_policies.sql).
--
-- corporate_stock / corporate_stock_transactions were created with RLS ENABLED
-- and policies that allow ONLY auth.role() = 'authenticated':
--
--     CREATE POLICY "Allow MIS insert" ON corporate_stock
--       FOR INSERT WITH CHECK (auth.role() = 'authenticated');
--
-- Consequence for the `anon` role used by the app:
--   * SELECT -> RLS filters out every row (empty result / PGRST116 on .single())
--   * INSERT -> "new row violates row-level security policy"
--   * UPDATE -> 0 rows affected and NO error  <-- silent data loss
--
-- Faulty transfer sequence (createMultiLocationTransferRequest):
--   1. branch stock deducted                      -> OK (billable_stock has no RLS)
--   2. stock_transfers row inserted 'Pending'     -> OK (no RLS)
--   3. corporate_stock looked up / updated        -> BLOCKED by RLS
--   4. handler `continue`s, so the row stays 'Pending' for ever.
--
-- NOTE: billable_stock / non_billable_stock / stock_transfers have NO RLS at
-- all, which is why branch-to-branch transfers always worked and only the
-- Corporate Warehouse path broke.
--
-- FIX
-- ---
--   1. Align corporate_stock RLS with the app's anon-key auth model
--      (same approach already used for user_sessions).
--   2. Ensure the transfer audit columns + transaction types exist.
--   3. Repair historical transfers left 'Pending' by the bug: add the shipped
--      quantity into corporate_stock (creating the row when the product was
--      never held at corporate level) and mark them Received.
--
-- Idempotent: safe to re-run.
-- Run in the Supabase SQL editor (Dashboard -> SQL Editor).
-- ==============================================================================

-- ============================================================================
-- 1. RLS: corporate_stock
-- ============================================================================
ALTER TABLE public.corporate_stock ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated read access" ON public.corporate_stock;
DROP POLICY IF EXISTS "Allow MIS insert" ON public.corporate_stock;
DROP POLICY IF EXISTS "Allow MIS update" ON public.corporate_stock;
DROP POLICY IF EXISTS "Allow corporate stock select" ON public.corporate_stock;
DROP POLICY IF EXISTS "Allow corporate stock insert" ON public.corporate_stock;
DROP POLICY IF EXISTS "Allow corporate stock update" ON public.corporate_stock;
DROP POLICY IF EXISTS "Allow corporate stock delete" ON public.corporate_stock;

CREATE POLICY "Allow corporate stock select" ON public.corporate_stock
  FOR SELECT USING (auth.role() = 'anon' OR auth.role() = 'authenticated');

CREATE POLICY "Allow corporate stock insert" ON public.corporate_stock
  FOR INSERT WITH CHECK (auth.role() = 'anon' OR auth.role() = 'authenticated');

CREATE POLICY "Allow corporate stock update" ON public.corporate_stock
  FOR UPDATE USING (auth.role() = 'anon' OR auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'anon' OR auth.role() = 'authenticated');

CREATE POLICY "Allow corporate stock delete" ON public.corporate_stock
  FOR DELETE USING (auth.role() = 'anon' OR auth.role() = 'authenticated');

-- ============================================================================
-- 2. RLS: corporate_stock_transactions
-- ============================================================================
ALTER TABLE public.corporate_stock_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated read access" ON public.corporate_stock_transactions;
DROP POLICY IF EXISTS "Allow authenticated insert" ON public.corporate_stock_transactions;
DROP POLICY IF EXISTS "Allow corporate txn select" ON public.corporate_stock_transactions;
DROP POLICY IF EXISTS "Allow corporate txn insert" ON public.corporate_stock_transactions;
DROP POLICY IF EXISTS "Allow corporate txn update" ON public.corporate_stock_transactions;
DROP POLICY IF EXISTS "Allow corporate txn delete" ON public.corporate_stock_transactions;

CREATE POLICY "Allow corporate txn select" ON public.corporate_stock_transactions
  FOR SELECT USING (auth.role() = 'anon' OR auth.role() = 'authenticated');

CREATE POLICY "Allow corporate txn insert" ON public.corporate_stock_transactions
  FOR INSERT WITH CHECK (auth.role() = 'anon' OR auth.role() = 'authenticated');

CREATE POLICY "Allow corporate txn update" ON public.corporate_stock_transactions
  FOR UPDATE USING (auth.role() = 'anon' OR auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'anon' OR auth.role() = 'authenticated');

CREATE POLICY "Allow corporate txn delete" ON public.corporate_stock_transactions
  FOR DELETE USING (auth.role() = 'anon' OR auth.role() = 'authenticated');

-- ============================================================================
-- 3. Schema hardening for the transfer audit trail.
--    The app writes from_location / to_location and transaction_type 'Transfer'.
--    If 20260806_add_corporate_stock_location_columns.sql was never applied,
--    those inserts silently fail (PGRST204 / CHECK violation).
-- ============================================================================
ALTER TABLE IF EXISTS public.corporate_stock_transactions
  ADD COLUMN IF NOT EXISTS from_location TEXT,
  ADD COLUMN IF NOT EXISTS to_location TEXT;

ALTER TABLE IF EXISTS public.corporate_stock_transactions
  DROP CONSTRAINT IF EXISTS corporate_stock_transactions_transaction_type_check;

ALTER TABLE IF EXISTS public.corporate_stock_transactions
  ADD CONSTRAINT corporate_stock_transactions_transaction_type_check
  CHECK (transaction_type IN ('Inward', 'Outward', 'Adjustment', 'Transfer'));

-- ============================================================================
-- 4. REPAIR: confirm the Branch -> Corporate transfers that the RLS bug left
--    'Pending'. For every such row we
--      a) create the corporate_stock row if the product was never held there,
--      b) add the shipped quantity back to corporate_stock.available_units,
--      c) write the corporate_stock_transactions 'Inward' audit row,
--      d) mark the stock_transfers row 'Received'.
--    Only rows still 'Pending' are touched, so re-running is a no-op.
-- ============================================================================
DO $$
DECLARE
    tr          RECORD;
    corp_id     BIGINT;
    new_qty     NUMERIC;
    curr_units  NUMERIC;
    branch_txt  TEXT;
BEGIN
    FOR tr IN
        SELECT id, product_id, product_name, stock_type, quantity,
               from_branch_id, transferred_at
          FROM public.stock_transfers
         WHERE status = 'Pending'
           AND to_branch_id IS NULL        -- destination = Corporate Warehouse
           AND from_branch_id IS NOT NULL  -- source was a real branch
         ORDER BY id
         FOR UPDATE
    LOOP
        -- (a) locate or create the corporate_stock row
        SELECT cs.id, cs.available_units
          INTO corp_id, curr_units
          FROM public.corporate_stock cs
         WHERE cs.product_id = tr.product_id
           AND cs.stock_type  = tr.stock_type;

        IF corp_id IS NULL THEN
            INSERT INTO public.corporate_stock
                (product_id, product_name, stock_type, available_units,
                 minimum_units, created_by, updated_by)
            VALUES
                (tr.product_id, COALESCE(tr.product_name, ''), tr.stock_type, 0,
                 10, 'Auto-Confirm Migration', 'Auto-Confirm Migration')
            RETURNING id, available_units INTO corp_id, curr_units;
        END IF;

        -- (b) add the shipped quantity back
        new_qty := COALESCE(curr_units, 0) + COALESCE(tr.quantity, 0);

        UPDATE public.corporate_stock
           SET available_units = new_qty,
               updated_at      = now(),
               updated_by      = 'Auto-Confirm Migration'
         WHERE id = corp_id;

        branch_txt := 'Branch ' || tr.from_branch_id::TEXT;

        -- (c) corporate audit row
        INSERT INTO public.corporate_stock_transactions
            (product_id, product_name, stock_type, transaction_type, quantity,
             balance_after, remarks, from_location, to_location,
             created_by, created_at)
        VALUES
            (tr.product_id,
             COALESCE(tr.product_name, ''),
             tr.stock_type,
             'Inward',
             tr.quantity,
             new_qty,
             'Received from ' || branch_txt || ' (auto-confirmed repair)',
             branch_txt,
             'Corporate Warehouse',
             'Auto-Confirm Migration',
             COALESCE(tr.transferred_at, now()));

        -- (d) mark the transfer received
        UPDATE public.stock_transfers
           SET status      = 'Received',
               received_by = 'Auto-Confirm Migration',
               received_at = COALESCE(tr.transferred_at, now())
         WHERE id = tr.id;
    END LOOP;
END $$;

-- ============================================================================
-- 5. Verification (informational — safe to remove)
-- ============================================================================
-- Should return 0 rows once the repair above has completed:
--    SELECT * FROM public.stock_transfers
--     WHERE status = 'Pending' AND to_branch_id IS NULL AND from_branch_id IS NOT NULL;
--
-- Should list the anon-inclusive policies created above:
--    SELECT policyname, cmd FROM pg_policies
--     WHERE tablename IN ('corporate_stock', 'corporate_stock_transactions')
--     ORDER BY tablename, policyname;