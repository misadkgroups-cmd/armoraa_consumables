-- ============================================================================
-- 20260910_decimal_quantity_columns.sql
--
-- FIX for recurring Postgres error 22P02:
--   invalid input syntax for type integer: "1.8"
--
-- CAUSE
--   The app supports decimal consumption quantities (e.g. 1.8, 2.6 ml — the
--   same values billable_report.consumable_X_units NUMERIC already stores),
--   but these two columns were still INTEGER, so every decimal save failed:
--     - bill_service_consumables.used_quantity  INTEGER
--     - stock_transactions.quantity             INTEGER
--
-- FIX
--   Widen both columns to NUMERIC.
--
-- SAFE BY DESIGN:
--   - Widening INTEGER -> NUMERIC never loses or alters existing values
--     (integers cast exactly; decimals could never be stored before, so no
--     historical record is touched or re-interpreted)
--   - No migration of data, no column rename/drop, no other table touched
--   - Idempotent: only alters when the column is still integer
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'bill_service_consumables'
      AND column_name = 'used_quantity'
      AND data_type IN ('integer', 'smallint', 'bigint')
  ) THEN
    ALTER TABLE public.bill_service_consumables
      ALTER COLUMN used_quantity TYPE NUMERIC;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'stock_transactions'
      AND column_name = 'quantity'
      AND data_type IN ('integer', 'smallint', 'bigint')
  ) THEN
    ALTER TABLE public.stock_transactions
      ALTER COLUMN quantity TYPE NUMERIC;
  END IF;
END $$;
