
const { Client } = require('pg');
const connectionString = 'postgresql://postgres.pryoirzeghatrgecwrci:Lunnar%40q1w2@aws-0-us-east-1.pooler.supabase.com:6543/postgres';

async function check() {
  const client = new Client({
    connectionString: connectionString,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();
  console.log('Connected.');

  console.log('--- Tenants ---');
  const tenants = await client.query('SELECT id, name, slug FROM public.tenants WHERE deleted_at IS NULL');
  console.log(tenants.rows);

  console.log('\n--- Roles ---');
  const roles = await client.query('SELECT id, key, name FROM public.roles');
  console.log(roles.rows);

  // Find agroforte tenant and vendedor-senior role
  const agroforte = tenants.rows.find(t => t.name.toLowerCase().includes('agroforte') || t.slug.toLowerCase().includes('agroforte'));
  const seniorRole = roles.rows.find(r => r.key === 'vendedor-senior' || (r.name && r.name.toLowerCase().includes('vendedor-senior')));

  if (agroforte && seniorRole) {
    console.log(`\nFound target: Tenant ID ${agroforte.id}, Role ID ${seniorRole.id}`);
    
    console.log('\n--- Current Permissions ---');
    const perms = await client.query('SELECT * FROM public.tenant_route_permissions WHERE tenant_id = $1 AND role_id = $2', [agroforte.id, seniorRole.id]);
    console.log(perms.rows);
  } else {
    console.log('\nCould not find agroforte or senior role in current results.');
  }
  await client.end();
}

check();
