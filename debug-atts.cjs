const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const toml = require('toml');

// Read config to get URL
const configStr = fs.readFileSync('supabase/config.toml', 'utf8');
const config = toml.parse(configStr);

// Connect using env vars or defaults
const rpcUrl = "https://pryoirzeghatrgecwrci.supabase.co";
// Need service role key. We'll search for it in .env
require('dotenv').config();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!key) {
  console.log("No key found, please provide one.");
  process.exit(1);
}

const supabase = createClient(rpcUrl, key);

async function run() {
  console.log("Fetching latest 5 cases of type order...");
  const { data: cases, error: caseErr } = await supabase
    .from('cases')
    .select('id, created_at, title, tenant_id')
    .eq('case_type', 'order')
    .order('created_at', { ascending: false })
    .limit(5);
    
  if (caseErr) {
    console.error("Error fetching cases:", caseErr);
    return;
  }
  
  if (!cases || cases.length === 0) {
    console.log("No order cases found");
    return;
  }
  
  const latestCaseId = cases[0].id;
  console.log("Latest case:", cases[0]);
  
  console.log("Fetching case_attachments for this case...");
  const { data: atts, error: attErr } = await supabase
    .from('case_attachments')
    .select('*')
    .eq('case_id', latestCaseId);
    
  if (attErr) {
    console.error("Error fetching attachments:", attErr);
    return;
  }
  
  console.log(`Found ${atts.length} attachments:`);
  console.log(JSON.stringify(atts, null, 2));

  console.log("\nFetching timeline_events for this case...");
  const { data: timeline } = await supabase
    .from('timeline_events')
    .select('event_type, message')
    .eq('case_id', latestCaseId);
  console.log("Timeline events:", timeline);
}

run();
