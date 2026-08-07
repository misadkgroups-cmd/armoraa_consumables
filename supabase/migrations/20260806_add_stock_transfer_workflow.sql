-- ============================================================
-- Migration: Stock Transfer Request -> Receipt workflow
-- ============================================================
-- Replaces the old "immediate stock movement" behaviour with a two-phase flow:
--
--   1. MIS Admin creates a Transfer Request  (status = 'Pending').
--      -> corporate_stock.available_units is decremented (the goods ship out).
--      -> A row is inserted into stock_transfers (status = 'Pending').
--      -> A notification row is inserted for the destination branch (bell).
--      -> The branch stock (billable_stock / non_billable_stock) is NOT touched yet.
--
--   2. The destination branch user confirms receipt.
--      -> ONLY THEN is the branch stock incremented.
--      -> stock_transfers.status becomes 'Received' (received_by / received_at).
--
--   MIS Transaction History shows EVERY transfer (Product / Qty / From / To / Status).
--   A branch user only sees transfers where to_branch = me  OR  from_branch = me.
-- ============================================================

-- 1. Transfer requests (one row per product per transfer)
CREATE TABLE IF NOT EXISTS public.stock_transfers (
    id BIGSERIAL PRIMARY KEY,
    product_id BIGINT NOT NULL,
    product_name TEXT,
    stock_type TEXT,
    quantity NUMERIC,
    from_branch_id BIGINT,        -- NULL => origin is the Corporate Warehouse
    to_branch_id BIGINT,
    status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Received', 'Cancelled')),
    transferred_by TEXT,
    transferred_at TIMESTAMPTZ DEFAULT now(),
    received_by TEXT,
    received_at TIMESTAMPTZ
);

-- 2. Notifications (drives the destination branch's dashboard bell)
CREATE TABLE IF NOT EXISTS public.stock_transfer_notifications (
    id BIGSERIAL PRIMARY KEY,
    transfer_id BIGINT REFERENCES public.stock_transfers(id) ON DELETE CASCADE,
    user_branch_id BIGINT REFERENCES public.branches(id),
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Indexes for branch-wise history and for the unread bell count
CREATE INDEX IF NOT EXISTS idx_stock_transfers_to_branch ON public.stock_transfers (to_branch_id);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_from_branch ON public.stock_transfers (from_branch_id);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_status ON public.stock_transfers (status);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_product_type ON public.stock_transfers (product_id, stock_type);
CREATE INDEX IF NOT EXISTS idx_transfer_notifications_branch_read
    ON public.stock_transfer_notifications (user_branch_id, is_read);
