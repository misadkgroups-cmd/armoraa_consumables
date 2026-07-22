-- ============================================================
-- ARMORAA CLINIC - COMPLETE DATABASE SCHEMA
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- 1. BRANCHES
CREATE TABLE IF NOT EXISTS public.branches (
  id BIGSERIAL PRIMARY KEY,
  branch_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. USERS
CREATE TABLE IF NOT EXISTS public.users (
  id BIGSERIAL PRIMARY KEY,
  username TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('Manager', 'Case Manager', 'Pharmacist', 'MIS')),
  branch_id BIGINT REFERENCES public.branches(id),
  status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive')),
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_active BOOLEAN NOT NULL DEFAULT true
);

-- 3. USER SESSIONS
CREATE TABLE IF NOT EXISTS public.user_sessions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES public.users(id),
  login_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  logout_time TIMESTAMPTZ,
  ip_address TEXT,
  device_info TEXT,
  session_token TEXT UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. PROFILES (linked to Supabase Auth)
CREATE TABLE IF NOT EXISTS public.profiles (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  branch_id BIGINT REFERENCES public.branches(id),
  email TEXT,
  full_name TEXT
);

-- 5. MASTER DOCTORS
CREATE TABLE IF NOT EXISTS public.master_doctors (
  id BIGSERIAL PRIMARY KEY,
  doctor_name TEXT NOT NULL,
  branch_id BIGINT NOT NULL REFERENCES public.branches(id),
  status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT DEFAULT 'System',
  deleted_by TEXT,
  deleted_at TIMESTAMPTZ
);

-- 6. MASTER STAFF
CREATE TABLE IF NOT EXISTS public.master_staff (
  id BIGSERIAL PRIMARY KEY,
  staff_name TEXT NOT NULL,
  branch_id BIGINT NOT NULL REFERENCES public.branches(id),
  status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT DEFAULT 'System',
  deleted_by TEXT,
  deleted_at TIMESTAMPTZ
);

-- 7. MASTER SERVICES
CREATE TABLE IF NOT EXISTS public.master_services (
  id BIGSERIAL PRIMARY KEY,
  service_name TEXT NOT NULL,
  branch_id BIGINT REFERENCES public.branches(id),
  status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT DEFAULT 'System',
  deleted_by TEXT,
  deleted_at TIMESTAMPTZ
);

-- 8. MASTER MACHINERY
CREATE TABLE IF NOT EXISTS public.master_machinery (
  id BIGSERIAL PRIMARY KEY,
  machine_name TEXT NOT NULL,
  service_id BIGINT REFERENCES public.master_services(id),
  branch_id BIGINT NOT NULL REFERENCES public.branches(id),
  status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT DEFAULT 'System',
  deleted_by TEXT,
  deleted_at TIMESTAMPTZ
);

-- 9. MASTER BILLABLE CONSUMABLES
CREATE TABLE IF NOT EXISTS public.master_billable_consumables (
  id BIGSERIAL PRIMARY KEY,
  product_name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'piece',
  cost_unit NUMERIC DEFAULT 0,
  minimum_stock INTEGER NOT NULL DEFAULT 10 CHECK (minimum_stock >= 0),
  branch_id BIGINT REFERENCES public.branches(id),
  status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT DEFAULT 'System',
  deleted_by TEXT,
  deleted_at TIMESTAMPTZ
);

-- 10. MASTER NON-BILLABLE CONSUMABLES
CREATE TABLE IF NOT EXISTS public.master_non_billable_consumables (
  id BIGSERIAL PRIMARY KEY,
  product_name TEXT NOT NULL,
  quantity_type TEXT NOT NULL DEFAULT 'packet',
  cost NUMERIC DEFAULT 0,
  minimum_stock INTEGER NOT NULL DEFAULT 10 CHECK (minimum_stock >= 0),
  branch_id BIGINT REFERENCES public.branches(id),
  status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT DEFAULT 'System',
  deleted_by TEXT,
  deleted_at TIMESTAMPTZ
);

