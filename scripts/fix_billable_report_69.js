import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL || 'https://kihlfvquhwhgskfnmsli.supabase.co';
const key = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtpaGxmdnF1aHdoZ3NrZm5tc2xpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ2MDczNzcsImV4cCI6MjEwMDE4MzM3N30.NMWrIshJVgdvSqK_HqG2QkEBn4mOzYDtrTb39g2VAQc';

async function main() {
  const supabase = createClient(url, key);

  console.log('=== Current state of billable_report row id=69 ===');
  const { data: currentRow, error: fetchError } = await supabase
    .from('billable_report')
    .select('*')
    .eq('id', 69)
    .maybeSingle();
  
  if (fetchError) {
    console.error('Fetch error:', fetchError.message);
    return;
  }
  
  console.log('Current row:', JSON.stringify(currentRow, null, 2));
  
  if (!currentRow) {
    console.log('Row id=69 not found');
    return;
  }

  console.log('\n=== Checking bill_service_consumables for reference ===');
  const bsIds = [1142]; // From previous query
  const { data: bsc, error: bscError } = await supabase
    .from('bill_service_consumables')
    .select('id, bill_service_id, product_type, consumable_id, used_quantity, status')
    .in('bill_service_id', bsIds);
  
  if (bscError) {
    console.error('bsc error:', bscError.message);
  } else {
    console.log('bill_service_consumables:', JSON.stringify(bsc.data, null, 2));
  }

  // Fix the row: populate consumable data from bill_service_consumables
  console.log('\n=== Updating row id=69 with correct consumable data ===');
  
  // From bill_service_consumables:
  // - consumable_id=1051, used_quantity=5 (Gauze Swabs) -> slot 1
  // - consumable_id=1005, used_quantity=1 (Cleansing Capsules) -> slot 2
  
  const { data: updated, error: updateError } = await supabase
    .from('billable_report')
    .update({
      consumable_1_id: 1051,
      consumable_1_units: 5,
      is_non_billable_1: false,
      consumable_2_id: 1005,
      consumable_2_units: 1,
      is_non_billable_2: false,
      // Clear any stale non-billable data
      non_billable_registry_id_1: null,
      consumable_1_batch_id: null,
      non_billable_registry_id_2: null,
      consumable_2_batch_id: null,
    })
    .eq('id', 69)
    .select()
    .single();
  
  if (updateError) {
    console.error('Update error:', updateError.message);
  } else {
    console.log('Updated row:', JSON.stringify(updated, null, 2));
    console.log('\n=== SUCCESS: Row id=69 has been updated ===');
  }
}

main().catch(e => console.error('FATAL:', e));
