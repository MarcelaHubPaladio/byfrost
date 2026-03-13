import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing env vars");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTable() {
  const { data, error } = await supabase.rpc('run_sql', {
    sql_query: "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'journeys'"
  });

  if (error) {
    console.error("Error via RPC:", error);
    // Try simple query if RPC fails
    const { data: cols, error: err2 } = await supabase.from('journeys').select('*').limit(1);
    if (err2) {
      console.error("Error via select:", err2);
    } else {
      console.log("Columns found:", Object.keys(cols[0] || {}));
    }
  } else {
    console.log("Result:", JSON.stringify(data, null, 2));
  }
}

checkTable();
