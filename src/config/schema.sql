-- ARMORAA CLINIC CONSUMABLES PORTAL
-- Complete Database Schema

-- Branches table
CREATE TABLE IF NOT EXISTS branches (
    id BIGSERIAL PRIMARY KEY,
    branch_name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Services table
CREATE TABLE IF NOT EXISTS master_services (
    id BIGSERIAL PRIMARY KEY,
    branch_id BIGINT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    service_name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Machinery table
CREATE TABLE IF NOT EXISTS master_machinery (
    id BIGSERIAL PRIMARY KEY,
    branch_id BIGINT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    machine_name TEXT NOT NULL,
    service_id BIGINT NOT NULL REFERENCES master_services(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Master consumables table
CREATE TABLE IF NOT EXISTS master_consumables (
    id BIGSERIAL PRIMARY KEY,
    branch_id BIGINT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    consumable_name TEXT NOT NULL,
    default_unit TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Patient records (billable consumables)
CREATE TABLE IF NOT EXISTS patient_records (
    id BIGSERIAL PRIMARY KEY,
    branch_id BIGINT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    bill_id TEXT NOT NULL,
    uid TEXT NOT NULL,
    service_id BIGINT REFERENCES master_services(id) ON DELETE SET NULL,
    machinery_id BIGINT REFERENCES master_machinery(id) ON DELETE SET NULL,
    consumables_jsonb JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Bulk consumables registry (non-billable)
CREATE TABLE IF NOT EXISTS bulk_consumables_registry (
    id BIGSERIAL PRIMARY KEY,
    branch_id BIGINT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    product_name TEXT NOT NULL,
    batch_id TEXT,
    open_date TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    closing_date TIMESTAMP WITH TIME ZONE,
    status TEXT NOT NULL DEFAULT 'Active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- User profiles table for branch-based authentication
CREATE TABLE IF NOT EXISTS profiles (
    id BIGSERIAL PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE,
    branch_id BIGINT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    full_name TEXT,
    role TEXT DEFAULT 'user',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_master_services_branch ON master_services(branch_id);
CREATE INDEX IF NOT EXISTS idx_master_machinery_branch ON master_machinery(branch_id);
CREATE INDEX IF NOT EXISTS idx_master_consumables_branch ON master_consumables(branch_id);
CREATE INDEX IF NOT EXISTS idx_patient_records_branch ON patient_records(branch_id);
CREATE INDEX IF NOT EXISTS idx_bulk_consumables_branch ON bulk_consumables_registry(branch_id);
CREATE INDEX IF NOT EXISTS idx_bulk_consumables_status ON bulk_consumables_registry(status);
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_branch ON profiles(branch_id);