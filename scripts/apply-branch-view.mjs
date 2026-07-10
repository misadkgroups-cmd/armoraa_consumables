import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://aymmwjoltcerzujgcdoy.supabase.co';
const SUPABASE_KEY = 'sb_publishable_JePMWH6rUnTmp7h4ztTBkw_WUOQi4IP';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const sql = `
DROP VIEW IF EXISTS public.billable_report_with_names;
CREATE VIEW public.billable_report_with_names AS
SELECT
  br.id,
  br.branch_id,
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
  br.updated_at,
  b.branch_name
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
`;

async function applyMigration() {
  try {
    const { data, error } = await supabase.rpc('exec_sql', { sql });
    if (error) {
      console.error('Migration failed:', error);
      return;
    }
    console.log('Migration result:', data);
  } catch (err) {
    console.error('Exception:', err);
  }
}

applyMigration();