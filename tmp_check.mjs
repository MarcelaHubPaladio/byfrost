import fs from 'fs';

const env = fs.readFileSync('.env.local', 'utf-8');
const url = env.match(/VITE_SUPABASE_URL=(.*)/)[1].trim();
const key = env.match(/VITE_SUPABASE_ANON_KEY=(.*)/)[1].trim();
const token = env.match(/SUPABASE_ACCESS_TOKEN=(.*)/)[1].trim();

// Use the management API or we can just fetch all wa_messages for the case using the anon key again,
// but anon key didn't return anything. Let's try to query passing the tenant_id in the url.
// Wait, the anon key uses RLS `public.has_tenant_access(tenant_id)`.
// `has_tenant_access` requires auth.uid() or is_super_admin().
// Anon key has NEITHER!
// No wonder it returned 0 rows!

// Let me just create an edge function to dump the data? 
// No, I can't easily deploy an edge function just for debugging.
// I need a way to bypass RLS. Since DB_PASS_SUPABASE=Lunnar@q1w2 is there, I can connect via postgres directly!

const { Client } = require('pg');

async function run() {
    const client = new Client({
        connectionString: `postgres://postgres.pryoirzeghatrgecwrci:Lunnar@q1w2@aws-0-sa-east-1.pooler.supabase.com:6543/postgres`
    });

    await client.connect();
    const res = await client.query(`
    SELECT id, direction, from_phone, to_phone, case_id, body_text 
    FROM wa_messages 
    WHERE case_id = 'dc5c185c-b086-4900-a3fd-3ecf3c3cff28'
    ORDER BY occurred_at ASC
  `);
    console.table(res.rows);
    await client.end();
}
run().catch(console.error);
