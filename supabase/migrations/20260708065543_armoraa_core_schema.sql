-- ============================================================
-- ARMORAA CLINIC CONSUMABLES — Core Database Schema
-- ============================================================
-- This migration creates the multi-branch schema for the
-- ARMORAA Clinic Consumables portal.
-- ============================================================

-- 1. BRANCHES
-- Stores clinic branches (e.g., "Main Branch", "Anna Nagar", "Adyar")
CREATE TABLE IF NOT EXISTS branches (
    id          BIGINT  GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    branch_name TEXT    NOT NULL UNIQUE,
    created_at  TIMESTAMPTZ DEFAULT now()
);

-- 2. MASTER SERVICES
-- Services offered at each branch (e.g., "ICU", "OPD", "Radiology")
CREATE TABLE IF NOT EXISTS master_services (
    id           BIGINT  GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    branch_id    BIGINT  NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    service_name TEXT    NOT NULL
);

-- 3. MASTER MACHINERY
-- Machines linked to a specific service within a branch
CREATE TABLE IF NOT EXISTS master_machinery (
    id           BIGINT  GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    branch_id    BIGINT  NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    service_id   BIGINT  NOT NULL REFERENCES master_services(id) ON DELETE CASCADE,
    machine_name TEXT    NOT NULL
);

-- 4. MASTER CONSUMABLES
-- Consumable items tracked per branch (e.g., "Saline 500ml", "Gloves")
CREATE TABLE IF NOT EXISTS master_consumables (
    id              BIGINT  GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    branch_id       BIGINT  NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    consumable_name TEXT    NOT NULL,
    default_unit    TEXT    NOT NULL
);

-- 5. PATIENT RECORDS (Page 1 — Billable Consumables Data Entry)
-- Stores the billable consumables state per patient visit.
-- The unique constraint on (branch_id, bill_id, uid) ensures
-- the automated background UPSERT handles duplicates correctly.
CREATE TABLE IF NOT EXISTS patient_records (
    id                BIGINT  GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    branch_id         BIGINT  NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    bill_id           TEXT    NOT NULL,
    uid               TEXT    NOT NULL,
    service_id        BIGINT  REFERENCES master_services(id),
    machinery_id      BIGINT  REFERENCES master_machinery(id),
    consumables_jsonb JSONB   DEFAULT '{}'::jsonb,
    created_at        TIMESTAMPTZ DEFAULT now(),
    UNIQUE (branch_id, bill_id, uid)
);

-- 6. BULK CONSUMABLES REGISTRY (Page 2 — Non-Billable Master Log)
-- Tracks bulk / non-billable consumable items with batch tracking.
CREATE TABLE IF NOT EXISTS bulk_consumables_registry (
    id            BIGINT  GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    branch_id     BIGINT  NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    product_name  TEXT    NOT NULL,
    batch_id      TEXT    NOT NULL,
    open_date     TIMESTAMPTZ DEFAULT now(),
    closing_date  TIMESTAMPTZ,
    status        TEXT    DEFAULT 'Active'
);

-- ============================================================
-- INDEXES
-- ============================================================
-- Speed up lookups by branch_id on all child tables
CREATE INDEX IF NOT EXISTS idx_master_services_branch_id       ON master_services(branch_id);
CREATE INDEX IF NOT EXISTS idx_master_machinery_branch_id      ON master_machinery(branch_id);
CREATE INDEX IF NOT EXISTS idx_master_machinery_service_id     ON master_machinery(service_id);
CREATE INDEX IF NOT EXISTS idx_master_consumables_branch_id    ON master_consumables(branch_id);
CREATE INDEX IF NOT EXISTS idx_patient_records_branch_id       ON patient_records(branch_id);
CREATE INDEX IF NOT EXISTS idx_patient_records_bill_id         ON patient_records(bill_id);
CREATE INDEX IF NOT EXISTS idx_patient_records_uid             ON patient_records(uid);
CREATE INDEX IF NOT EXISTS idx_bulk_consumables_branch_id      ON bulk_consumables_registry(branch_id);