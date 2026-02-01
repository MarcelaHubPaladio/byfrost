import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";
import { clockPresencePunch } from "../_shared/presence.ts";

serve(async (req) => {
  const fn = "presence-clock";

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
    if (!tenantId) {
      return new Response(JSON.stringify({ ok: false, error: "tenantId_required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const latitude = body?.latitude != null ? Number(body.latitude) : null;
    const longitude = body?.longitude != null ? Number(body.longitude) : null;
    const accuracyMeters = body?.accuracyMeters != null ? Number(body.accuracyMeters) : null;

    const res = await clockPresencePunch({
      supabase,
      tenantId,
      employeeId: u.user.id,
      source: "APP",
      latitude,
      longitude,
      accuracyMeters,
      forcedType: null,
      actorType: "admin",
      actorId: u.user.id,
    });

    if (!res.ok) {
      return new Response(JSON.stringify(res), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(res), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(`[presence-clock] Unhandled error`, { e });
    return new Response("Internal error", { status: 500, headers: corsHeaders });
  }
});
