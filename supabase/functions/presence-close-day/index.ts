import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  const fn = "presence-close-day";

  try {
    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers: corsHeaders });
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
    if (!token) {
      return new Response("Unauthorized", { status: 401, headers: corsHeaders });
    }

    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    if (!url || !anonKey) {
      console.error(`[${fn}] Missing env`, { hasUrl: Boolean(url), hasAnon: Boolean(anonKey) });
      return new Response("Server misconfigured", { status: 500, headers: corsHeaders });
    }

    const supabase = createClient(url, anonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: u, error: uErr } = await supabase.auth.getUser(token);
    if (uErr || !u?.user?.id) {
      console.error(`[${fn}] auth.getUser failed`, { uErr });
      return new Response("Unauthorized", { status: 401, headers: corsHeaders });
    }

    const body = await req.json().catch(() => null);
    const tenantId = String(body?.tenantId ?? "").trim();
    const caseId = String(body?.caseId ?? "").trim();
    const note = typeof body?.note === "string" ? body.note : null;

    if (!tenantId || !caseId) {
      return new Response(JSON.stringify({ ok: false, error: "tenantId_and_caseId_required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Extra guard: ensure the case belongs to the tenant.
    const { data: c, error: cErr } = await supabase
      .from("cases")
      .select("id,tenant_id")
      .eq("id", caseId)
      .limit(1)
      .maybeSingle();

    if (cErr) {
      console.error(`[${fn}] Failed to load case`, { cErr });
      return new Response(JSON.stringify({ ok: false, error: "case_lookup_failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!c?.id || String((c as any).tenant_id) !== tenantId) {
      return new Response(JSON.stringify({ ok: false, error: "case_not_in_tenant" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: result, error: rErr } = await supabase.rpc("presence_close_day", {
      p_case_id: caseId,
      p_note: note,
    });

    if (rErr) {
      console.error(`[${fn}] presence_close_day failed`, { rErr });
      return new Response(JSON.stringify({ ok: false, error: rErr.message }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(`[presence-close-day] Unhandled error`, { e });
    return new Response("Internal error", { status: 500, headers: corsHeaders });
  }
});
