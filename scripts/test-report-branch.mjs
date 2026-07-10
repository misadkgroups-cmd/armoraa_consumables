import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://aymmwjoltcerzujgcdoy.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF5bW13am9sdGNlcnp1amdjZG95Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM0MjExMjQsImV4cCI6MjA5ODk5NzEyNH0.CdATSedfYvsb4vrWe9p6R0bgHjY9sl1vFxwgfYH5qG4';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function testReport() {
  try {
    // Get first report row
    const { data: reportData, error: reportError } = await supabase
      .from('billable_report_with_names')
      .select('*')
      .limit(1);
    
    if (reportError) {
      console.error('Error fetching report:', reportError);
      return;
    }
    
    if (!reportData || reportData.length === 0) {
      console.log('No report data found');
      return;
    }
    
    console.log('Report row sample:', reportData[0]);
    console.log('\nHas branch_name field:', 'branch_name' in reportData[0]);
    console.log('branch_id value:', reportData[0].branch_id);
    console.log('branch_name value:', reportData[0].branch_name);
    
    // Try to fetch branch name from branches table
    const { data: branchData, error: branchError } = await supabase
      .from('branches')
      .select('branch_name')
      .eq('id', reportData[0].branch_id)
      .single();
    
    if (branchError) {
      console.error('Error fetching branch:', branchError);
    } else {
      console.log('Fetched branch_name from branches table:', branchData.branch_name);
    }
    
  } catch (err) {
    console.error('Exception:', err);
  }
}

testReport();