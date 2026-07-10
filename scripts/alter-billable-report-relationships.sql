-- ============================================================
-- Migration: Add foreign key relationships to billable_report
-- ============================================================

-- 1. Add FK constraint on service_id → master_services(id)
ALTER TABLE public.billable_report
  ADD CONSTRAINT fk_billable_service
  FOREIGN KEY (service_id) REFERENCES public.master_services(id) ON DELETE SET NULL;

-- 2. Add FK constraint on machinery_id → master_machinery(id)
ALTER TABLE public.billable_report
  ADD CONSTRAINT fk_billable_machinery
  FOREIGN KEY (machinery_id) REFERENCES public.master_machinery(id) ON DELETE SET NULL;

-- 3. Replace consumable_N_name TEXT columns with consumable_N_id INT8 FK columns

-- First add the new FK columns
ALTER TABLE public.billable_report ADD COLUMN IF NOT EXISTS consumable_1_id INT8 REFERENCES public.master_consumables(id) ON DELETE SET NULL;
ALTER TABLE public.billable_report ADD COLUMN IF NOT EXISTS consumable_2_id INT8 REFERENCES public.master_consumables(id) ON DELETE SET NULL;
ALTER TABLE public.billable_report ADD COLUMN IF NOT EXISTS consumable_3_id INT8 REFERENCES public.master_consumables(id) ON DELETE SET NULL;
ALTER TABLE public.billable_report ADD COLUMN IF NOT EXISTS consumable_4_id INT8 REFERENCES public.master_consumables(id) ON DELETE SET NULL;
ALTER TABLE public.billable_report ADD COLUMN IF NOT EXISTS consumable_5_id INT8 REFERENCES public.master_consumables(id) ON DELETE SET NULL;
ALTER TABLE public.billable_report ADD COLUMN IF NOT EXISTS consumable_6_id INT8 REFERENCES public.master_consumables(id) ON DELETE SET NULL;
ALTER TABLE public.billable_report ADD COLUMN IF NOT EXISTS consumable_7_id INT8 REFERENCES public.master_consumables(id) ON DELETE SET NULL;
ALTER TABLE public.billable_report ADD COLUMN IF NOT EXISTS consumable_8_id INT8 REFERENCES public.master_consumables(id) ON DELETE SET NULL;
ALTER TABLE public.billable_report ADD COLUMN IF NOT EXISTS consumable_9_id INT8 REFERENCES public.master_consumables(id) ON DELETE SET NULL;
ALTER TABLE public.billable_report ADD COLUMN IF NOT EXISTS consumable_10_id INT8 REFERENCES public.master_consumables(id) ON DELETE SET NULL;
ALTER TABLE public.billable_report ADD COLUMN IF NOT EXISTS consumable_11_id INT8 REFERENCES public.master_consumables(id) ON DELETE SET NULL;
ALTER TABLE public.billable_report ADD COLUMN IF NOT EXISTS consumable_12_id INT8 REFERENCES public.master_consumables(id) ON DELETE SET NULL;
ALTER TABLE public.billable_report ADD COLUMN IF NOT EXISTS consumable_13_id INT8 REFERENCES public.master_consumables(id) ON DELETE SET NULL;
ALTER TABLE public.billable_report ADD COLUMN IF NOT EXISTS consumable_14_id INT8 REFERENCES public.master_consumables(id) ON DELETE SET NULL;

-- 4. Migrate existing text data to the new ID columns (match by consumable name)
UPDATE public.billable_report br
SET consumable_1_id = mc.id
FROM public.master_consumables mc
WHERE br.consumable_1_name IS NOT NULL
  AND br.consumable_1_name = mc.consumable_name;

UPDATE public.billable_report br
SET consumable_2_id = mc.id
FROM public.master_consumables mc
WHERE br.consumable_2_name IS NOT NULL
  AND br.consumable_2_name = mc.consumable_name;

UPDATE public.billable_report br
SET consumable_3_id = mc.id
FROM public.master_consumables mc
WHERE br.consumable_3_name IS NOT NULL
  AND br.consumable_3_name = mc.consumable_name;

