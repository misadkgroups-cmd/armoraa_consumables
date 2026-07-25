-- ============================================================
-- CORPORATE STOCK MANAGEMENT
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. CORPORATE STOCK (Central warehouse inventory)
CREATE TABLE IF NOT EXISTS public.corporate_stock (
  id BIGSERIAL PRIMARY KEY,
  product_id BIGINT NOT NULL,
  product_name TEXT NOT NULL,
  stock_type TEXT NOT NULL CHECK (stock_type IN ('Billable', 'Non-Billable')),
  available_units INTEGER NOT NULL DEFAULT 0 CHECK (available_units >= 0),
  minimum_units INTEGER NOT NULL DEFAULT 10 CHECK (minimum_units >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT DEFAULT 'System',
  updated_by TEXT DEFAULT 'System',
  UNIQUE(product_id, stock_type)
);

-- 2. CORPORATE STOCK TRANSACTIONS
CREATE TABLE IF NOT EXISTS public.corporate_stock_transactions (
  id BIGSERIAL PRIMARY KEY,
  product_id BIGINT NOT NULL,
  product_name TEXT NOT NULL,
  stock_type TEXT NOT NULL CHECK (stock_type IN ('Billable', 'Non-Billable')),
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('Inward', 'Outward', 'Adjustment')),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  balance_after INTEGER NOT NULL CHECK (balance_after >= 0),
  remarks TEXT,
  created_by TEXT NOT NULL DEFAULT 'System',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. INDEXES
CREATE INDEX IF NOT EXISTS idx_corporate_stock_product ON corporate_stock(product_id, stock_type);
CREATE INDEX IF NOT EXISTS idx_corporate_stock_transactions_product ON corporate_stock_transactions(product_id, stock_type);
CREATE INDEX IF NOT EXISTS idx_corporate_stock_transactions_created_at ON corporate_stock_transactions(created_at);

-- 4. ENABLE ROW LEVEL SECURITY
ALTER TABLE corporate_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE corporate_stock_transactions ENABLE ROW LEVEL SECURITY;

-- 5. POLICIES (Allow all authenticated users to read, only MIS can modify)
CREATE POLICY "Allow authenticated read access" ON corporate_stock
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Allow MIS insert" ON corporate_stock
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Allow MIS update" ON corporate_stock
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated read access" ON corporate_stock_transactions
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated insert" ON corporate_stock_transactions
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');