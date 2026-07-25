-- ============================================================
-- Migration: Add ON DELETE CASCADE to billing-related FKs
-- Fixes: "update or delete on table billing_log violates
--         foreign key constraint bill_services_bill_id_fkey
--         on table bill_services"
--
-- With ON DELETE CASCADE, deleting a billing_log record
-- automatically removes all child records in the correct
-- order: billable_report → bill_services → bill_service_consumables
-- and bill_history, eliminating manual multi-step deletes.
-- ============================================================

-- 1. bill_services → billing_log
--    (the constraint mentioned in the error message)
ALTER TABLE IF EXISTS public.bill_services
  DROP CONSTRAINT IF EXISTS bill_services_bill_id_fkey;

ALTER TABLE IF EXISTS public.bill_services
  ADD CONSTRAINT bill_services_bill_id_fkey
  FOREIGN KEY (bill_id)
  REFERENCES public.billing_log(id)
  ON DELETE CASCADE;

-- Drop existing FK and add billing_log_id FK if column exists
ALTER TABLE IF EXISTS public.bill_services
  DROP CONSTRAINT IF EXISTS bill_services_billing_log_id_fkey;

ALTER TABLE IF EXISTS public.bill_services
  ADD CONSTRAINT bill_services_billing_log_id_fkey
  FOREIGN KEY (billing_log_id)
  REFERENCES public.billing_log(id)
  ON DELETE CASCADE;

-- 2. bill_service_consumables → bill_services
--    (prevents bill_services deletion from failing when
--     bill_service_consumables rows still exist)
ALTER TABLE IF EXISTS public.bill_service_consumables
  DROP CONSTRAINT IF EXISTS bill_service_consumables_bill_service_id_fkey;

ALTER TABLE IF EXISTS public.bill_service_consumables
  ADD CONSTRAINT bill_service_consumables_bill_service_id_fkey
  FOREIGN KEY (bill_service_id)
  REFERENCES public.bill_services(id)
  ON DELETE CASCADE;

-- 3. billable_report → billing_log
--    (so deleting a bill also removes its report rows)
ALTER TABLE IF EXISTS public.billable_report
  DROP CONSTRAINT IF EXISTS billable_report_billing_log_id_fkey;

ALTER TABLE IF EXISTS public.billable_report
  ADD CONSTRAINT billable_report_billing_log_id_fkey
  FOREIGN KEY (billing_log_id)
  REFERENCES public.billing_log(id)
  ON DELETE CASCADE;

-- 4. bill_history → billing_log
--    (so deleting a bill also removes its history rows)
ALTER TABLE IF EXISTS public.bill_history
  DROP CONSTRAINT IF EXISTS bill_history_bill_id_fkey;

ALTER TABLE IF EXISTS public.bill_history
  ADD CONSTRAINT bill_history_bill_id_fkey
  FOREIGN KEY (bill_id)
  REFERENCES public.billing_log(id)
  ON DELETE CASCADE;

-- 5. bill_services → billable_report
--    (so deleting a billable_report doesn't fail when
--     bill_services rows reference it via billable_report_id)
ALTER TABLE IF EXISTS public.bill_services
  DROP CONSTRAINT IF EXISTS bill_services_billable_report_id_fkey;

ALTER TABLE IF EXISTS public.bill_services
  ADD CONSTRAINT bill_services_billable_report_id_fkey
  FOREIGN KEY (billable_report_id)
  REFERENCES public.billable_report(id)
  ON DELETE CASCADE;
