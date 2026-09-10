const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://kihlfvquhwhgskfnmsli.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtpaGxmdnF1aHdoZ3NrZm5tc2xpIiwiaWF0IjoxNzg0NjA3Mzc3LCJleHAiOjIwMDAxODMzc3N9.NMWrIshJVgdvSqK_HqG2QkEBn4mOzYDtrTb39g2VAQc';

const supabase = createClient(supabaseUrl, supabaseKey);

(async () => {
  try {
    // Query bill_service_consumables for service 311920
    const bsc = await supabase
      .from('bill_service_consumables')
      .select('*')
      .eq('bill_service_id', 311920)
      .eq('status', 'Used');
    console.log('=== bill_service_consumables for service 311920 ===');
    console.log(`Count: ${bsc.data?.length || 0}`);
    console.log(JSON.stringify(bsc.data || [], null, 2));

    // Query billable_report for billing_log_id 92 (from the context)
    const br = await supabase
      .from('billable_report')
      .select('*')
      .eq('billing_log_id', 92)
      .order('id', { ascending: true });
    console.log('\n=== billable_report for billing_log_id 92 ===');
    console.log(`Count: ${br.data?.length || 0}`);
    console.log(JSON.stringify(br.data || [], null, 2));

    // Query bill_services for bill_id 311920
    const bs = await supabase
      .from('bill_services')
      .select('id, bill_id, service_id, service_name, completed')
      .eq('bill_id', 311920);
    console.log('\n=== bill_services for bill_id 311920 ===');
    console.log(`Count: ${bs.data?.length || 0}`);
    console.log(JSON.stringify(bs.data || [], null, 2));

    // Query billing_log
    const bl = await supabase
      .from('billing_log')
      .select('id, bill_no, uid, doctor_id, staff_id, service_date, branch_id')
      .eq('bill_no', '6961')
      .limit(5);
    console.log('\n=== billing_log for bill_no 6961 ===');
    console.log(`Count: ${bl.data?.length || 0}`);
    console.log(JSON.stringify(bl.data || [], null, 2));

  } catch (error) {
    console.error('Error:', error.message);
  }
})();
