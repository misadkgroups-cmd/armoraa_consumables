-- ============================================================
-- BILLING LOG MODULE — DATABASE MIGRATION
-- ============================================================

-- 1. Create billing_log table
CREATE TABLE IF NOT EXISTS billing_log (
    id BIGSERIAL PRIMARY KEY,
    bill_no VARCHAR(50) NOT NULL UNIQUE,
    uid VARCHAR(50),
    patient_name VARCHAR(255) NOT NULL,
    rendering_doctor VARCHAR(255),
    referring_doctor VARCHAR(255),
    service_id BIGINT,
    service_name VARCHAR(255),
    service_date DATE NOT NULL,
    branch_id BIGINT NOT NULL,
    consumable_status VARCHAR(20) DEFAULT 'Incomplete',
    consumable_completed_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 2. Create indexes for billing_log
CREATE INDEX IF NOT EXISTS idx_billing_log_bill_no
ON billing_log(bill_no);

CREATE INDEX IF NOT EXISTS idx_billing_log_uid
ON billing_log(uid);

CREATE INDEX IF NOT EXISTS idx_billing_log_service_date
ON billing_log(service_date);

CREATE INDEX IF NOT EXISTS idx_billing_log_branch
ON billing_log(branch_id);

CREATE INDEX IF NOT EXISTS idx_billing_log_status
ON billing_log(consumable_status);

-- 3. Add billing_log_id to billable_report (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'billable_report' 
        AND column_name = 'billing_log_id'
    ) THEN
        ALTER TABLE billable_report 
        ADD COLUMN billing_log_id BIGINT;
    END IF;
END $$;

-- 4. Create foreign key relationship
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE table_name = 'billable_report' 
        AND constraint_name = 'fk_billable_report_billing_log'
    ) THEN
        ALTER TABLE billable_report 
        ADD CONSTRAINT fk_billable_report_billing_log 
        FOREIGN KEY (billing_log_id) 
        REFERENCES billing_log(id) 
        ON DELETE CASCADE;
    END IF;
END $$;

-- 5. Create index on billable_report.billing_log_id for performance
CREATE INDEX IF NOT EXISTS idx_billable_report_billing_log_id
ON billable_report(billing_log_id);

-- 6. Ensure billable_report has index on bill_id (VARCHAR relationship)
CREATE INDEX IF NOT EXISTS idx_billable_report_bill_id
ON billable_report(bill_id);

-- 7. Add comments
COMMENT ON TABLE billing_log IS 'Master billing register - all patient bills';
COMMENT ON COLUMN billing_log.bill_no IS 'Unique bill number, referenced by billable_report.bill_id';
COMMENT ON COLUMN billable_report.billing_log_id IS 'Foreign key to billing_log.id - establishes parent-child relationship';
COMMENT ON COLUMN billable_report.bill_id IS 'Stores bill_no from billing_log as VARCHAR for easy reference';