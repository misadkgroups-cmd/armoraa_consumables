-- ============================================================
-- Migration: Add foreign key relationships to billable_report
-- ============================================================

-- 1. Add FK constraint on branch_id → branches(id) (drop first if already exists)
ALTER TABLE public.billable_report DROP CONSTRAINT IF EXISTS fk_billable_branch;
ALTER TABLE public.billable_report
  ADD CONSTRAINT fk_billable_branch
  FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE CASCADE;

-- 2. Add FK constraint on service_id → master_services(id) (drop first if already exists)
ALTER TABLE public.billable_report DROP CONSTRAINT IF EXISTS fk_billable_service;
ALTER TABLE public.billable_report
  ADD CONSTRAINT fk_billable_service
  FOREIGN KEY (service_id) REFERENCES public.master_services(id) ON DELETE SET NULL;

-- 3. Add FK constraint on machinery_id → master_machinery(id) (drop first if already exists)
ALTER TABLE public.billable_report DROP CONSTRAINT IF EXISTS fk_billable_machinery;
ALTER TABLE public.billable_report
  ADD CONSTRAINT fk_billable_machinery
  FOREIGN KEY (machinery_id) REFERENCES public.master_machinery(id) ON DELETE SET NULL;

-- 4. Add report_date column for date-based filtering
ALTER TABLE public.billable_report ADD COLUMN IF NOT EXISTS report_date DATE DEFAULT CURRENT_DATE;

-- 5. Add consumable_N_id INT8 FK columns referencing master_consumables(id)
--    These replace the old consumable_N_name TEXT columns with proper FK relationships
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

-- 6. Add batch_id columns for each consumable slot (for existing tables missing them)
ALTER TABLE public.billable_report ADD COLUMN IF NOT EXISTS consumable_1_batch_id TEXT;
ALTER TABLE public.billable_report ADD COLUMN IF NOT EXISTS consumable_2_batch_id TEXT;
ALTER TABLE public.billable_report ADD COLUMN IF NOT EXISTS consumable_3_batch_id TEXT;
ALTER TABLE public.billable_report ADD COLUMN IF NOT EXISTS consumable_4_batch_id TEXT;
ALTER TABLE public.billable_report ADD COLUMN IF NOT EXISTS consumable_5_batch_id TEXT;
ALTER TABLE public.billable_report ADD COLUMN IF NOT EXISTS consumable_6_batch_id TEXT;
ALTER TABLE public.billable_report ADD COLUMN IF NOT EXISTS consumable_7_batch_id TEXT;
ALTER TABLE public.billable_report ADD COLUMN IF NOT EXISTS consumable_8_batch_id TEXT;
ALTER TABLE public.billable_report ADD COLUMN IF NOT EXISTS consumable_9_batch_id TEXT;
ALTER TABLE public.billable_report ADD COLUMN IF NOT EXISTS consumable_10_batch_id TEXT;
ALTER TABLE public.billable_report ADD COLUMN IF NOT EXISTS consumable_11_batch_id TEXT;
ALTER TABLE public.billable_report ADD COLUMN IF NOT EXISTS consumable_12_batch_id TEXT;
ALTER TABLE public.billable_report ADD COLUMN IF NOT EXISTS consumable_13_batch_id TEXT;
ALTER TABLE public.billable_report ADD COLUMN IF NOT EXISTS consumable_14_batch_id TEXT;

