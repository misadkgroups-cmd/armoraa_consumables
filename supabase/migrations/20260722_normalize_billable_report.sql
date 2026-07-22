-- ============================================================
-- Migration: Normalize billable_report consumables into child table
-- Creates billable_report_consumables and migrates existing data
-- ============================================================

-- 1. Create the normalized child table
CREATE TABLE IF NOT EXISTS public.billable_report_consumables (
  id BIGSERIAL PRIMARY KEY,
  report_id BIGINT NOT NULL REFERENCES public.billable_report(id) ON DELETE CASCADE,
  product_type TEXT NOT NULL CHECK (product_type IN ('Billable', 'Non-Billable')),
  consumable_id BIGINT,
  units NUMERIC,
  is_non_billable BOOLEAN NOT NULL DEFAULT false,
  registry_id BIGINT REFERENCES public.non_billable_consumable_registry(id),
  batch_id TEXT,
  slot_number INTEGER NOT NULL CHECK (slot_number BETWEEN 1 AND 14),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT DEFAULT 'System'
);

CREATE INDEX IF NOT EXISTS idx_brc_report_id ON public.billable_report_consumables(report_id);
CREATE INDEX IF NOT EXISTS idx_brc_consumable ON public.billable_report_consumables(consumable_id, product_type);
CREATE INDEX IF NOT EXISTS idx_brc_registry ON public.billable_report_consumables(registry_id);

-- 2. Migrate existing data from billable_report 14-slot columns
INSERT INTO public.billable_report_consumables (report_id, product_type, consumable_id, units, is_non_billable, registry_id, batch_id, slot_number, created_by)
SELECT
  br.id,
  CASE
    WHEN COALESCE(br.is_non_billable_1, false) THEN 'Non-Billable'
    ELSE 'Billable'
  END,
  br.consumable_1_id,
  br.consumable_1_units,
  COALESCE(br.is_non_billable_1, false),
  br.non_billable_registry_id_1,
  br.consumable_1_batch_id,
  1,
  'Migration'
FROM public.billable_report br
WHERE br.consumable_1_id IS NOT NULL OR br.non_billable_registry_id_1 IS NOT NULL;

INSERT INTO public.billable_report_consumables (report_id, product_type, consumable_id, units, is_non_billable, registry_id, batch_id, slot_number, created_by)
SELECT
  br.id,
  CASE
    WHEN COALESCE(br.is_non_billable_2, false) THEN 'Non-Billable'
    ELSE 'Billable'
  END,
  br.consumable_2_id,
  br.consumable_2_units,
  COALESCE(br.is_non_billable_2, false),
  br.non_billable_registry_id_2,
  br.consumable_2_batch_id,
  2,
  'Migration'
FROM public.billable_report br
WHERE br.consumable_2_id IS NOT NULL OR br.non_billable_registry_id_2 IS NOT NULL;

INSERT INTO public.billable_report_consumables (report_id, product_type, consumable_id, units, is_non_billable, registry_id, batch_id, slot_number, created_by)
SELECT
  br.id,
  CASE
    WHEN COALESCE(br.is_non_billable_3, false) THEN 'Non-Billable'
    ELSE 'Billable'
  END,
  br.consumable_3_id,
  br.consumable_3_units,
  COALESCE(br.is_non_billable_3, false),
  br.non_billable_registry_id_3,
  br.consumable_3_batch_id,
  3,
  'Migration'
FROM public.billable_report br
WHERE br.consumable_3_id IS NOT NULL OR br.non_billable_registry_id_3 IS NOT NULL;

INSERT INTO public.billable_report_consumables (report_id, product_type, consumable_id, units, is_non_billable, registry_id, batch_id, slot_number, created_by)
SELECT
  br.id,
  CASE
    WHEN COALESCE(br.is_non_billable_4, false) THEN 'Non-Billable'
    ELSE 'Billable'
  END,
  br.consumable_4_id,
  br.consumable_4_units,
  COALESCE(br.is_non_billable_4, false),
  br.non_billable_registry_id_4,
  br.consumable_4_batch_id,
  4,
  'Migration'
FROM public.billable_report br
WHERE br.consumable_4_id IS NOT NULL OR br.non_billable_registry_id_4 IS NOT NULL;

INSERT INTO public.billable_report_consumables (report_id, product_type, consumable_id, units, is_non_billable, registry_id, batch_id, slot_number, created_by)
SELECT
  br.id,
  CASE
    WHEN COALESCE(br.is_non_billable_5, false) THEN 'Non-Billable'
    ELSE 'Billable'
  END,
  br.consumable_5_id,
  br.consumable_5_units,
  COALESCE(br.is_non_billable_5, false),
  br.non_billable_registry_id_5,
  br.consumable_5_batch_id,
  5,
  'Migration'
FROM public.billable_report br
WHERE br.consumable_5_id IS NOT NULL OR br.non_billable_registry_id_5 IS NOT NULL;

INSERT INTO public.billable_report_consumables (report_id, product_type, consumable_id, units, is_non_billable, registry_id, batch_id, slot_number, created_by)
SELECT
  br.id,
  CASE
    WHEN COALESCE(br.is_non_billable_6, false) THEN 'Non-Billable'
    ELSE 'Billable'
  END,
  br.consumable_6_id,
  br.consumable_6_units,
  COALESCE(br.is_non_billable_6, false),
  br.non_billable_registry_id_6,
  br.consumable_6_batch_id,
  6,
  'Migration'
FROM public.billable_report br
WHERE br.consumable_6_id IS NOT NULL OR br.non_billable_registry_id_6 IS NOT NULL;

