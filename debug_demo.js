const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8').split('\n').filter(Boolean).reduce((acc, line) => {
  const [k, ...v] = line.split('=');
  if (k) acc[k] = v.join('=');
  return acc;
}, {});

const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_ACCESS_TOKEN || env.VITE_SUPABASE_ANON_KEY);
(async () => {
    // 1. Get the sales order case
    const { data: c, error: cErr } = await supabase.from('cases').select('*').eq('id', 'ab1605db-47f0-42ce-8aa3-3dc15abdace8').single();
    if (cErr) { console.error("Case error:", cErr); return; }
    console.log("Found Case:", c.title, "Tenant:", c.tenant_id);

    // 2. Try inserting a field
    const { error } = await supabase.from('case_fields').insert({
        tenant_id: c.tenant_id,
        case_id: c.id,
        key: 'test_key',
        value_text: 'Test',
        source: 'crm_generation'
    });
    console.log("Insert Error?", error);

    // 3. See what fields it has
    const { data: fields } = await supabase.from('case_fields').select('*').eq('case_id', c.id);
    console.log("Current fields:", fields?.map(f => f.key));
})();