-- 7. Migrate existing consumable_N_name → consumable_N_id data (text → FK matching)
--    Only run if the old consumable_N_name columns still exist (fresh migration)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='billable_report' AND column_name='consumable_1_name') THEN
    UPDATE public.billable_report br SET consumable_1_id = mc.id FROM public.master_consumables mc WHERE br.consumable_1_name IS NOT NULL AND br.consumable_1_name = mc.consumable_name;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='billable_report' AND column_name='consumable_2_name') THEN
    UPDATE public.billable_report br SET consumable_2_id = mc.id FROM public.master_consumables mc WHERE br.consumable_2_name IS NOT NULL AND br.consumable_2_name = mc.consumable_name;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='billable_report' AND column_name='consumable_3_name') THEN
    UPDATE public.billable_report br SET consumable_3_id = mc.id FROM public.master_consumables mc WHERE br.consumable_3_name IS NOT NULL AND br.consumable_3_name = mc.consumable_name;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='billable_report' AND column_name='consumable_4_name') THEN
    UPDATE public.billable_report br SET consumable_4_id = mc.id FROM public.master_consumables mc WHERE br.consumable_4_name IS NOT NULL AND br.consumable_4_name = mc.consumable_name;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='billable_report' AND column_name='consumable_5_name') THEN
    UPDATE public.billable_report br SET consumable_5_id = mc.id FROM public.master_consumables mc WHERE br.consumable_5_name IS NOT NULL AND br.consumable_5_name = mc.consumable_name;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='billable_report' AND column_name='consumable_6_name') THEN
    UPDATE public.billable_report br SET consumable_6_id = mc.id FROM public.master_consumables mc WHERE br.consumable_6_name IS NOT NULL AND br.consumable_6_name = mc.consumable_name;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='billable_report' AND column_name='consumable_7_name') THEN
    UPDATE public.billable_report br SET consumable_7_id = mc.id FROM public.master_consumables mc WHERE br.consumable_7_name IS NOT NULL AND br.consumable_7_name = mc.consumable_name;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='billable_report' AND column_name='consumable_8_name') THEN
    UPDATE public.billable_report br SET consumable_8_id = mc.id FROM public.master_consumables mc WHERE br.consumable_8_name IS NOT NULL AND br.consumable_8_name = mc.consumable_name;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='billable_report' AND column_name='consumable_9_name') THEN
    UPDATE public.billable_report br SET consumable_9_id = mc.id FROM public.master_consumables mc WHERE br.consumable_9_name IS NOT NULL AND br.consumable_9_name = mc.consumable_name;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='billable_report' AND column_name='consumable_10_name') THEN
    UPDATE public.billable_report br SET consumable_10_id = mc.id FROM public.master_consumables mc WHERE br.consumable_10_name IS NOT NULL AND br.consumable_10_name = mc.consumable_name;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='billable_report' AND column_name='consumable_11_name') THEN
    UPDATE public.billable_report br SET consumable_11_id = mc.id FROM public.master_consumables mc WHERE br.consumable_11_name IS NOT NULL AND br.consumable_11_name = mc.consumable_name;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='billable_report' AND column_name='consumable_12_name') THEN
    UPDATE public.billable_report br SET consumable_12_id = mc.id FROM public.master_consumables mc WHERE br.consumable_12_name IS NOT NULL AND br.consumable_12_name = mc.consumable_name;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='billable_report' AND column_name='consumable_13_name') THEN
    UPDATE public.billable_report br SET consumable_13_id = mc.id FROM public.master_consumables mc WHERE br.consumable_13_name IS NOT NULL AND br.consumable_13_name = mc.consumable_name;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='billable_report' AND column_name='consumable_14_name') THEN
    UPDATE public.billable_report br SET consumable_14_id = mc.id FROM public.master_consumables mc WHERE br.consumable_14_name IS NOT NULL AND br.consumable_14_name = mc.consumable_name;
  END IF;
END $$;

