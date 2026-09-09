-- ============================================================================
-- 20260909_enforce_non_billable_units_price.sql
--
-- RULE
--   Whenever an item is Non-Billable, the saved record must ALWAYS be:
--     units  = 1
--     price  = 0.00
--     amount = 0.00
--   regardless of what value the client sent. Cost must NEVER be derived from
--   stock price or average price for Non-Billable items.
--
-- ENFORCEMENT (backend safety net — the frontend already forces these values
-- via src/utils/nonBillableDefaults.js, but the DB must guarantee them even
-- if the frontend is bypassed, changed, or calls the API directly).
--
-- 1. BEFORE INSERT/UPDATE triggers on:
--      billable_report               (14-slot wide rows, is_non_billable_X)
--      billable_report_consumables   (normalized child rows)
--      bill_service_consumables      (per-service usage rows)
--
-- Run this in the Supabase SQL editor (Dashboard -> SQL Editor).
-- ============================================================================

-- ============================================================================
-- NO LEGACY DATA FIX (by design).
-- Earlier versions of this migration contained UPDATE statements that forced
-- existing Non-Billable rows to units = 1. That MODIFIED historical records,
-- which is not allowed ("existing reports must remain unchanged"), so the
-- data-fix section was removed. Enforcement now applies ONLY to new saves:
--   - BEFORE INSERT/UPDATE triggers rewrite incoming values
--   - NOT VALID CHECK constraints reject bad NEW writes but never re-validate
--     or alter already-stored rows
-- ============================================================================

-- ---------------------------------------------------------------
-- 2. Trigger on billable_report_consumables
--    Non-Billable rows are ALWAYS forced to units = 1.
--    Only created if the table exists in this database.
-- ---------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.billable_report_consumables') IS NOT NULL THEN
    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION public.fn_force_non_billable_units_brc()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $inner$
      BEGIN
        IF NEW.is_non_billable = true THEN
          NEW.units := 1;       -- Non-Billable price/amount are always 0.00
        END IF;
        RETURN NEW;
      END;
      $inner$;
    $fn$;

    EXECUTE 'DROP TRIGGER IF EXISTS trg_force_non_billable_units_brc ON public.billable_report_consumables';
    EXECUTE 'CREATE TRIGGER trg_force_non_billable_units_brc
      BEFORE INSERT OR UPDATE ON public.billable_report_consumables
      FOR EACH ROW EXECUTE FUNCTION public.fn_force_non_billable_units_brc()';
  ELSE
    RAISE NOTICE 'public.billable_report_consumables does not exist - skipping trigger';
  END IF;
END $$;


-- ---------------------------------------------------------------
-- 3. Trigger on bill_service_consumables
--    Non-Billable rows are ALWAYS forced to used_quantity = 1.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_force_non_billable_units_bsc()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.product_type = 'Non-Billable' THEN
    NEW.used_quantity := 1;   -- Non-Billable price/amount are always 0.00
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_force_non_billable_units_bsc ON public.bill_service_consumables;
CREATE TRIGGER trg_force_non_billable_units_bsc
  BEFORE INSERT OR UPDATE ON public.bill_service_consumables
  FOR EACH ROW EXECUTE FUNCTION public.fn_force_non_billable_units_bsc();

-- ---------------------------------------------------------------
-- 4. Trigger on billable_report (wide 14-slot table)
--    Any slot flagged is_non_billable_X is forced to consumable_X_units = 1.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_force_non_billable_units_br()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF COALESCE(NEW.is_non_billable_1,  false) THEN NEW.consumable_1_units  := 1; END IF;
  IF COALESCE(NEW.is_non_billable_2,  false) THEN NEW.consumable_2_units  := 1; END IF;
  IF COALESCE(NEW.is_non_billable_3,  false) THEN NEW.consumable_3_units  := 1; END IF;
  IF COALESCE(NEW.is_non_billable_4,  false) THEN NEW.consumable_4_units  := 1; END IF;
  IF COALESCE(NEW.is_non_billable_5,  false) THEN NEW.consumable_5_units  := 1; END IF;
  IF COALESCE(NEW.is_non_billable_6,  false) THEN NEW.consumable_6_units  := 1; END IF;
  IF COALESCE(NEW.is_non_billable_7,  false) THEN NEW.consumable_7_units  := 1; END IF;
  IF COALESCE(NEW.is_non_billable_8,  false) THEN NEW.consumable_8_units  := 1; END IF;
  IF COALESCE(NEW.is_non_billable_9,  false) THEN NEW.consumable_9_units  := 1; END IF;
  IF COALESCE(NEW.is_non_billable_10, false) THEN NEW.consumable_10_units := 1; END IF;
  IF COALESCE(NEW.is_non_billable_11, false) THEN NEW.consumable_11_units := 1; END IF;
  IF COALESCE(NEW.is_non_billable_12, false) THEN NEW.consumable_12_units := 1; END IF;
  IF COALESCE(NEW.is_non_billable_13, false) THEN NEW.consumable_13_units := 1; END IF;
  IF COALESCE(NEW.is_non_billable_14, false) THEN NEW.consumable_14_units := 1; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_force_non_billable_units_br ON public.billable_report;
CREATE TRIGGER trg_force_non_billable_units_br
  BEFORE INSERT OR UPDATE ON public.billable_report
  FOR EACH ROW EXECUTE FUNCTION public.fn_force_non_billable_units_br();

-- ---------------------------------------------------------------
-- 5. CHECK constraints (belt-and-braces: even a write that bypasses the
--    trigger cannot persist bad Non-Billable values)
-- ---------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.billable_report_consumables') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'brc_non_billable_units_is_one'
    ) THEN
      EXECUTE 'ALTER TABLE public.billable_report_consumables
        ADD CONSTRAINT brc_non_billable_units_is_one
        CHECK (is_non_billable = false OR units = 1)
        NOT VALID';
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'bsc_non_billable_used_qty_is_one'
  ) THEN
    ALTER TABLE public.bill_service_consumables
      ADD CONSTRAINT bsc_non_billable_used_qty_is_one
      CHECK (product_type <> 'Non-Billable' OR used_quantity = 1)
      NOT VALID;
  END IF;
END $$;
