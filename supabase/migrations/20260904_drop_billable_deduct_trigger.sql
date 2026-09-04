-- ============================================================================
-- 20260904_drop_billable_deduct_trigger.sql
--
-- Billable stock deduction is now handled ENTIRELY client-side
-- (src/pages/BillableConsumables.jsx -> deductInventory), which deducts:
--   - FULL units on INSERT of a billable_report
--   - only the DIFFERENCE on UPDATE (per product, aggregated across slots)
--
-- The DB trigger deducted the full units on INSERT, which would now cause
-- DOUBLE deduction. It must be removed.
--
-- Run this in the Supabase SQL editor (Dashboard -> SQL Editor).
-- ============================================================================

DROP TRIGGER IF EXISTS trg_deduct_billable_stock ON public.billable_report;
