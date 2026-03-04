import { Client } from 'npm:pg';
import "jsr:@std/dotenv/load";

async function run() {
    const client = new Client({
        connectionString: `postgres://postgres.pryoirzeghatrgecwrci:Lunnar@q1w2@aws-0-sa-east-1.pooler.supabase.com:6543/postgres`
    });

    await client.connect();
    const res = await client.query(`
    SELECT id, tenant_id, instance_id, direction, from_phone, to_phone, case_id, type, body_text 
    FROM wa_messages 
    WHERE case_id = 'dc5c185c-b086-4900-a3fd-3ecf3c3cff28'
    ORDER BY occurred_at DESC
    LIMIT 20
  `);
    console.table(res.rows.reverse());

    const res2 = await client.query(`
    SELECT id, tenant_id, instance_id, direction, from_phone, to_phone, case_id, type, body_text 
    FROM wa_messages
    WHERE to_phone LIKE '%554299702963%' OR from_phone LIKE '%554299702963%'
    ORDER BY occurred_at DESC
    LIMIT 10
  `);
    console.log('--- BY PHONE ---');
    console.table(res2.rows.reverse());

    await client.end();
}
run().catch(console.error);
