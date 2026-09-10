const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://kihlfvquhwhgskfnmsli.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtpaGxmdnF1aHdoZ3NrZm5tc2xpIiwiaWF0IjoxNzg0NjA3Mzc3LCJleHAiOjIwMDAxODMzc3N9.NMWrIshJVgdvSqK_HqG2QkEBn4mOzYDtrTb39g2VAQc';

const supabase = createClient(supabaseUrl, supabaseKey);

async function query() {
  console.log('=== bill_service_consumables where bill_service_id = 311920 ===');
  const { data: bsc, error: bscErr } = await supabase
    .from('bill_service_consumables')
    .select('*')
    .eq('bill_service_id', 311920);
  if (bscErr) console.error('bsc error:', bscErr.message);
  console.log('count:', (bsc?.data || []).length);
  console.log(JSON.stringify(bsc?.data || [], null, 2));

  console.log('\n=== billable_report where billing_log_id = 92 ===');
  const { data: br, error: brErr } = await supabase
    .from('billable_report')
    .select('*')
    .eq('billing_log_id', 92)
    .order('id', { ascending: true });
  if (brErr) console.error('br error:', brErr.message);
  console.log('count:', (br?.data || []).length);
  console.log(JSON.stringify(br?.data || [], null, 2));

  console.log('\n=== bill_services where bill_id = 311920 ===');
  const { data: bs, error: bsErr } = await supabase
    .from('bill_services')
    .select('*')
    .eq('bill_id', 311920);
  if (bsErr) console.error('bs error:', bsErr.message);
  console.log('count:', (bs?.data || []).length);
  console.log(JSON.stringify(bs?.data || [], null, 2));

  console.log('\n=== billing_log where bill_no = 6961 ===');
  const { data: bl, error: blErr } = await supabase
    .from('billing_log')
    .select('*')
    .eq('bill_no', '6961');
  if (blErr) console.error('bl error:', blErr.message);
  console.log('count:', (bl?.data || []).length);
  console.log(JSON.stringify(bl?.data || [], null, 2));
}

query().catch(console.error);
