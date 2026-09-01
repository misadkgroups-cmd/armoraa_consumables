-- ============================================================
-- Migration: Auto-confirm old Pending Branch -> Corporate transfers
-- ============================================================
-- Background: Branch -> Corporate transfers used to be created with
-- status 'Pending' and to_branch_id = NULL, and nothing ever confirmed
-- them (no notification exists for the Corporate Warehouse). The app
-- now auto-confirms these immediately (see createMultiLocationTransferRequest
-- in src/services/stockApi.js), so this migration repairs the historical rows:
--
--   1. Adds the shipped quantity back into corporate_stock.available_units.
--   2. Inserts a corporate_stock_transactions 'Inward' audit row.
--   3. Marks the stock_transfers row 'Received' (received_by = 'Auto-Confirm Migration').
--
-- Idempotent: only touches rows still in 'Pending', so re-running is a no-op.
-- ============================================================

DO $$
DECLARE
    tr RECORD;
    new_qty INTEGER;
    branch_label TEXT;
BEGIN
    FOR tr IN
        SELECT id, product_id, product_name, stock_type, quantity, from_branch_id,
               transferred_by, transferred_at
        FROM public.stock_transfers
        WHERE status = 'Pending'
          AND to_branch_id IS NULL          -- destination = Corporate Warehouse
          AND from_branch_id IS NOT NULL    -- source was a real branch
        FOR UPDATE
    LOOP
        -- 1. Add the stock back to the Corporate Warehouse
        UPDATE public.corporate_stock cs
           SET available_units = cs.available_units + tr.quantity,
               updated_at      = now(),
               updated_by      = 'Auto-Confirm Migration'
         WHERE cs.product_id = tr.product_id
           AND cs.stock_type = tr.stock_type;

        SELECT cs.available_units INTO new_qty
          FROM public.corporate_stock cs
         WHERE cs.product_id = tr.product_id
           AND cs.stock_type = tr.stock_type;

        branch_label := 'Branch ' || tr.from_branch_id::TEXT;

        -- 2. Audit row in corporate_stock_transactions
        INSERT INTO public.corporate_stock_transactions
            (product_id, product_name, stock_type, transaction_type, quantity,
             balance_after, remarks, from_location, to_location, created_by, created_at)
        VALUES
            (tr.product_id,
             COALESCE(tr.product_name, ''),
             tr.stock_type,
             'Inward',
             tr.quantity,
             COALESCE(new_qty, 0),
             'Received from ' || branch_label || ' (auto-confirmed migration)',
             branch_label,
             'Corporate Warehouse',
             'Auto-Confirm Migration',
             COALESCE(tr.transferred_at, now()));

        -- 3. Mark the transfer received
        UPDATE public.stock_transfers
           SET status      = 'Received',
               received_by = 'Auto-Confirm Migration',
               received_at = COALESCE(transferred_at, now())
         WHERE id = tr.id;
    END LOOP;
END $$;