UPDATE public.billable_report br
SET consumable_4_id = mc.id
FROM public.master_consumables mc
WHERE br.consumable_4_name IS NOT NULL
  AND br.consumable_4_name = mc.consumable_name;

UPDATE public.billable_report br
SET consumable_5_id = mc.id
FROM public.master_consumables mc
WHERE br.consumable_5_name IS NOT NULL
  AND br.consumable_5_name = mc.consumable_name;

UPDATE public.billable_report br
SET consumable_6_id = mc.id
FROM public.master_consumables mc
WHERE br.consumable_6_name IS NOT NULL
  AND br.consumable_6_name = mc.consumable_name;

UPDATE public.billable_report br
SET consumable_7_id = mc.id
FROM public.master_consumables mc
WHERE br.consumable_7_name IS NOT NULL
  AND br.consumable_7_name = mc.consumable_name;

UPDATE public.billable_report br
SET consumable_8_id = mc.id
FROM public.master_consumables mc
WHERE br.consumable_8_name IS NOT NULL
  AND br.consumable_8_name = mc.consumable_name;

UPDATE public.billable_report br
SET consumable_9_id = mc.id
FROM public.master_consumables mc
WHERE br.consumable_9_name IS NOT NULL
  AND br.consumable_9_name = mc.consumable_name;

UPDATE public.billable_report br
SET consumable_10_id = mc.id
FROM public.master_consumables mc
WHERE br.consumable_10_name IS NOT NULL
  AND br.consumable_10_name = mc.consumable_name;

UPDATE public.billable_report br
SET consumable_11_id = mc.id
FROM public.master_consumables mc
WHERE br.consumable_11_name IS NOT NULL
  AND br.consumable_11_name = mc.consumable_name;

UPDATE public.billable_report br
SET consumable_12_id = mc.id
FROM public.master_consumables mc
WHERE br.consumable_12_name IS NOT NULL
  AND br.consumable_12_name = mc.consumable_name;

UPDATE public.billable_report br
SET consumable_13_id = mc.id
FROM public.master_consumables mc
WHERE br.consumable_13_name IS NOT NULL
  AND br.consumable_13_name = mc.consumable_name;

UPDATE public.billable_report br
SET consumable_14_id = mc.id
FROM public.master_consumables mc
WHERE br.consumable_14_name IS NOT NULL
  AND br.consumable_14_name = mc.consumable_name;

-- 5. Drop the old text columns (after migration is verified)
-- Uncomment these lines after verifying the migration worked correctly
-- ALTER TABLE public.billable_report DROP COLUMN IF EXISTS consumable_1_name;
-- ALTER TABLE public.billable_report DROP COLUMN IF EXISTS consumable_2_name;
-- ALTER TABLE public.billable_report DROP COLUMN IF EXISTS consumable_3_name;
-- ALTER TABLE public.billable_report DROP COLUMN IF EXISTS consumable_4_name;
-- ALTER TABLE public.billable_report DROP COLUMN IF EXISTS consumable_5_name;
-- ALTER TABLE public.billable_report DROP COLUMN IF EXISTS consumable_6_name;
-- ALTER TABLE public.billable_report DROP COLUMN IF EXISTS consumable_7_name;
-- ALTER TABLE public.billable_report DROP COLUMN IF EXISTS consumable_8_name;
-- ALTER TABLE public.billable_report DROP COLUMN IF EXISTS consumable_9_name;
-- ALTER TABLE public.billable_report DROP COLUMN IF EXISTS consumable_10_name;
-- ALTER TABLE public.billable_report DROP COLUMN IF EXISTS consumable_11_name;
-- ALTER TABLE public.billable_report DROP COLUMN IF EXISTS consumable_12_name;
-- ALTER TABLE public.billable_report DROP COLUMN IF EXISTS consumable_13_name;
-- ALTER TABLE public.billable_report DROP COLUMN IF EXISTS consumable_14_name;

-- 6. Update indexes
CREATE INDEX IF NOT EXISTS idx_billable_report_service ON public.billable_report(service_id);
CREATE INDEX IF NOT EXISTS idx_billable_report_machinery ON public.billable_report(machinery_id);