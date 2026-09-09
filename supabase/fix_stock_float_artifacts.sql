-- ============================================================================
-- fix_stock_float_artifacts.sql
--
-- PURPOSE
--   One-time cleanup of floating-point artifacts already stored in stock
--   tables by decimal quantity arithmetic, e.g.
--     54.3 - 0.1 - 0.09  ->  54.110000000000056   (should be 54.11)
--   Application code now rounds to 2 decimals before every stock write, so
--   this script only needs to fix EXISTING rows.
--
--   Run in Supabase Dashboard -> SQL Editor. Idempotent.
-- ============================================================================

-- 1. Find affected rows first (preview)
SELECT id, consumable_id, branch_id, available_stock
FROM billable_stock
WHERE available_stock <> ROUND(available_stock, 2);

SELECT id, consumable_id, branch_id, available_stock
FROM non_billable_stock
WHERE available_stock <> ROUND(available_stock, 2);

SELECT id, product_id, stock_type, available_units
FROM corporate_stock
WHERE available_units <> ROUND(available_units, 2);

-- 2. Fix them (2 decimal places, per the stock storage standard)
UPDATE billable_stock
SET available_stock = ROUND(available_stock, 2)
WHERE available_stock <> ROUND(available_stock, 2);

UPDATE non_billable_stock
SET available_stock = ROUND(available_stock, 2)
WHERE available_stock <> ROUND(available_stock, 2);

UPDATE corporate_stock
SET available_units = ROUND(available_units, 2)
WHERE available_units <> ROUND(available_units, 2);

-- 3. Also normalize transaction ledger balances (display history)
UPDATE stock_transactions
SET balance_after = ROUND(balance_after, 2)
WHERE balance_after IS NOT NULL AND balance_after <> ROUND(balance_after, 2);

UPDATE corporate_stock_transactions
SET balance_after = ROUND(balance_after, 2)
WHERE balance_after IS NOT NULL AND balance_after <> ROUND(balance_after, 2);

-- 4. (Optional hardening) DB-level guarantee so artifacts can never be stored
--    again, regardless of which code path writes:
-- ALTER TABLE billable_stock
--   ADD CONSTRAINT billable_stock_available_2dp
--   CHECK (available_stock = ROUND(available_stock, 2));
-- ALTER TABLE non_billable_stock
--   ADD CONSTRAINT non_billable_stock_available_2dp
--   CHECK (available_stock = ROUND(available_stock, 2));
-- ALTER TABLE corporate_stock
--   ADD CONSTRAINT corporate_stock_available_2dp
--   CHECK (available_units = ROUND(available_units, 2));
