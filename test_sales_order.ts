import { createClient } from "https://esm.sh/@supabase/supabase-js@2.44.2";
const supabase = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
const { data, error } = await supabase.from("journeys").select("*").eq("key", "sales_order").single();
console.log(JSON.stringify(data?.default_state_machine_json, null, 2));
