-- ============================================================
-- Create audit tables: audit_logs, activity_logs, bill_history
-- ------------------------------------------------------------
-- Matches the PRODUCTION schema (supabase/schema.sql) column-for-column:
--   audit_logs    -> username, branch_name, module_name, action_type (CHECK
--                    CREATE/UPDATE/DELETE), table_name, record_id,
--                    old_data JSONB, new_data JSONB, created_at
--   activity_logs -> username, branch_name, page_name, action, remarks, created_at
--   bill_history  -> bill_id FK, username, action_type (CHECK
--                    CREATE/UPDATE/DELETE/STATUS_CHANGE), field_name,
--                    old_value, new_value, created_at
--
-- The previous version of this migration used obsolete column names
-- (performed_by, module_name, activity_type, etc.) that diverged from the
-- production schema and broke the audit-trail code. This rewrite brings the
-- migration in sync with schema.sql so a fresh DB install gets the correct
-- columns.
-- ============================================================

-- 20. AUDIT LOGS (field-level changes for any audited table/record)
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id BIGSERIAL PRIMARY KEY,
  username TEXT NOT NULL,
  branch_name TEXT,
  module_name TEXT NOT NULL,
  action_type TEXT NOT NULL CHECK (action_type IN ('CREATE', 'UPDATE', 'DELETE')),
  table_name TEXT NOT NULL,
  record_id BIGINT NOT NULL,
  old_data JSONB,
  new_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_record ON audit_logs(table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_branch ON audit_logs(branch_name);

-- 21. ACTIVITY LOGS (page-level activity / KPIs)
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id BIGSERIAL PRIMARY KEY,
  username TEXT NOT NULL,
  branch_name TEXT,
  page_name TEXT NOT NULL,
  action TEXT NOT NULL,
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_activity_logs_branch ON activity_logs(branch_name);

-- 22. BILL HISTORY (per-bill lifecycle audit trail)
-- This is the authoritative source for the Audit Trail modal.
-- action_type CHECK includes 'STATUS_CHANGE' for completion events.
CREATE TABLE IF NOT EXISTS public.bill_history (
  id BIGSERIAL PRIMARY KEY,
  bill_id BIGINT NOT NULL REFERENCES public.billing_log(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  action_type TEXT NOT NULL CHECK (action_type IN ('CREATE', 'UPDATE', 'DELETE', 'STATUS_CHANGE')),
  field_name TEXT,
  old_value TEXT,
  new_value TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bill_history_bill_id ON bill_history(bill_id);
CREATE INDEX IF NOT EXISTS idx_bill_history_created_at ON bill_history(created_at);

-- Table comments
COMMENT ON TABLE public.audit_logs IS 'Tracks field-level changes for all audited tables';
COMMENT ON TABLE public.activity_logs IS 'Tracks module-level activities and events';
COMMENT ON TABLE public.bill_history IS 'Per-bill lifecycle audit trail (Create, Update, Delete, Status Change)';
