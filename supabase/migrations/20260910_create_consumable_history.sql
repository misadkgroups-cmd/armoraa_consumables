-- ============================================================================
-- 20260910_create_consumable_history.sql
--
-- Append-only audit trail for every consumable entry made on a bill service:
--   Added   -> a consumable was added to the service
--   Updated -> the quantity of an existing consumable was changed
--   Deleted -> a consumable was removed from the service
--
-- Every save in BillableConsumables.jsx writes one row per changed consumable
-- (see writeConsumableHistory). This lets the Detailed Log "History" modal
-- answer questions like:
--   Who entered the consumables?  When?  Were quantities changed later?
--   Was a NULL/0 quantity saved by the app or introduced during an edit?
--
-- Run this in the Supabase SQL editor (Dashboard -> SQL Editor).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.consumable_history (
  id BIGSERIAL PRIMARY KEY,
  -- Scope: which bill / service / billing-service the entry belongs to
  bill_id BIGINT REFERENCES public.billing_log(id) ON DELETE CASCADE,
  bill_service_id BIGINT,
  service_id BIGINT,
  service_name TEXT,

  -- The consumable that was (or is) on the service
  consumable_id BIGINT,
  consumable_name TEXT,
  product_type TEXT NOT NULL DEFAULT 'Billable'
    CHECK (product_type IN ('Billable', 'Non-Billable')),
  batch_id TEXT,
  units NUMERIC NOT NULL DEFAULT 0,
  old_units NUMERIC,           -- populated on 'Updated' (previous quantity)

  -- What happened & who did it
  action_type TEXT NOT NULL
    CHECK (action_type IN ('Added', 'Updated', 'Deleted')),

  branch_id BIGINT,
  entered_by TEXT DEFAULT 'System',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_consumable_history_bill_service
  ON public.consumable_history(bill_service_id);
CREATE INDEX IF NOT EXISTS idx_consumable_history_bill
  ON public.consumable_history(bill_id);
CREATE INDEX IF NOT EXISTS idx_consumable_history_bill_service_service
  ON public.consumable_history(bill_service_id, service_id);
CREATE INDEX IF NOT EXISTS idx_consumable_history_created
  ON public.consumable_history(created_at);