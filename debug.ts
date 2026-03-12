import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const anonKey = process.env.SUPABASE_ANON_KEY;
const url = process.env.SUPABASE_URL || "https://pryoirzeghatrgecwrci.supabase.co";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(url, serviceKey || anonKey);

async function run() {
  console.log("Fetching case_attachments...");
  const res = await fetch(`${url}/rest/v1/case_attachments?select=id,kind,storage_path,created_at&limit=1`, {
    headers: {
      "apikey": serviceKey || anonKey,
      "Authorization": `Bearer ${serviceKey || anonKey}`
    }
  });
  
  const text = await res.text();
  console.log("Status:", res.status);
  console.log("Body:", text);
}

run();
