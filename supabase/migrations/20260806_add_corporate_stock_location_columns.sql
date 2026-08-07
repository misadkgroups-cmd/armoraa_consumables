-- ============================================================
-- Migration: Stock transfer source/destination tracking
-- ============================================================
-- Adds from_location / to_location columns to corporate_stock_transactions
-- so that the Transaction History tab can display the From / To of every
-- movement (especially Transfers from the Corporate Warehouse to branches).
-- Also extends the transaction_type CHECK to include 'Transfer'.
-- ============================================================

-- 1. Add location columns (idempotent across already-applied migrations)
ALTER TABLE IF EXISTS public.corporate_stock_transactions
  ADD COLUMN IF NOT EXISTS from_location TEXT,
  ADD COLUMN IF NOT EXISTS to_location TEXT;

-- 2. Extend transaction_type CHECK to include 'Transfer'.
--    The inline CHECK created by the original migration is named
--    corporate_stock_transactions_transaction_type_check by PostgreSQL's
--    naming convention ({table}_{column}_check). Drop & recreate explicitly.
ALTER TABLE IF EXISTS public.corporate_stock_transactions
  DROP CONSTRAINT IF EXISTS corporate_stock_transactions_transaction_type_check;

ALTER TABLE IF EXISTS public.corporate_stock_transactions
  ADD CONSTRAINT corporate_stock_transactions_transaction_type_check
  CHECK (transaction_type IN ('Inward', 'Outward', 'Adjustment', 'Transfer'));

-- 3. Indexes to accelerate the new From/To filters in Transaction History
CREATE INDEX IF NOT EXISTS idx_corporate_stock_transactions_from_location
  ON corporate_stock_transactions(from_location);
CREATE INDEX IF NOT EXISTS idx_corporate_stock_transactions_to_location
  ON corporate_stock_transactions(to_location);
CREATE INDEX IF NOT EXISTS idx_corporate_stock_transactions_type_created
  ON corporate_stock_transactions(transaction_type, created_at DESC);
