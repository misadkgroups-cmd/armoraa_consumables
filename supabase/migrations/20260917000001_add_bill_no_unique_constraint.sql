-- ==============================================================================
-- 20260917000001_add_bill_no_unique_constraint.sql
--
-- Enforce that bill_no is unique in billing_log.
-- Previously bill_no was only indexed (for search speed), which allowed
-- the same bill number to be inserted multiple times. This migration adds
-- a UNIQUE constraint so PostgreSQL rejects duplicate bill_no values.
--
-- SAFE BY DESIGN:
--   - If duplicates already exist in the table, this will fail loudly
--     so you can resolve them before re-running.
--   - Once applied, every future INSERT/UPDATE must preserve uniqueness.
--
-- Run this in the Supabase SQL editor (Dashboard -> SQL Editor).
-- ============================================================================

-- 1. Add the UNIQUE constraint on bill_no
ALTER TABLE public.billing_log
  ADD CONSTRAINT billing_log_bill_no_unique UNIQUE (bill_no);

-- 2. Verify the constraint is in place (informational, can be removed)
--    SELECT conname, conkey FROM pg_constraint
--    WHERE conname = 'billing_log_bill_no_unique';