INSERT INTO public.billable_report_consumables (report_id, product_type, consumable_id, units, is_non_billable, registry_id, batch_id, slot_number, created_by)
SELECT
  br.id,
  CASE
    WHEN COALESCE(br.is_non_billable_7, false) THEN 'Non-Billable'
    ELSE 'Billable'
  END,
  br.consumable_7_id,
  br.consumable_7_units,
  COALESCE(br.is_non_billable_7, false),
  br.non_billable_registry_id_7,
  br.consumable_7_batch_id,
  7,
  'Migration'
FROM public.billable_report br
WHERE br.consumable_7_id IS NOT NULL OR br.non_billable_registry_id_7 IS NOT NULL;

INSERT INTO public.billable_report_consumables (report_id, product_type, consumable_id, units, is_non_billable, registry_id, batch_id, slot_number, created_by)
SELECT
  br.id,
  CASE
    WHEN COALESCE(br.is_non_billable_8, false) THEN 'Non-Billable'
    ELSE 'Billable'
  END,
  br.consumable_8_id,
  br.consumable_8_units,
  COALESCE(br.is_non_billable_8, false),
  br.non_billable_registry_id_8,
  br.consumable_8_batch_id,
  8,
  'Migration'
FROM public.billable_report br
WHERE br.consumable_8_id IS NOT NULL OR br.non_billable_registry_id_8 IS NOT NULL;

INSERT INTO public.billable_report_consumables (report_id, product_type, consumable_id, units, is_non_billable, registry_id, batch_id, slot_number, created_by)
SELECT
  br.id,
  CASE
    WHEN COALESCE(br.is_non_billable_9, false) THEN 'Non-Billable'
    ELSE 'Billable'
  END,
  br.consumable_9_id,
  br.consumable_9_units,
  COALESCE(br.is_non_billable_9, false),
  br.non_billable_registry_id_9,
  br.consumable_9_batch_id,
  9,
  'Migration'
FROM public.billable_report br
WHERE br.consumable_9_id IS NOT NULL OR br.non_billable_registry_id_9 IS NOT NULL;

INSERT INTO public.billable_report_consumables (report_id, product_type, consumable_id, units, is_non_billable, registry_id, batch_id, slot_number, created_by)
SELECT
  br.id,
  CASE
    WHEN COALESCE(br.is_non_billable_10, false) THEN 'Non-Billable'
    ELSE 'Billable'
  END,
  br.consumable_10_id,
  br.consumable_10_units,
  COALESCE(br.is_non_billable_10, false),
  br.non_billable_registry_id_10,
  br.consumable_10_batch_id,
  10,
  'Migration'
FROM public.billable_report br
WHERE br.consumable_10_id IS NOT NULL OR br.non_billable_registry_id_10 IS NOT NULL;

INSERT INTO public.billable_report_consumables (report_id, product_type, consumable_id, units, is_non_billable, registry_id, batch_id, slot_number, created_by)
SELECT
  br.id,
  CASE
    WHEN COALESCE(br.is_non_billable_11, false) THEN 'Non-Billable'
    ELSE 'Billable'
  END,
  br.consumable_11_id,
  br.consumable_11_units,
  COALESCE(br.is_non_billable_11, false),
  br.non_billable_registry_id_11,
  br.consumable_11_batch_id,
  11,
  'Migration'
FROM public.billable_report br
WHERE br.consumable_11_id IS NOT NULL OR br.non_billable_registry_id_11 IS NOT NULL;

INSERT INTO public.billable_report_consumables (report_id, product_type, consumable_id, units, is_non_billable, registry_id, batch_id, slot_number, created_by)
SELECT
  br.id,
  CASE
    WHEN COALESCE(br.is_non_billable_12, false) THEN 'Non-Billable'
    ELSE 'Billable'
  END,
  br.consumable_12_id,
  br.consumable_12_units,
  COALESCE(br.is_non_billable_12, false),
  br.non_billable_registry_id_12,
  br.consumable_12_batch_id,
  12,
  'Migration'
FROM public.billable_report br
WHERE br.consumable_12_id IS NOT NULL OR br.non_billable_registry_id_12 IS NOT NULL;

INSERT INTO public.billable_report_consumables (report_id, product_type, consumable_id, units, is_non_billable, registry_id, batch_id, slot_number, created_by)
SELECT
  br.id,
  CASE
    WHEN COALESCE(br.is_non_billable_13, false) THEN 'Non-Billable'
    ELSE 'Billable'
  END,
  br.consumable_13_id,
  br.consumable_13_units,
  COALESCE(br.is_non_billable_13, false),
  br.non_billable_registry_id_13,
  br.consumable_13_batch_id,
  13,
  'Migration'
FROM public.billable_report br
WHERE br.consumable_13_id IS NOT NULL OR br.non_billable_registry_id_13 IS NOT NULL;

INSERT INTO public.billable_report_consumables (report_id, product_type, consumable_id, units, is_non_billable, registry_id, batch_id, slot_number, created_by)
SELECT
  br.id,
  CASE
    WHEN COALESCE(br.is_non_billable_14, false) THEN 'Non-Billable'
    ELSE 'Billable'
  END,
  br.consumable_14_id,
  br.consumable_14_units,
  COALESCE(br.is_non_billable_14, false),
  br.non_billable_registry_id_14,
  br.consumable_14_batch_id,
  14,
  'Migration'
FROM public.billable_report br
WHERE br.consumable_14_id IS NOT NULL OR br.non_billable_registry_id_14 IS NOT NULL;