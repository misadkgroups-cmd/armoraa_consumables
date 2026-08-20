-- ============================================================
-- Backfill baseline audit logs for pre-existing bills
-- ------------------------------------------------------------
-- Older bills were created before the Audit Trail feature existed, so
-- they have no rows in `bill_history` / `activity_logs`. This one-time
-- migration inserts baseline audit rows so the Audit Trail shows each
-- bill's TRUE creation and completion timestamps instead of falling back
-- to (or duplicating) updated_at / current system time.
--
-- IMPORTANT — schema notes (production schema = supabase/schema.sql):
--   billing_log.created_by / updated_by  -> BIGINT (users.id)  [NOT a name]
--   billing_log has NO `completed_at` column -> completion time is taken
--        from `updated_at` (the column bumped when the bill was marked Complete)
--   bill_history  -> (bill_id, username, action_type CHECK
--                     ('CREATE','UPDATE','DELETE','STATUS_CHANGE'),
--                     field_name, old_value, new_value, created_at)
--                   THIS is the per-bill audit trail the AuditTimelineModal
--                   reads via getBillHistory(billId).
--   activity_logs -> (username, branch_name, page_name, action, remarks,
--                     created_at)   [page-level; NO record_id column]
--
-- The task spec's example SQL referenced activity_logs columns that do not
-- exist in the deployed schema (record_id, module_name, activity_type,
-- description, created_by). This migration adapts that intent to the real
-- column names: the authoritative per-bill baseline is written to
-- `bill_history`, and page-level mirrors are written to `activity_logs`
-- (using its real columns) so the dashboard KPIs stay accurate.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------------
-- 1. Backfill Creation logs (bill_history) for bills with no CREATE row.
--    Timestamp = billing_log.created_at  (the TRUE creation time).
--    This guarantees the Created timeline marker is the real one so the
--    frontend fallback never has to synthesize it for these bills.
-- ------------------------------------------------------------------
INSERT INTO bill_history (bill_id, username, action_type, field_name, old_value, new_value, created_at)
SELECT
    b.id AS bill_id,
    COALESCE(u_created.username, 'System') AS username,
    'CREATE' AS action_type,
    'bill' AS field_name,
    NULL AS old_value,
    'Bill created' AS new_value,
    b.created_at AS created_at
FROM billing_log b
LEFT JOIN users u_created ON u_created.id = b.created_by
WHERE NOT EXISTS (
    SELECT 1 FROM bill_history bh
    WHERE bh.bill_id = b.id
      AND bh.action_type = 'CREATE'
);

-- ------------------------------------------------------------------
-- 2. Backfill Completion logs (bill_history) for Complete bills with no
--    STATUS_CHANGE row. Timestamp = billing_log.updated_at (the moment the
--    bill was marked Complete in the source system). 'STATUS_CHANGE' is a
--    valid action_type for bill_history (audit_logs CHECK rejects it, which
--    is why bill_history is the correct target here).
-- ------------------------------------------------------------------
INSERT INTO bill_history (bill_id, username, action_type, field_name, old_value, new_value, created_at)
SELECT
    b.id AS bill_id,
    COALESCE(u_updated.username, 'System') AS username,
    'STATUS_CHANGE' AS action_type,
    'bill_status' AS field_name,
    'Incomplete' AS old_value,
    'Complete' AS new_value,
    b.updated_at AS created_at
FROM billing_log b
WHERE b.bill_status = 'Complete'
  AND NOT EXISTS (
    SELECT 1 FROM bill_history bh
    WHERE bh.bill_id = b.id
      AND bh.action_type = 'STATUS_CHANGE'
  );

-- ------------------------------------------------------------------
-- 3. Mirror page-level entries into activity_logs for dashboard KPIs
--    (bills created / status-changed). Uses the real production columns.
--    Idempotent: guarded by NOT EXISTS on the per-bill timestamp.
-- ------------------------------------------------------------------
INSERT INTO activity_logs (username, branch_name, page_name, action, remarks, created_at)
SELECT
    COALESCE(u_created.username, 'System') AS username,
    'System' AS branch_name,
    'billing_log' AS page_name,
    'created' AS action,
    'Bill created' AS remarks,
    b.created_at AS created_at
FROM billing_log b
LEFT JOIN users u_created ON u_created.id = b.created_by
WHERE NOT EXISTS (
    SELECT 1 FROM activity_logs al
    WHERE al.page_name = 'billing_log'
      AND al.action = 'created'
      AND al.created_at = b.created_at
);

INSERT INTO activity_logs (username, branch_name, page_name, action, remarks, created_at)
SELECT
    COALESCE(u_updated.username, 'System') AS username,
    'System' AS branch_name,
    'billing_log' AS page_name,
    'status_changed' AS action,
    'Bill marked as Complete' AS remarks,
    b.updated_at AS created_at
FROM billing_log b
WHERE b.bill_status = 'Complete'
  AND NOT EXISTS (
    SELECT 1 FROM activity_logs al
    WHERE al.page_name = 'billing_log'
      AND al.action = 'status_changed'
      AND al.created_at = b.updated_at
);

-- ------------------------------------------------------------------
-- 4. Verification queries (run after migration, do not execute blindly):
--
--    -- Bills created with no baseline Created history (should be 0):
--    SELECT b.id, b.bill_no, b.created_at
--    FROM billing_log b
--    WHERE NOT EXISTS (SELECT 1 FROM bill_history bh WHERE bh.bill_id = b.id AND bh.action_type = 'CREATE');
--
--    -- Complete bills with no baseline Completion history (should be 0):
--    SELECT b.id, b.bill_no, b.bill_status, b.updated_at
--    FROM billing_log b
--    WHERE b.bill_status = 'Complete'
--      AND NOT EXISTS (SELECT 1 FROM bill_history bh WHERE bh.bill_id = b.id AND bh.action_type = 'STATUS_CHANGE');
-- ------------------------------------------------------------------

COMMIT;