-- 11. MASTER CONSUMABLES (legacy/general)
CREATE TABLE IF NOT EXISTS public.master_consumables (
  id BIGSERIAL PRIMARY KEY,
  consumable_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 12. SERVICE CONSUMABLES (mapping)
CREATE TABLE IF NOT EXISTS public.service_consumables (
  id BIGSERIAL PRIMARY KEY,
  service_id BIGINT NOT NULL REFERENCES public.master_services(id),
  product_type TEXT NOT NULL CHECK (product_type IN ('Billable', 'Non-Billable')),
  consumable_id BIGINT NOT NULL,
  required_quantity INTEGER NOT NULL DEFAULT 1 CHECK (required_quantity > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT DEFAULT 'System'
);

-- 13. BILLING LOG
CREATE TABLE IF NOT EXISTS public.billing_log (
  id BIGSERIAL PRIMARY KEY,
  bill_no TEXT NOT NULL,
  uid TEXT,
  patient_name TEXT NOT NULL,
  doctor_id BIGINT REFERENCES public.master_doctors(id),
  staff_id BIGINT REFERENCES public.master_staff(id),
  service_date DATE NOT NULL,
  branch_id BIGINT NOT NULL REFERENCES public.branches(id),
  bill_status TEXT NOT NULL DEFAULT 'Incomplete' CHECK (bill_status IN ('Complete', 'Incomplete')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by BIGINT REFERENCES public.users(id),
  updated_by BIGINT REFERENCES public.users(id),
  deleted_by BIGINT REFERENCES public.users(id),
  deleted_at TIMESTAMPTZ
);

-- 14. BILL SERVICES - Service-level consumable completion tracking
CREATE TABLE IF NOT EXISTS public.bill_services (
  id BIGSERIAL PRIMARY KEY,
  bill_id BIGINT NOT NULL REFERENCES public.billing_log(id),
  service_id BIGINT NOT NULL REFERENCES public.master_services(id),
  service_name TEXT NOT NULL,
  service_status TEXT NOT NULL DEFAULT 'Pending' CHECK (service_status IN ('Pending', 'Complete')),
  consumable_completed BOOLEAN NOT NULL DEFAULT false,
  billable_report_id BIGINT REFERENCES public.billable_report(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by BIGINT REFERENCES public.users(id),
  deleted_by BIGINT REFERENCES public.users(id),
  deleted_at TIMESTAMPTZ
);

-- 15. BILL SERVICE CONSUMABLES
CREATE TABLE IF NOT EXISTS public.bill_service_consumables (
  id BIGSERIAL PRIMARY KEY,
  bill_service_id BIGINT NOT NULL REFERENCES public.bill_services(id),
  product_type TEXT NOT NULL CHECK (product_type IN ('Billable', 'Non-Billable')),
  consumable_id BIGINT NOT NULL,
  required_quantity INTEGER NOT NULL DEFAULT 1 CHECK (required_quantity > 0),
  used_quantity INTEGER NOT NULL DEFAULT 0 CHECK (used_quantity >= 0),
  status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Used')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by BIGINT REFERENCES public.users(id),
  deleted_by BIGINT REFERENCES public.users(id),
  deleted_at TIMESTAMPTZ
);

-- 16. BILLABLE REPORT (main transaction table)
CREATE TABLE IF NOT EXISTS public.billable_report (
  id BIGSERIAL PRIMARY KEY,
  bill_id TEXT,
  bill_no TEXT,
  report_date DATE NOT NULL,
  branch_id BIGINT REFERENCES public.branches(id),
  service_id BIGINT REFERENCES public.master_services(id),
  machinery_id BIGINT REFERENCES public.master_machinery(id),
  service_name TEXT,
  machine_name TEXT,
  doctor_name TEXT,
  staff_name TEXT,
  patient_name TEXT,
  uid TEXT,
  updated_by TEXT,
  -- 14 consumable slots
  consumable_1_id BIGINT, consumable_1_units NUMERIC, is_non_billable_1 BOOLEAN DEFAULT false, non_billable_registry_id_1 BIGINT, consumable_1_batch_id TEXT,
  consumable_2_id BIGINT, consumable_2_units NUMERIC, is_non_billable_2 BOOLEAN DEFAULT false, non_billable_registry_id_2 BIGINT, consumable_2_batch_id TEXT,
  consumable_3_id BIGINT, consumable_3_units NUMERIC, is_non_billable_3 BOOLEAN DEFAULT false, non_billable_registry_id_3 BIGINT, consumable_3_batch_id TEXT,
  consumable_4_id BIGINT, consumable_4_units NUMERIC, is_non_billable_4 BOOLEAN DEFAULT false, non_billable_registry_id_4 BIGINT, consumable_4_batch_id TEXT,
  consumable_5_id BIGINT, consumable_5_units NUMERIC, is_non_billable_5 BOOLEAN DEFAULT false, non_billable_registry_id_5 BIGINT, consumable_5_batch_id TEXT,
  consumable_6_id BIGINT, consumable_6_units NUMERIC, is_non_billable_6 BOOLEAN DEFAULT false, non_billable_registry_id_6 BIGINT, consumable_6_batch_id TEXT,
  consumable_7_id BIGINT, consumable_7_units NUMERIC, is_non_billable_7 BOOLEAN DEFAULT false, non_billable_registry_id_7 BIGINT, consumable_7_batch_id TEXT,
  consumable_8_id BIGINT, consumable_8_units NUMERIC, is_non_billable_8 BOOLEAN DEFAULT false, non_billable_registry_id_8 BIGINT, consumable_8_batch_id TEXT,
  consumable_9_id BIGINT, consumable_9_units NUMERIC, is_non_billable_9 BOOLEAN DEFAULT false, non_billable_registry_id_9 BIGINT, consumable_9_batch_id TEXT,
  consumable_10_id BIGINT, consumable_10_units NUMERIC, is_non_billable_10 BOOLEAN DEFAULT false, non_billable_registry_id_10 BIGINT, consumable_10_batch_id TEXT,
  consumable_11_id BIGINT, consumable_11_units NUMERIC, is_non_billable_11 BOOLEAN DEFAULT false, non_billable_registry_id_11 BIGINT, consumable_11_batch_id TEXT,
  consumable_12_id BIGINT, consumable_12_units NUMERIC, is_non_billable_12 BOOLEAN DEFAULT false, non_billable_registry_id_12 BIGINT, consumable_12_batch_id TEXT,
  consumable_13_id BIGINT, consumable_13_units NUMERIC, is_non_billable_13 BOOLEAN DEFAULT false, non_billable_registry_id_13 BIGINT, consumable_13_batch_id TEXT,
  consumable_14_id BIGINT, consumable_14_units NUMERIC, is_non_billable_14 BOOLEAN DEFAULT false, non_billable_registry_id_14 BIGINT, consumable_14_batch_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add billing_log_id column to billable_report for proper FK relationship
ALTER TABLE IF EXISTS public.billable_report
ADD COLUMN IF NOT EXISTS billing_log_id BIGINT REFERENCES public.billing_log(id);

-- 17. NON-BILLABLE CONSUMABLE REGISTRY
CREATE TABLE IF NOT EXISTS public.non_billable_consumable_registry (
  id BIGSERIAL PRIMARY KEY,
  branch_id BIGINT REFERENCES public.branches(id),
  product_id BIGINT REFERENCES public.master_non_billable_consumables(id),
  batch_id TEXT,
  opening_date DATE,
  closing_date DATE,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 18. STOCK INVENTORY
CREATE TABLE IF NOT EXISTS public.stock_inventory (
  id BIGSERIAL PRIMARY KEY,
  product_type TEXT NOT NULL CHECK (product_type IN ('Billable', 'Non-Billable')),
  consumable_id BIGINT NOT NULL,
  branch_id BIGINT NOT NULL REFERENCES public.branches(id),
  current_stock INTEGER NOT NULL DEFAULT 0 CHECK (current_stock >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT DEFAULT 'System',
  deleted_by TEXT,
  deleted_at TIMESTAMPTZ
);

-- 19. STOCK TRANSACTIONS
CREATE TABLE IF NOT EXISTS public.stock_transactions (
  id BIGSERIAL PRIMARY KEY,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('Inward', 'Outward', 'Transfer', 'Adjustment')),
  product_type TEXT NOT NULL CHECK (product_type IN ('Billable', 'Non-Billable')),
  consumable_id BIGINT NOT NULL,
  branch_id BIGINT NOT NULL REFERENCES public.branches(id),
  quantity INTEGER NOT NULL CHECK (quantity <> 0),
  remarks TEXT,
  created_by TEXT NOT NULL DEFAULT 'System',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT,
  deleted_by TEXT,
  deleted_at TIMESTAMPTZ
);

-- 20. AUDIT LOGS
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

-- 21. ACTIVITY LOGS
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id BIGSERIAL PRIMARY KEY,
  username TEXT NOT NULL,
  branch_name TEXT,
  page_name TEXT NOT NULL,
  action TEXT NOT NULL,
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 22. BILL HISTORY
CREATE TABLE IF NOT EXISTS public.bill_history (
  id BIGSERIAL PRIMARY KEY,
  bill_id BIGINT NOT NULL REFERENCES public.billing_log(id),
  username TEXT NOT NULL,
  action_type TEXT NOT NULL CHECK (action_type IN ('CREATE', 'UPDATE', 'DELETE', 'STATUS_CHANGE')),
  field_name TEXT,
  old_value TEXT,
  new_value TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 23. SYSTEM SETTINGS
CREATE TABLE IF NOT EXISTS public.system_settings (
  id BIGSERIAL PRIMARY KEY,
  setting_key TEXT NOT NULL UNIQUE,
  setting_value TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 24. REPORT AUDIT LOG
CREATE TABLE IF NOT EXISTS public.report_audit_log (
  id BIGSERIAL PRIMARY KEY,
  report_id BIGINT,
  bill_id TEXT,
  updated_by TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  previous_value JSONB,
  new_value JSONB,
  changed_fields JSONB
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_billable_report_branch ON billable_report(branch_id);
CREATE INDEX IF NOT EXISTS idx_billable_report_date ON billable_report(report_date);
CREATE INDEX IF NOT EXISTS idx_billing_log_branch ON billing_log(branch_id);
CREATE INDEX IF NOT EXISTS idx_billing_log_service_date ON billing_log(service_date);
CREATE INDEX IF NOT EXISTS idx_bill_services_bill_id ON bill_services(bill_id);
CREATE INDEX IF NOT EXISTS idx_bill_services_consumable_completed ON bill_services(consumable_completed);
CREATE INDEX IF NOT EXISTS idx_stock_inventory_branch ON stock_inventory(branch_id);
CREATE INDEX IF NOT EXISTS idx_stock_inventory_consumable ON stock_inventory(consumable_id, product_type);
CREATE INDEX IF NOT EXISTS idx_stock_transactions_consumable ON stock_transactions(consumable_id, product_type, branch_id);
CREATE INDEX IF NOT EXISTS idx_stock_transactions_created_at ON stock_transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_bill_history_bill_id ON bill_history(bill_id);
CREATE INDEX IF NOT EXISTS idx_master_billable_consumables_branch ON master_billable_consumables(branch_id);
CREATE INDEX IF NOT EXISTS idx_master_non_billable_consumables_branch ON master_non_billable_consumables(branch_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_active ON user_sessions(user_id, is_active);