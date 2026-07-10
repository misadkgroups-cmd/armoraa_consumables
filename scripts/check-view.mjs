import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://aymmwjoltcerzujgcdoy.supabase.co';
const SUPABASE_KEY = 'sb_publishable_JePMWH6rUnTmp7h4ztTBkw_WUOQi4IP';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkView() {
  try {
    const { data, error } = await supabase
      .from('billable_report_with_names')
      .select('*')
      .limit(1);
    
    if (error) {
      console.error('Error querying view:', error);
      return;
    }
    
    if (data && data.length > 0) {
      console.log('View exists and returned data.');
      console.log('Columns in result:', Object.keys(data[0]));
    } else {
      console.log('View exists but returned no data. Columns unknown from empty result.');
    }
  } catch (err) {
    console.error('Exception:', err);
  }
}

checkView();