import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.44.2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

    try {
        const supabaseAdmin = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );

        // Let's just fetch everything for that case and output the first 50 messages to check visual discrepancies.
        const { data: messages, error } = await supabaseAdmin
            .from("wa_messages")
            .select("id, case_id, to_phone, from_phone, direction, payload_json, occurred_at")
            .eq('case_id', 'dc5c185c-b086-4900-a3fd-3ecf3c3cff28')
            .order('occurred_at', { ascending: false })
            .limit(50);

        if (error) throw error;

        return new Response(JSON.stringify({ messages }, null, 2), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    } catch (e) {
        return new Response(e.message, { status: 500, headers: corsHeaders });
    }
});
