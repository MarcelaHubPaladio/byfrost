import { serve } from 'https://deno.land/std@0.190.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    // Agroforte ID from UI: 97985c55-becc-4087-b376-5fa7ce461c26
    const agroId = '97985c55-becc-4087-b376-5fa7ce461c26';
    
    console.log('Fetching diagnostic data...');
    const { data: journeys } = await supabaseAdmin.from('journeys').select('*')
    const { data: tenantJourneys } = await supabaseAdmin.from('tenant_journeys').select('*, journeys(*)').eq('tenant_id', agroId)
    const { data: roles } = await supabaseAdmin.from('roles').select('id, key, name')
    const { data: profiles } = await supabaseAdmin.from('users_profile').select('*').eq('tenant_id', agroId).is('deleted_at', null)
    
    // Check RLS policies
    const { data: policies } = await supabaseAdmin.rpc('run_sql', { 
      sql_query: "SELECT tablename, policyname, roles, cmd, qual FROM pg_policies WHERE tablename IN ('journeys', 'tenant_journeys', 'cases')" 
    }).catch(() => ({ data: null }))

    return new Response(JSON.stringify({ 
      ok: true, 
      diagnostics: {
        journeys,
        tenantJourneys,
        roles,
        profiles,
        policies
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
