-- ============================================================================
-- 20260910_consumable_history_bill_context.sql
--
-- Adds denormalized bill context (bill_no, patient_name) to the append-only
-- consumable_history audit table so every audit row is self-describing.
--
-- SAFE BY DESIGN:
--   - Nullable columns added via ADD COLUMN IF NOT EXISTS (no data migration)
--   - Existing audit rows are NOT modified (their bill_no/patient_name stay
--     NULL and are still resolvable via bill_id at read time)
--   - No change to billable_report or any other table
-- ============================================================================

ALTER TABLE public.consumable_history
  ADD COLUMN IF NOT EXISTS bill_no TEXT;

ALTER TABLE public.consumable_history
  ADD COLUMN IF NOT EXISTS patient_name TEXT;
