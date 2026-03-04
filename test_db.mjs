import { createClient } from "npm:@supabase/supabase-js@2.44.2";
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const { data } = await supabaseAdmin.from('wa_instances').select('id, name, enable_v2_audit, enable_v1_business').limit(5);
console.log(data);
