-- ============================================================================
-- 20260909_enforce_consumable_units_slot_check.sql
--
-- PROBLEM
--   Bill 6846 record 218 was saved with consumable_1_id = 1007 but
--   consumable_1_units = NULL. This produced a bogus "consumable, 0 units"
--   row in the report and padded totals.
--
-- ROOT CAUSE
--   The billable_report table had NO database-level rule tying a populated
--   consumable_X_id to a valid (positive) consumable_X_units. A UI/API/bug
--   could therefore persist a consumable id with a NULL / 0 / negative units.
--
-- FIX
--   Enforce the invariant at the database level so it can NEVER happen again
--   for any bill, from any code path:
--       IF consumable_X_id IS NOT NULL
--       THEN consumable_X_units IS NOT NULL AND consumable_X_units > 0
--   for every slot X in 1..14.
--
--   The constraints are added with NOT VALID so existing (legacy/null) bad
--   rows do not cause the ALTER to fail. NOT VALID constraints are STILL
--   enforced for all new INSERT/UPDATE statements, so the bug cannot recur.
--
--   Applied to billable_report and to the normalized child table
--   billable_report_consumables.
--
-- Run this in the Supabase SQL editor (Dashboard -> SQL Editor).
-- ============================================================================

-- ---------------------------------------------------------------
-- 1. billable_report - 14-slot consistency check
-- ---------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'billable_report_consumable_units_slot_check'
  ) THEN
    ALTER TABLE public.billable_report
      ADD CONSTRAINT billable_report_consumable_units_slot_check
      CHECK (
           ( (consumable_1_id  IS NULL) OR (consumable_1_units  IS NOT NULL AND consumable_1_units  > 0) )
       AND ( (consumable_2_id  IS NULL) OR (consumable_2_units  IS NOT NULL AND consumable_2_units  > 0) )
       AND ( (consumable_3_id  IS NULL) OR (consumable_3_units  IS NOT NULL AND consumable_3_units  > 0) )
       AND ( (consumable_4_id  IS NULL) OR (consumable_4_units  IS NOT NULL AND consumable_4_units  > 0) )
       AND ( (consumable_5_id  IS NULL) OR (consumable_5_units  IS NOT NULL AND consumable_5_units  > 0) )
       AND ( (consumable_6_id  IS NULL) OR (consumable_6_units  IS NOT NULL AND consumable_6_units  > 0) )
       AND ( (consumable_7_id  IS NULL) OR (consumable_7_units  IS NOT NULL AND consumable_7_units  > 0) )
       AND ( (consumable_8_id  IS NULL) OR (consumable_8_units  IS NOT NULL AND consumable_8_units  > 0) )
       AND ( (consumable_9_id  IS NULL) OR (consumable_9_units  IS NOT NULL AND consumable_9_units  > 0) )
       AND ( (consumable_10_id IS NULL) OR (consumable_10_units IS NOT NULL AND consumable_10_units > 0) )
       AND ( (consumable_11_id IS NULL) OR (consumable_11_units IS NOT NULL AND consumable_11_units > 0) )
       AND ( (consumable_12_id IS NULL) OR (consumable_12_units IS NOT NULL AND consumable_12_units > 0) )
       AND ( (consumable_13_id IS NULL) OR (consumable_13_units IS NOT NULL AND consumable_13_units > 0) )
       AND ( (consumable_14_id IS NULL) OR (consumable_14_units IS NOT NULL AND consumable_14_units > 0) )
      ) NOT VALID;
  END IF;
END $$;

-- ---------------------------------------------------------------
-- 2. billable_report_consumables (normalized child table)
--    Every materialized consumable row must have positive units.
-- ---------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'billable_report_consumables_units_positive'
  ) THEN
    ALTER TABLE public.billable_report_consumables
      ADD CONSTRAINT billable_report_consumables_units_positive
      CHECK (units IS NOT NULL AND units > 0)
      NOT VALID;
  END IF;
END $$;

-- ---------------------------------------------------------------
-- OPTIONAL: identify the legacy bad rows (does NOT change data).
-- Run if you want to audit which existing bills were affected.
-- ---------------------------------------------------------------
-- SELECT id, bill_id, service_name,
--        consumable_1_id, consumable_1_units,
--        consumable_2_id, consumable_2_units,
--        consumable_3_id, consumable_3_units,
--        consumable_4_id, consumable_4_units
-- FROM public.billable_report
-- WHERE (consumable_1_id  IS NOT NULL AND (consumable_1_units  IS NULL OR consumable_1_units  <= 0))
--    OR (consumable_2_id  IS NOT NULL AND (consumable_2_units  IS NULL OR consumable_2_units  <= 0))
--    OR (consumable_3_id  IS NOT NULL AND (consumable_3_units  IS NULL OR consumable_3_units  <= 0))
--    OR (consumable_4_id  IS NOT NULL AND (consumable_4_units  IS NULL OR consumable_4_units  <= 0))
--    OR (consumable_5_id  IS NOT NULL AND (consumable_5_units  IS NULL OR consumable_5_units  <= 0))
--    OR (consumable_6_id  IS NOT NULL AND (consumable_6_units  IS NULL OR consumable_6_units  <= 0))
--    OR (consumable_7_id  IS NOT NULL AND (consumable_7_units  IS NULL OR consumable_7_units  <= 0))
--    OR (consumable_8_id  IS NOT NULL AND (consumable_8_units  IS NULL OR consumable_8_units  <= 0))
--    OR (consumable_9_id  IS NOT NULL AND (consumable_9_units  IS NULL OR consumable_9_units  <= 0))
--    OR (consumable_10_id IS NOT NULL AND (consumable_10_units IS NULL OR consumable_10_units <= 0))
--    OR (consumable_11_id IS NOT NULL AND (consumable_11_units IS NULL OR consumable_11_units <= 0))
--    OR (consumable_12_id IS NOT NULL AND (consumable_12_units IS NULL OR consumable_12_units <= 0))
--    OR (consumable_13_id IS NOT NULL AND (consumable_13_units IS NULL OR consumable_13_units <= 0))
--    OR (consumable_14_id IS NOT NULL AND (consumable_14_units IS NULL OR consumable_14_units <= 0));