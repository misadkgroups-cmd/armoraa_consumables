-- ============================================================
-- ARMORAA CLINIC CONSUMABLES — Add cost_unit to master_consumables
-- ============================================================
-- Adds a cost_per_unit column for financial calculations in reports.
-- ============================================================

ALTER TABLE master_consumables
ADD COLUMN IF NOT EXISTS cost_unit NUMERIC(10, 2) DEFAULT 0;