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

async function findUserIdByEmail(admin: ReturnType<typeof createClient>, email: string) {
  // Supabase Auth doesn't have a direct getUserByEmail in the public JS API.
  // We page through users (bounded) and match by email.
  const target = email.trim().toLowerCase();
  if (!target) return null;

  const PER_PAGE = 200;
  const MAX_PAGES = 25; // hard cap to avoid long scans

  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: PER_PAGE });
    if (error) throw error;

    const users = data?.users ?? [];
    for (const u of users) {
      if (String(u.email ?? "").toLowerCase() === target) return u.id;
    }

    // no more pages
    if (users.length < PER_PAGE) break;
  }

  return null;
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

    const set = (body.set as boolean | undefined) ?? true;
    const email = String(body.email ?? "").trim().toLowerCase();
    const userId = String(body.userId ?? "").trim();

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    let targetUserId = userId || "";
    if (!targetUserId && email) {
      try {
        targetUserId = (await findUserIdByEmail(admin, email)) ?? "";
      } catch (e) {
        console.error(`[${fn}] listUsers failed`, { e: String(e) });
        return new Response(JSON.stringify({ ok: false, error: "Failed to search users" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Default to self if no target given.
    if (!targetUserId) targetUserId = caller.id;

    const { data: existing, error: getErr } = await admin.auth.admin.getUserById(targetUserId);
    if (getErr || !existing?.user) {
      console.error(`[${fn}] getUserById failed`, { getErr, targetUserId });
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
      targetEmail: email || null,
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