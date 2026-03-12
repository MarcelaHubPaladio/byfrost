
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const connectionString = 'postgresql://postgres.pryoirzeghatrgecwrci:Lunnar%40q1w2@aws-0-us-east-1.pooler.supabase.com:6543/postgres';

async function apply() {
  const client = new Client({
    connectionString: connectionString,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    await client.connect();
    console.log('Connected to Supabase DB');

    const sqlPath = path.resolve(__dirname, 'supabase/migrations/20260312153000_fix_agroforte_vendedor_senior_perms.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log('Applying migration...');
    const res = await client.query(sql);
    console.log('Migration applied successfully!');
    
  } catch (err) {
    console.error('Error applying migration:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

apply();
