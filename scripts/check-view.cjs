const https = require('https');
const SUPABASE_URL = 'https://aymmwjoltcerzujgcdoy.supabase.co';
const SUPABASE_KEY = 'sb_publishable_JePMWH6rUnTmp7h4ztTBkw_WUOQi4IP';
const sql = "SELECT column_name FROM information_schema.columns WHERE table_name = 'billable_report_with_names' ORDER BY ordinal_position;";
const postData = JSON.stringify({ sql });
const options = {
  hostname: SUPABASE_URL.replace('https://', ''),
  path: '/rest/v1/rpc/exec_sql',
  method: 'POST',
  headers: {
    'apikey': SUPABASE_KEY,
    'Authorization': 'Bearer ' + SUPABASE_KEY,
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData)
  }
};
const req = https.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('View columns:', data);
  });
});
req.on('error', (error) => console.error('Error:', error));
req.write(postData);
req.end();