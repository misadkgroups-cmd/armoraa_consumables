const fs = require('fs');
const https = require('https');

const SUPABASE_URL = 'https://aymmwjoltcerzujgcdoy.supabase.co';
const SUPABASE_KEY = 'sb_publishable_JePMWH6rUnTmp7h4ztTBkw_WUOQi4IP';

function runSqlFile(filePath) {
  return new Promise((resolve, reject) => {
    const sql = fs.readFileSync(filePath, 'utf8');
    const postData = JSON.stringify({ sql });
    
    const options = {
      hostname: SUPABASE_URL.replace('https://', ''),
      path: '/rest/v1/rpc/exec_sql',
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        console.log(`\nExecuted: ${filePath}`);
        console.log(`Status: ${res.statusCode}`);
        console.log(`Response: ${data}`);
        resolve(data);
      });
    });
    
    req.on('error', (error) => {
      console.error(`\nError executing ${filePath}:`, error);
      reject(error);
    });
    
    req.write(postData);
    req.end();
  });
}

async function main() {
  console.log('Starting SQL execution...\n');
  
  try {
    console.log('Step 1: Dropping existing tables...');
    const dropSql = `DROP TABLE IF EXISTS bulk_consumables_registry CASCADE;
      DROP TABLE IF EXISTS patient_records CASCADE;
      DROP TABLE IF EXISTS master_consumables CASCADE;
      DROP TABLE IF EXISTS master_machinery CASCADE;
      DROP TABLE IF EXISTS master_services CASCADE;
      DROP TABLE IF EXISTS profiles CASCADE;
      DROP TABLE IF EXISTS branches CASCADE;`;
    
    const dropData = JSON.stringify({ sql: dropSql });
    await new Promise((resolve, reject) => {
      const options = {
        hostname: SUPABASE_URL.replace('https://', ''),
        path: '/rest/v1/rpc/exec_sql',
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(dropData)
        }
      };
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', resolve);
        req.write(dropData);
        req.end();
      });
      req.on('error', reject);
    });
    
    console.log('Step 2: Creating database schema...');
    await runSqlFile('src/config/schema.sql');
    
    console.log('\nStep 3: Inserting demo data...');
    await runSqlFile('src/config/schema-auth.sql');
    
    console.log('\n✅ All SQL scripts executed successfully!');
    console.log('\nYou can now login at http://localhost:5173/');
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

main();