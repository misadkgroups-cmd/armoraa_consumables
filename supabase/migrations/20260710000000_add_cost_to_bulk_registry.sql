-- Add cost_unit column to bulk_consumables_registry for non-billable consumables
ALTER TABLE bulk_consumables_registry
ADD COLUMN IF NOT EXISTS cost_unit NUMERIC(10, 2) DEFAULT 0;