-- 8. Drop old consumable_N_name TEXT columns (replaced by consumable_N_id FK columns)
ALTER TABLE public.billable_report DROP COLUMN IF EXISTS consumable_1_name;
ALTER TABLE public.billable_report DROP COLUMN IF EXISTS consumable_2_name;
ALTER TABLE public.billable_report DROP COLUMN IF EXISTS consumable_3_name;
ALTER TABLE public.billable_report DROP COLUMN IF EXISTS consumable_4_name;
ALTER TABLE public.billable_report DROP COLUMN IF EXISTS consumable_5_name;
ALTER TABLE public.billable_report DROP COLUMN IF EXISTS consumable_6_name;
ALTER TABLE public.billable_report DROP COLUMN IF EXISTS consumable_7_name;
ALTER TABLE public.billable_report DROP COLUMN IF EXISTS consumable_8_name;
ALTER TABLE public.billable_report DROP COLUMN IF EXISTS consumable_9_name;
ALTER TABLE public.billable_report DROP COLUMN IF EXISTS consumable_10_name;
ALTER TABLE public.billable_report DROP COLUMN IF EXISTS consumable_11_name;
ALTER TABLE public.billable_report DROP COLUMN IF EXISTS consumable_12_name;
ALTER TABLE public.billable_report DROP COLUMN IF EXISTS consumable_13_name;
ALTER TABLE public.billable_report DROP COLUMN IF EXISTS consumable_14_name;

-- 9. Indexes for foreign key lookups
CREATE INDEX IF NOT EXISTS idx_billable_report_service ON public.billable_report(service_id);
CREATE INDEX IF NOT EXISTS idx_billable_report_machinery ON public.billable_report(machinery_id);

-- 10. Drop old view if exists, then create with new columns (including report_date, cost & branch_name)
DROP VIEW IF EXISTS public.billable_report_with_names;
CREATE VIEW public.billable_report_with_names AS
SELECT
  br.id,
  br.branch_id,
  b.branch_name,
  br.bill_id,
  br.uid,
  br.report_date,
  br.service_id,
  ms.service_name,
  br.machinery_id,
  mm.machine_name,
  br.consumable_1_id,
  mc1.consumable_name AS consumable_1_name,
  br.consumable_1_units,
  COALESCE(mc1.cost_unit, 0) AS consumable_1_cost_unit,
  (br.consumable_1_units * COALESCE(mc1.cost_unit, 0)) AS consumable_1_cost,
  br.consumable_1_batch_id,
  br.consumable_2_id,
  mc2.consumable_name AS consumable_2_name,
  br.consumable_2_units,
  COALESCE(mc2.cost_unit, 0) AS consumable_2_cost_unit,
  (br.consumable_2_units * COALESCE(mc2.cost_unit, 0)) AS consumable_2_cost,
  br.consumable_2_batch_id,
  br.consumable_3_id,
  mc3.consumable_name AS consumable_3_name,
  br.consumable_3_units,
  COALESCE(mc3.cost_unit, 0) AS consumable_3_cost_unit,
  (br.consumable_3_units * COALESCE(mc3.cost_unit, 0)) AS consumable_3_cost,
  br.consumable_3_batch_id,
  br.consumable_4_id,
  mc4.consumable_name AS consumable_4_name,
  br.consumable_4_units,
  COALESCE(mc4.cost_unit, 0) AS consumable_4_cost_unit,
  (br.consumable_4_units * COALESCE(mc4.cost_unit, 0)) AS consumable_4_cost,
  br.consumable_4_batch_id,
  br.consumable_5_id,
  mc5.consumable_name AS consumable_5_name,
  br.consumable_5_units,
  COALESCE(mc5.cost_unit, 0) AS consumable_5_cost_unit,
  (br.consumable_5_units * COALESCE(mc5.cost_unit, 0)) AS consumable_5_cost,
  br.consumable_5_batch_id,
  br.consumable_6_id,
  mc6.consumable_name AS consumable_6_name,
  br.consumable_6_units,
  COALESCE(mc6.cost_unit, 0) AS consumable_6_cost_unit,
  (br.consumable_6_units * COALESCE(mc6.cost_unit, 0)) AS consumable_6_cost,
  br.consumable_6_batch_id,
  br.consumable_7_id,
  mc7.consumable_name AS consumable_7_name,
  br.consumable_7_units,
  COALESCE(mc7.cost_unit, 0) AS consumable_7_cost_unit,
  (br.consumable_7_units * COALESCE(mc7.cost_unit, 0)) AS consumable_7_cost,
  br.consumable_7_batch_id,
  br.consumable_8_id,
  mc8.consumable_name AS consumable_8_name,
  br.consumable_8_units,
  COALESCE(mc8.cost_unit, 0) AS consumable_8_cost_unit,
  (br.consumable_8_units * COALESCE(mc8.cost_unit, 0)) AS consumable_8_cost,
  br.consumable_8_batch_id,
  br.consumable_9_id,
  mc9.consumable_name AS consumable_9_name,
  br.consumable_9_units,
  COALESCE(mc9.cost_unit, 0) AS consumable_9_cost_unit,
  (br.consumable_9_units * COALESCE(mc9.cost_unit, 0)) AS consumable_9_cost,
  br.consumable_9_batch_id,
  br.consumable_10_id,
  mc10.consumable_name AS consumable_10_name,
  br.consumable_10_units,
  COALESCE(mc10.cost_unit, 0) AS consumable_10_cost_unit,
  (br.consumable_10_units * COALESCE(mc10.cost_unit, 0)) AS consumable_10_cost,
  br.consumable_10_batch_id,
  br.consumable_11_id,
  mc11.consumable_name AS consumable_11_name,
  br.consumable_11_units,
  COALESCE(mc11.cost_unit, 0) AS consumable_11_cost_unit,
  (br.consumable_11_units * COALESCE(mc11.cost_unit, 0)) AS consumable_11_cost,
  br.consumable_11_batch_id,
  br.consumable_12_id,
  mc12.consumable_name AS consumable_12_name,
  br.consumable_12_units,
  COALESCE(mc12.cost_unit, 0) AS consumable_12_cost_unit,
  (br.consumable_12_units * COALESCE(mc12.cost_unit, 0)) AS consumable_12_cost,
  br.consumable_12_batch_id,
  br.consumable_13_id,
  mc13.consumable_name AS consumable_13_name,
  br.consumable_13_units,
  COALESCE(mc13.cost_unit, 0) AS consumable_13_cost_unit,
  (br.consumable_13_units * COALESCE(mc13.cost_unit, 0)) AS consumable_13_cost,
  br.consumable_13_batch_id,
  br.consumable_14_id,
  mc14.consumable_name AS consumable_14_name,
  br.consumable_14_units,
  COALESCE(mc14.cost_unit, 0) AS consumable_14_cost_unit,
  (br.consumable_14_units * COALESCE(mc14.cost_unit, 0)) AS consumable_14_cost,
  br.consumable_14_batch_id,
  br.created_at,
  br.updated_at
