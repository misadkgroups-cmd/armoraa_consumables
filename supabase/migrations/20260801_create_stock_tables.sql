-- ============================================================
-- Migration: Create billable_stock & non_billable_stock tables
--
-- These tables are the SOURCE OF TRUTH for available stock.
--
-- Automatic stock updates:
--   1. Billable Stock:
--      When a billable consumable record is saved in billable_report,
--      billable_stock.available_stock -= consumable_units
--      (Non-billable items in billable_report are NOT deducted here.)
--
--   2. Non-Billable Stock:
--      When a new record is created in non_billable_consumable_registry,
--      non_billable_stock.available_stock -= 1
--      (Each registry record represents one consumable unit issued.)
--
-- stock_transactions is NOT used as a stock source.
-- ============================================================

-- 1. BILLABLE STOCK (source of truth for billable availability)
CREATE TABLE IF NOT EXISTS public.billable_stock (
  id BIGSERIAL PRIMARY KEY,
  consumable_id BIGINT NOT NULL,
  branch_id BIGINT REFERENCES public.branches(id),
  available_stock NUMERIC NOT NULL DEFAULT 0 CHECK (available_stock >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(consumable_id, branch_id)
);

-- 2. NON-BILLABLE STOCK (source of truth for non-billable availability)
CREATE TABLE IF NOT EXISTS public.non_billable_stock (
  id BIGSERIAL PRIMARY KEY,
  consumable_id BIGINT NOT NULL,
  branch_id BIGINT REFERENCES public.branches(id),
  available_stock NUMERIC NOT NULL DEFAULT 0 CHECK (available_stock >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(consumable_id, branch_id)
);

-- 3. INDEXES
CREATE INDEX IF NOT EXISTS idx_billable_stock_consumable ON billable_stock(consumable_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_non_billable_stock_consumable ON non_billable_stock(consumable_id, branch_id);

-- 4. BILLABLE STOCK DEDUCTION TRIGGER
-- Fires after a billable_report row is saved. Loops the 14 consumable slots
-- and deducts units only for billable items (is_non_billable = false).
CREATE OR REPLACE FUNCTION deduct_billable_stock_on_report_save()
RETURNS TRIGGER AS $$
DECLARE
  slot_consumable_id BIGINT;
  slot_units NUMERIC;
  slot_is_non_billable BOOLEAN;
  i INTEGER;
BEGIN
  FOR i IN 1..14 LOOP
    IF i = 1 THEN slot_consumable_id := NEW.consumable_1_id; slot_units := NEW.consumable_1_units; slot_is_non_billable := COALESCE(NEW.is_non_billable_1, false);
    ELSIF i = 2 THEN slot_consumable_id := NEW.consumable_2_id; slot_units := NEW.consumable_2_units; slot_is_non_billable := COALESCE(NEW.is_non_billable_2, false);
    ELSIF i = 3 THEN slot_consumable_id := NEW.consumable_3_id; slot_units := NEW.consumable_3_units; slot_is_non_billable := COALESCE(NEW.is_non_billable_3, false);
    ELSIF i = 4 THEN slot_consumable_id := NEW.consumable_4_id; slot_units := NEW.consumable_4_units; slot_is_non_billable := COALESCE(NEW.is_non_billable_4, false);
    ELSIF i = 5 THEN slot_consumable_id := NEW.consumable_5_id; slot_units := NEW.consumable_5_units; slot_is_non_billable := COALESCE(NEW.is_non_billable_5, false);
    ELSIF i = 6 THEN slot_consumable_id := NEW.consumable_6_id; slot_units := NEW.consumable_6_units; slot_is_non_billable := COALESCE(NEW.is_non_billable_6, false);
    ELSIF i = 7 THEN slot_consumable_id := NEW.consumable_7_id; slot_units := NEW.consumable_7_units; slot_is_non_billable := COALESCE(NEW.is_non_billable_7, false);
    ELSIF i = 8 THEN slot_consumable_id := NEW.consumable_8_id; slot_units := NEW.consumable_8_units; slot_is_non_billable := COALESCE(NEW.is_non_billable_8, false);
    ELSIF i = 9 THEN slot_consumable_id := NEW.consumable_9_id; slot_units := NEW.consumable_9_units; slot_is_non_billable := COALESCE(NEW.is_non_billable_9, false);
    ELSIF i = 10 THEN slot_consumable_id := NEW.consumable_10_id; slot_units := NEW.consumable_10_units; slot_is_non_billable := COALESCE(NEW.is_non_billable_10, false);
    ELSIF i = 11 THEN slot_consumable_id := NEW.consumable_11_id; slot_units := NEW.consumable_11_units; slot_is_non_billable := COALESCE(NEW.is_non_billable_11, false);
    ELSIF i = 12 THEN slot_consumable_id := NEW.consumable_12_id; slot_units := NEW.consumable_12_units; slot_is_non_billable := COALESCE(NEW.is_non_billable_12, false);
    ELSIF i = 13 THEN slot_consumable_id := NEW.consumable_13_id; slot_units := NEW.consumable_13_units; slot_is_non_billable := COALESCE(NEW.is_non_billable_13, false);
    ELSIF i = 14 THEN slot_consumable_id := NEW.consumable_14_id; slot_units := NEW.consumable_14_units; slot_is_non_billable := COALESCE(NEW.is_non_billable_14, false);
    END IF;

    -- Only billable items affect billable_stock.
    -- Non-billable items are excluded here (handled by the registry trigger).
    IF slot_consumable_id IS NOT NULL
       AND NOT slot_is_non_billable
       AND slot_units IS NOT NULL
       AND slot_units > 0 THEN

      -- Ensure a stock row exists, then deduct units.
      INSERT INTO billable_stock (consumable_id, branch_id, available_stock)
      VALUES (slot_consumable_id, NEW.branch_id, 0)
      ON CONFLICT (consumable_id, branch_id) DO NOTHING;

      UPDATE billable_stock
      SET available_stock = GREATEST(0, available_stock - slot_units),
          updated_at = now()
      WHERE consumable_id = slot_consumable_id
        AND branch_id = NEW.branch_id;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_deduct_billable_stock ON public.billable_report;
CREATE TRIGGER trg_deduct_billable_stock
AFTER INSERT ON public.billable_report
FOR EACH ROW
EXECUTE FUNCTION deduct_billable_stock_on_report_save();

-- 5. NON-BILLABLE STOCK DEDUCTION TRIGGER
-- Fires after a registry record is created. Each record = 1 unit issued.
CREATE OR REPLACE FUNCTION deduct_non_billable_stock_on_registry_create()
RETURNS TRIGGER AS $$
BEGIN
  -- Ensure a stock row exists, then deduct 1.
  INSERT INTO non_billable_stock (consumable_id, branch_id, available_stock)
  VALUES (NEW.product_id, NEW.branch_id, 0)
  ON CONFLICT (consumable_id, branch_id) DO NOTHING;

  UPDATE non_billable_stock
  SET available_stock = GREATEST(0, available_stock - 1),
      updated_at = now()
  WHERE consumable_id = NEW.product_id
    AND branch_id = NEW.branch_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_deduct_non_billable_stock ON public.non_billable_consumable_registry;
CREATE TRIGGER trg_deduct_non_billable_stock
AFTER INSERT ON public.non_billable_consumable_registry
FOR EACH ROW
EXECUTE FUNCTION deduct_non_billable_stock_on_registry_create();
