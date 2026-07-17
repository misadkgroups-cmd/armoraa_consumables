-- ============================================================
-- BRANCH PASSWORD PROTECTION
-- ============================================================

-- 1. Create branch_access table
CREATE TABLE IF NOT EXISTS branch_access (
    id BIGSERIAL PRIMARY KEY,
    branch_id BIGINT NOT NULL,
    branch_password TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'Active',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 2. Foreign key: branch_access -> branches
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name = 'branch_access'
        AND constraint_name = 'fk_branch_access_branch'
    ) THEN
        ALTER TABLE branch_access
        ADD CONSTRAINT fk_branch_access_branch
        FOREIGN KEY (branch_id)
        REFERENCES branches(id);
    END IF;
END $$;

-- 3. Seed passwords (idempotent)
INSERT INTO branch_access (branch_id, branch_password, status)
SELECT b.id, 'armoraa@02', 'Active'
FROM branches b
WHERE LOWER(b.branch_name) = LOWER('ANNA NAGAR')
  AND NOT EXISTS (SELECT 1 FROM branch_access ba WHERE ba.branch_id = b.id);

INSERT INTO branch_access (branch_id, branch_password, status)
SELECT b.id, 'armoraa@10', 'Active'
FROM branches b
WHERE LOWER(b.branch_name) = LOWER('ALWARPET')
  AND NOT EXISTS (SELECT 1 FROM branch_access ba WHERE ba.branch_id = b.id);

INSERT INTO branch_access (branch_id, branch_password, status)
SELECT b.id, 'armoraa@2002', 'Active'
FROM branches b
WHERE LOWER(b.branch_name) = LOWER('VELACHERY')
  AND NOT EXISTS (SELECT 1 FROM branch_access ba WHERE ba.branch_id = b.id);

-- 4. Index
CREATE INDEX IF NOT EXISTS idx_branch_access_branch ON branch_access(branch_id);

COMMENT ON TABLE branch_access IS 'Branch-specific access passwords, validated at login (not hardcoded in frontend)';

-- 5. Allow the app (anon + authenticated) to READ branch passwords at login.
--    Without this, RLS blocks the SELECT and login can never validate.
ALTER TABLE branch_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS branch_access_select ON branch_access;
CREATE POLICY branch_access_select
  ON branch_access
  FOR SELECT
  TO anon, authenticated
  USING (true);
