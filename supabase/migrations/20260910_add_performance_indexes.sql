-- ============================================================================
-- 20260910_add_performance_indexes.sql
--
-- Performance indexes for frequently searched columns.
--
-- SAFE BY DESIGN:
--   - CREATE INDEX IF NOT EXISTS  -> idempotent, re-runnable
--   - No column changes, no data migration, no effect on existing rows
--   - Only speeds up report loading, bill search and MIS filtering
--
-- Run this in the Supabase SQL editor (Dashboard -> SQL Editor).
-- ============================================================================

-- billable_report: report loading / MIS date filtering
CREATE INDEX IF NOT EXISTS idx_billable_report_report_date
  ON public.billable_report(report_date);

-- billable_report: branch filtering
CREATE INDEX IF NOT EXISTS idx_billable_report_branch_id
  ON public.billable_report(branch_id);

-- billable_report: fast bill-number lookup
CREATE INDEX IF NOT EXISTS idx_billable_report_bill_no
  ON public.billable_report(bill_no);

-- billable_report: per-service report lookups
CREATE INDEX IF NOT EXISTS idx_billable_report_service_id
  ON public.billable_report(service_id);

-- billing_log: fast bill-number search
CREATE INDEX IF NOT EXISTS idx_billing_log_bill_no
  ON public.billing_log(bill_no);

-- billing_log: date-range filtering
CREATE INDEX IF NOT EXISTS idx_billing_log_service_date
  ON public.billing_log(service_date);

-- stock_transactions: branch filtering
CREATE INDEX IF NOT EXISTS idx_stock_transactions_branch_id
  ON public.stock_transactions(branch_id);

-- stock_transactions: chronological history
CREATE INDEX IF NOT EXISTS idx_stock_transactions_created_at
  ON public.stock_transactions(created_at);
