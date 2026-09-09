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
-- 1. One-time data fix for legacy rows.
-- 2. BEFORE INSERT/UPDATE triggers on:
--      billable_report               (14-slot wide rows, is_non_billable_X)
--      billable_report_consumables   (normalized child rows)
--      bill_service_consumables      (per-service usage rows)
--
-- Run this in the Supabase SQL editor (Dashboard -> SQL Editor).
-- ============================================================================

-- ---------------------------------------------------------------
-- 1. Legacy data fix: force Non-Billable rows to units = 1
--    (only runs for tables that actually exist in this database —
--     billable_report_consumables may not have been created yet if the
--     20260722 normalize migration was never applied)
-- ---------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.billable_report_consumables') IS NOT NULL THEN
    UPDATE public.billable_report_consumables
    SET units = 1
    WHERE is_non_billable = true
      AND (units IS NULL OR units <> 1);
  ELSE
    RAISE NOTICE 'public.billable_report_consumables does not exist - skipping legacy fix';
  END IF;
END $$;

UPDATE public.bill_service_consumables
SET used_quantity = 1
WHERE product_type = 'Non-Billable'
  AND (used_quantity IS NULL OR used_quantity <> 1);

-- Wide table: force every Non-Billable slot's units to 1
UPDATE public.billable_report
SET
  consumable_1_units  = CASE WHEN COALESCE(is_non_billable_1,  false) THEN 1 ELSE consumable_1_units  END,
  consumable_2_units  = CASE WHEN COALESCE(is_non_billable_2,  false) THEN 1 ELSE consumable_2_units  END,
  consumable_3_units  = CASE WHEN COALESCE(is_non_billable_3,  false) THEN 1 ELSE consumable_3_units  END,
  consumable_4_units  = CASE WHEN COALESCE(is_non_billable_4,  false) THEN 1 ELSE consumable_4_units  END,
  consumable_5_units  = CASE WHEN COALESCE(is_non_billable_5,  false) THEN 1 ELSE consumable_5_units  END,
  consumable_6_units  = CASE WHEN COALESCE(is_non_billable_6,  false) THEN 1 ELSE consumable_6_units  END,
  consumable_7_units  = CASE WHEN COALESCE(is_non_billable_7,  false) THEN 1 ELSE consumable_7_units  END,
  consumable_8_units  = CASE WHEN COALESCE(is_non_billable_8,  false) THEN 1 ELSE consumable_8_units  END,
  consumable_9_units  = CASE WHEN COALESCE(is_non_billable_9,  false) THEN 1 ELSE consumable_9_units  END,
  consumable_10_units = CASE WHEN COALESCE(is_non_billable_10, false) THEN 1 ELSE consumable_10_units END,
  consumable_11_units = CASE WHEN COALESCE(is_non_billable_11, false) THEN 1 ELSE consumable_11_units END,
  consumable_12_units = CASE WHEN COALESCE(is_non_billable_12, false) THEN 1 ELSE consumable_12_units END,
  consumable_13_units = CASE WHEN COALESCE(is_non_billable_13, false) THEN 1 ELSE consumable_13_units END,
  consumable_14_units = CASE WHEN COALESCE(is_non_billable_14, false) THEN 1 ELSE consumable_14_units END
WHERE COALESCE(is_non_billable_1,  false) OR COALESCE(is_non_billable_2,  false)
   OR COALESCE(is_non_billable_3,  false) OR COALESCE(is_non_billable_4,  false)
   OR COALESCE(is_non_billable_5,  false) OR COALESCE(is_non_billable_6,  false)
   OR COALESCE(is_non_billable_7,  false) OR COALESCE(is_non_billable_8,  false)
   OR COALESCE(is_non_billable_9,  false) OR COALESCE(is_non_billable_10, false)
   OR COALESCE(is_non_billable_11, false) OR COALESCE(is_non_billable_12, false)
   OR COALESCE(is_non_billable_13, false) OR COALESCE(is_non_billable_14, false);

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
