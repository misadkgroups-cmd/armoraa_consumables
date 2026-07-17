-- ============================================================
-- BILLING LOG ENHANCEMENT — DOCTORS & STAFF MASTER
-- ============================================================

-- 1. Create master_doctors table
CREATE TABLE IF NOT EXISTS master_doctors (
    id BIGSERIAL PRIMARY KEY,
    doctor_name VARCHAR(255) NOT NULL,
    branch_id BIGINT NOT NULL,
    status VARCHAR(20) DEFAULT 'Active',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 2. Create master_staff table
CREATE TABLE IF NOT EXISTS master_staff (
    id BIGSERIAL PRIMARY KEY,
    staff_name VARCHAR(255) NOT NULL,
    branch_id BIGINT NOT NULL,
    status VARCHAR(20) DEFAULT 'Active',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 3. Foreign key: master_doctors -> branches
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name = 'master_doctors'
        AND constraint_name = 'fk_doctor_branch'
    ) THEN
        ALTER TABLE master_doctors
        ADD CONSTRAINT fk_doctor_branch
        FOREIGN KEY (branch_id)
        REFERENCES branches(id);
    END IF;
END $$;

-- 4. Foreign key: master_staff -> branches
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name = 'master_staff'
        AND constraint_name = 'fk_staff_branch'
    ) THEN
        ALTER TABLE master_staff
        ADD CONSTRAINT fk_staff_branch
        FOREIGN KEY (branch_id)
        REFERENCES branches(id);
    END IF;
END $$;

-- 5. Add rendering_doctor_id to billing_log
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'billing_log'
        AND column_name = 'rendering_doctor_id'
    ) THEN
        ALTER TABLE billing_log
        ADD COLUMN rendering_doctor_id BIGINT;
    END IF;
END $$;

-- 6. Add staff_id to billing_log
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'billing_log'
        AND column_name = 'staff_id'
    ) THEN
        ALTER TABLE billing_log
        ADD COLUMN staff_id BIGINT;
    END IF;
END $$;

-- 7. Foreign key: billing_log.rendering_doctor_id -> master_doctors
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name = 'billing_log'
        AND constraint_name = 'fk_rendering_doctor'
    ) THEN
        ALTER TABLE billing_log
        ADD CONSTRAINT fk_rendering_doctor
        FOREIGN KEY (rendering_doctor_id)
        REFERENCES master_doctors(id);
    END IF;
END $$;

-- 8. Foreign key: billing_log.staff_id -> master_staff
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name = 'billing_log'
        AND constraint_name = 'fk_staff'
    ) THEN
        ALTER TABLE billing_log
        ADD CONSTRAINT fk_staff
        FOREIGN KEY (staff_id)
        REFERENCES master_staff(id);
    END IF;
END $$;

-- 9. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_master_doctors_branch ON master_doctors(branch_id);
CREATE INDEX IF NOT EXISTS idx_master_doctors_status ON master_doctors(status);
CREATE INDEX IF NOT EXISTS idx_master_staff_branch ON master_staff(branch_id);
CREATE INDEX IF NOT EXISTS idx_master_staff_status ON master_staff(status);
CREATE INDEX IF NOT EXISTS idx_billing_log_rendering_doctor ON billing_log(rendering_doctor_id);
CREATE INDEX IF NOT EXISTS idx_billing_log_staff ON billing_log(staff_id);

-- 10. Comments
COMMENT ON TABLE master_doctors IS 'Master list of doctors, branch-specific';
COMMENT ON TABLE master_staff IS 'Master list of staff, branch-specific';
COMMENT ON COLUMN billing_log.rendering_doctor_id IS 'FK to master_doctors.id - rendering doctor stored as ID';
COMMENT ON COLUMN billing_log.staff_id IS 'FK to master_staff.id - staff member stored as ID';