// Temporary migration script — applies DDL via service role using pg protocol
// Run: node scripts/apply-migration.js
const https = require('https');

const SUPABASE_URL = 'https://zerqgebtzjombkwjxysg.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InplcnFnZWJ0empvbWJrd2p4eXNnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTIwNjk3NCwiZXhwIjoyMDkwNzgyOTc0fQ.ATtQWya1hVrePxXd2mA2JsqJn8I98VePHMRFJge2uEU';

// Try exec_sql RPC (exists in some Supabase projects)
const sql = `
  alter table biotech_user_settings add column if not exists capture_mode text not null default 'assisted';
  update biotech_user_settings set capture_mode = 'native' where true;
  alter table cro_engagements add column if not exists capture_mode text not null default 'native';
  alter table cro_engagements add column if not exists reply_to_address text;
`;

const body = JSON.stringify({ query: sql });

const options = {
  hostname: 'zerqgebtzjombkwjxysg.supabase.co',
  path: '/rest/v1/rpc/query',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'apikey': SERVICE_ROLE_KEY,
    'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
    'Content-Length': Buffer.byteLength(body),
  },
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Response:', data);
  });
});

req.on('error', (err) => console.error('Error:', err));
req.write(body);
req.end();
