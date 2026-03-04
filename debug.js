import fs from 'fs';

const env = fs.readFileSync('.env.local', 'utf8').split('\n').filter(Boolean).reduce((acc, line) => {
    const [k, ...v] = line.split('=');
    if (k) acc[k] = v.join('=');
    return acc;
}, {});

const URL = env.VITE_SUPABASE_URL + '/rest/v1';
const KEY = env.VITE_SUPABASE_ANON_KEY;

async function check() {
    const resCase = await fetch(`${URL}/cases?id=eq.ab1605db-47f0-42ce-8aa3-3dc15abdace8`, {
        headers: { 'apikey': KEY, 'Authorization': `Bearer ${KEY}` }
    });
    const caseData = await resCase.json();
    console.log("Case:", caseData[0]?.title, "Customer ID:", caseData[0]?.customer_id, "Tenant:", caseData[0]?.tenant_id);

    if (!caseData[0]) return;

    const resIns = await fetch(`${URL}/case_fields`, {
        method: 'POST',
        headers: { 'apikey': KEY, 'Authorization': `Bearer ${KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
        body: JSON.stringify({
            tenant_id: caseData[0].tenant_id,
            case_id: caseData[0].id,
            key: "test_field_xx",
            value_text: "Felipe",
            source: "crm_generation"
        })
    });
    console.log("Insert Response:", resIns.status, await resIns.text());
}

check();
