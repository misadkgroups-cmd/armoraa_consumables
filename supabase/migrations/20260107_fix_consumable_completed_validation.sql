-- ============================================================
-- FIX: Prevent services from being marked Complete without consumables
-- ============================================================

-- 1. Fix existing data: Reset services that are marked Complete but have no consumables
WITH incomplete_services AS (
  SELECT 
    bs.id,
    bs.service_name,
    bs.consumable_completed
  FROM bill_services bs
  WHERE bs.consumable_completed = true
    AND NOT EXISTS (
      SELECT 1 
      FROM bill_service_consumables bsc 
      WHERE bsc.bill_service_id = bs.id 
        AND bsc.status = 'Used'
    )
)
UPDATE bill_services 
SET 
  consumable_completed = false,
  service_status = 'Pending'
WHERE id IN (SELECT id FROM incomplete_services);

-- 2. Add a database function to validate consumable completion
CREATE OR REPLACE FUNCTION validate_service_completion()
RETURNS TRIGGER AS $$
BEGIN
  -- When updating consumable_completed to true, verify consumables exist
  IF NEW.consumable_completed = true AND OLD.consumable_completed = false THEN
    IF NOT EXISTS (
      SELECT 1 
      FROM bill_service_consumables 
      WHERE bill_service_id = NEW.id 
        AND status = 'Used'
    ) THEN
      RAISE EXCEPTION 'Cannot mark service as complete: No consumables found. Please add consumables before marking as complete.';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Create trigger to enforce validation
DROP TRIGGER IF EXISTS trg_validate_service_completion ON bill_services;
CREATE TRIGGER trg_validate_service_completion
  BEFORE UPDATE OF consumable_completed ON bill_services
  FOR EACH ROW
  EXECUTE FUNCTION validate_service_completion();

-- 4. Add a comment to document the constraint
COMMENT ON TRIGGER trg_validate_service_completion ON bill_services IS 
  'Prevents marking a service as complete without consumables';

-- ============================================================
-- VERIFICATION: Check for any remaining invalid records
-- ============================================================
-- Run this to verify the fix worked:
-- SELECT bs.id, bs.service_name, bs.consumable_completed, COUNT(bsc.id) as consumable_count
-- FROM bill_services bs
-- LEFT JOIN bill_service_consumables bsc ON bsc.bill_service_id = bs.id AND bsc.status = 'Used'
-- WHERE bs.consumable_completed = true
-- GROUP BY bs.id, bs.service_name, bs.consumable_completed
-- HAVING COUNT(bsc.id) = 0;