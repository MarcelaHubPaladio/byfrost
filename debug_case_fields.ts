import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const url = Deno.env.get("VITE_SUPABASE_URL");
const key = Deno.env.get("VITE_SUPABASE_ANON_KEY");

if (!url || !key) {
    console.error("Missing env");
    Deno.exit(1);
}

const supabase = createClient(url, key);

async function check() {
    const { data, error } = await supabase.from('case_fields').insert({
        tenant_id: "8c7ea1b6-79cf-4a47-a7dc-324da4d1d810", // Need a real tenant
        case_id: "ab1605db-47f0-42ce-8aa3-3dc15abdace8", // from screenshot
        key: "name",
        value_text: "Felipe",
        source: "test"
    });
    console.log("Error inserting:", error);
}

check();
