const sql = `
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'cases' 
ORDER BY ordinal_position
`;

async function query() {
  try {
    const response = await fetch('https://pryoirzeghatrgecwrci.supabase.co/functions/v1/run-sql-patch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql: `SELECT json_agg(t) FROM (${sql}) t` })
    });
    const result = await response.json();
    console.log('Result:', JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('Error applying query:', err);
  }
}

query();
