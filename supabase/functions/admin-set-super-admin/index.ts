import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";

function parseAllowlist() {
  const raw = Deno.env.get("APP_SUPER_ADMIN_EMAILS") ?? "";
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

serve(async (req) => {
  const fn = "admin-set-super-admin";
  try {
    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !anonKey || !serviceKey) {
      console.error(`[${fn}] Missing env`, {
        hasUrl: Boolean(supabaseUrl),
        hasAnon: Boolean(anonKey),
        hasService: Boolean(serviceKey),
      });
      return new Response(JSON.stringify({ ok: false, error: "Missing Supabase env" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.slice("bearer ".length).trim();

    // Verify caller JWT using anon client
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });

    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      console.warn(`[${fn}] auth.getUser failed`, { userErr });
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const caller = userData.user;
    const callerEmail = String(caller.email ?? "").toLowerCase();

    const allowlist = parseAllowlist();
    if (!allowlist.includes(callerEmail)) {
      console.warn(`[${fn}] caller not in allowlist`, { callerEmail });
      return new Response(JSON.stringify({ ok: false, error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const targetUserId = (body.userId as string | undefined) ?? caller.id;
    const set = (body.set as boolean | undefined) ?? true;

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    const { data: existing, error: getErr } = await admin.auth.admin.getUserById(targetUserId);
    if (getErr || !existing?.user) {
      console.error(`[${fn}] getUserById failed`, { getErr });
      return new Response(JSON.stringify({ ok: false, error: "Target user not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const currentAppMeta = (existing.user.app_metadata ?? {}) as Record<string, unknown>;

    const nextAppMeta = {
      ...currentAppMeta,
      byfrost_super_admin: set,
    };

    const { data: updated, error: updErr } = await admin.auth.admin.updateUserById(targetUserId, {
      app_metadata: nextAppMeta,
    });

    if (updErr) {
      console.error(`[${fn}] updateUserById failed`, { updErr });
      return new Response(JSON.stringify({ ok: false, error: "Failed to update user" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[${fn}] Updated byfrost_super_admin`, {
      callerEmail,
      targetUserId,
      set,
    });

    return new Response(
      JSON.stringify({
        ok: true,
        targetUserId,
        set,
        app_metadata: updated.user?.app_metadata ?? nextAppMeta,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error(`[admin-set-super-admin] Unhandled error`, { e: String(e) });
    return new Response("Internal error", { status: 500, headers: corsHeaders });
  }
});
