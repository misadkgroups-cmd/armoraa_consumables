-- ============================================================================
-- fix_decimal_used_quantity.sql
--
-- PURPOSE
--   One-time data correction for records saved BEFORE the decimal-quantity
--   fix. Historical rows were saved with Math.round() applied, e.g.
--   Bill 8624 (JLO BOOSTER) has used_quantity = 3 in
--   bill_service_consumables while billable_report correctly holds 2.6.
--
--   This script re-syncs bill_service_consumables.used_quantity from the
--   wide-format billable_report slots (the value the user actually typed).
--
--   Run in Supabase Dashboard -> SQL Editor. It is idempotent.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. VERIFY the mismatch first (Bill 8624 example)
-- ---------------------------------------------------------------------------
-- Report (should show the exact decimal, e.g. 2.6):
SELECT id, bill_id, consumable_1_id, consumable_1_units
FROM billable_report
WHERE bill_id = '8624';

-- Relational rows (historical rows may show the rounded value, e.g. 3):
SELECT id, bill_service_id, consumable_id, used_quantity
FROM bill_service_consumables
WHERE bill_service_id IN (
  SELECT id FROM bill_services WHERE bill_id = 8624
);

-- ---------------------------------------------------------------------------
-- 1. Slot list CTE (shared by the preview and the update) is inlined below.
--    PREVIEW the corrections (no changes yet): run this SELECT first.
-- ---------------------------------------------------------------------------
WITH report_slots AS (
  SELECT bill_id,
         consumable_1_id  AS consumable_id, consumable_1_units  AS units FROM billable_report WHERE consumable_1_id  IS NOT NULL UNION ALL
  SELECT bill_id, consumable_2_id,  consumable_2_units  FROM billable_report WHERE consumable_2_id  IS NOT NULL UNION ALL
  SELECT bill_id, consumable_3_id,  consumable_3_units  FROM billable_report WHERE consumable_3_id  IS NOT NULL UNION ALL
  SELECT bill_id, consumable_4_id,  consumable_4_units  FROM billable_report WHERE consumable_4_id  IS NOT NULL UNION ALL
  SELECT bill_id, consumable_5_id,  consumable_5_units  FROM billable_report WHERE consumable_5_id  IS NOT NULL UNION ALL
  SELECT bill_id, consumable_6_id,  consumable_6_units  FROM billable_report WHERE consumable_6_id  IS NOT NULL UNION ALL
  SELECT bill_id, consumable_7_id,  consumable_7_units  FROM billable_report WHERE consumable_7_id  IS NOT NULL UNION ALL
  SELECT bill_id, consumable_8_id,  consumable_8_units  FROM billable_report WHERE consumable_8_id  IS NOT NULL UNION ALL
  SELECT bill_id, consumable_9_id,  consumable_9_units  FROM billable_report WHERE consumable_9_id  IS NOT NULL UNION ALL
  SELECT bill_id, consumable_10_id, consumable_10_units FROM billable_report WHERE consumable_10_id IS NOT NULL UNION ALL
  SELECT bill_id, consumable_11_id, consumable_11_units FROM billable_report WHERE consumable_11_id IS NOT NULL UNION ALL
  SELECT bill_id, consumable_12_id, consumable_12_units FROM billable_report WHERE consumable_12_id IS NOT NULL UNION ALL
  SELECT bill_id, consumable_13_id, consumable_13_units FROM billable_report WHERE consumable_13_id IS NOT NULL UNION ALL
  SELECT bill_id, consumable_14_id, consumable_14_units FROM billable_report WHERE consumable_14_id IS NOT NULL
)
SELECT bsc.id,
       bsc.used_quantity AS current_qty,
       rs.units          AS correct_qty
FROM bill_service_consumables bsc
JOIN bill_services bs   ON bs.id = bsc.bill_service_id
JOIN billable_report br ON br.bill_id::text = bs.bill_id::text
JOIN report_slots rs    ON rs.bill_id::text = br.bill_id::text
                       AND rs.consumable_id = bsc.consumable_id
WHERE bsc.product_type = 'Billable'
  AND bsc.status = 'Used'
  AND bsc.used_quantity IS DISTINCT FROM rs.units;

-- ---------------------------------------------------------------------------
-- 2. APPLY the correction
-- ---------------------------------------------------------------------------
UPDATE bill_service_consumables bsc
SET used_quantity = fix.correct_qty
FROM (
  SELECT bsc.id, rs.units AS correct_qty
  FROM bill_service_consumables bsc
  JOIN bill_services bs   ON bs.id = bsc.bill_service_id
  JOIN billable_report br ON br.bill_id::text = bs.bill_id::text
  JOIN (
    SELECT bill_id,
           consumable_1_id  AS consumable_id, consumable_1_units  AS units FROM billable_report WHERE consumable_1_id  IS NOT NULL UNION ALL
    SELECT bill_id, consumable_2_id,  consumable_2_units  FROM billable_report WHERE consumable_2_id  IS NOT NULL UNION ALL
    SELECT bill_id, consumable_3_id,  consumable_3_units  FROM billable_report WHERE consumable_3_id  IS NOT NULL UNION ALL
    SELECT bill_id, consumable_4_id,  consumable_4_units  FROM billable_report WHERE consumable_4_id  IS NOT NULL UNION ALL
    SELECT bill_id, consumable_5_id,  consumable_5_units  FROM billable_report WHERE consumable_5_id  IS NOT NULL UNION ALL
    SELECT bill_id, consumable_6_id,  consumable_6_units  FROM billable_report WHERE consumable_6_id  IS NOT NULL UNION ALL
    SELECT bill_id, consumable_7_id,  consumable_7_units  FROM billable_report WHERE consumable_7_id  IS NOT NULL UNION ALL
    SELECT bill_id, consumable_8_id,  consumable_8_units  FROM billable_report WHERE consumable_8_id  IS NOT NULL UNION ALL
    SELECT bill_id, consumable_9_id,  consumable_9_units  FROM billable_report WHERE consumable_9_id  IS NOT NULL UNION ALL
    SELECT bill_id, consumable_10_id, consumable_10_units FROM billable_report WHERE consumable_10_id IS NOT NULL UNION ALL
    SELECT bill_id, consumable_11_id, consumable_11_units FROM billable_report WHERE consumable_11_id IS NOT NULL UNION ALL
    SELECT bill_id, consumable_12_id, consumable_12_units FROM billable_report WHERE consumable_12_id IS NOT NULL UNION ALL
    SELECT bill_id, consumable_13_id, consumable_13_units FROM billable_report WHERE consumable_13_id IS NOT NULL UNION ALL
    SELECT bill_id, consumable_14_id, consumable_14_units FROM billable_report WHERE consumable_14_id IS NOT NULL
  ) rs ON rs.bill_id::text = br.bill_id::text
      AND rs.consumable_id = bsc.consumable_id
  WHERE bsc.product_type = 'Billable'
    AND bsc.status = 'Used'
    AND bsc.used_quantity IS DISTINCT FROM rs.units
) fix
WHERE bsc.id = fix.id;

-- ---------------------------------------------------------------------------
-- 3. VERIFY after the fix
-- ---------------------------------------------------------------------------
SELECT id, bill_service_id, consumable_id, used_quantity
FROM bill_service_consumables
WHERE bill_service_id IN (
  SELECT id FROM bill_services WHERE bill_id = 8624
);
-- Expected: used_quantity = 2.6 (matching billable_report.consumable_1_units)
