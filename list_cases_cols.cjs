const { Client } = require('pg');

async function listColumns() {
  const client = new Client({
    connectionString: "postgresql://postgres:Lunnar@q1w2@db.pryoirzeghatrgecwrci.supabase.co:5432/postgres"
  });

  try {
    await client.connect();
    const res = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'cases' 
      ORDER BY ordinal_position
    `);
    console.log(JSON.stringify(res.rows, null, 2));
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}

listColumns();