FROM public.billable_report br
LEFT JOIN public.branches b ON br.branch_id = b.id
LEFT JOIN public.master_services ms ON br.service_id = ms.id
LEFT JOIN public.master_machinery mm ON br.machinery_id = mm.id
LEFT JOIN public.master_consumables mc1 ON br.consumable_1_id = mc1.id
LEFT JOIN public.master_consumables mc2 ON br.consumable_2_id = mc2.id
LEFT JOIN public.master_consumables mc3 ON br.consumable_3_id = mc3.id
LEFT JOIN public.master_consumables mc4 ON br.consumable_4_id = mc4.id
LEFT JOIN public.master_consumables mc5 ON br.consumable_5_id = mc5.id
LEFT JOIN public.master_consumables mc6 ON br.consumable_6_id = mc6.id
LEFT JOIN public.master_consumables mc7 ON br.consumable_7_id = mc7.id
LEFT JOIN public.master_consumables mc8 ON br.consumable_8_id = mc8.id
LEFT JOIN public.master_consumables mc9 ON br.consumable_9_id = mc9.id
LEFT JOIN public.master_consumables mc10 ON br.consumable_10_id = mc10.id
LEFT JOIN public.master_consumables mc11 ON br.consumable_11_id = mc11.id
LEFT JOIN public.master_consumables mc12 ON br.consumable_12_id = mc12.id
LEFT JOIN public.master_consumables mc13 ON br.consumable_13_id = mc13.id
LEFT JOIN public.master_consumables mc14 ON br.consumable_14_id = mc14.id;
