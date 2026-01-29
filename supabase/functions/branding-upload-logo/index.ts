import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";

const BUCKET = "tenant-assets";

function parseAllowlist() {
  const raw = Deno.env.get("APP_SUPER_ADMIN_EMAILS") ?? "";
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function decodeBase64ToBytes(b64: string) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

serve(async (req) => {
  const fn = "branding-upload-logo";
  try {
    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    if (!supabaseUrl || !anonKey) {
      console.error(`[${fn}] Missing SUPABASE_URL or SUPABASE_ANON_KEY`);
      return new Response(JSON.stringify({ ok: false, error: "Missing env" }), {
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

    // Verify caller using anon client
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
    const isSuperAdmin = Boolean((caller.app_metadata as any)?.byfrost_super_admin);

    const allowlist = parseAllowlist();
    const allowByEmail = allowlist.includes(callerEmail);

    if (!isSuperAdmin && !allowByEmail) {
      console.warn(`[${fn}] forbidden`, { callerEmail, isSuperAdmin });
      return new Response(JSON.stringify({ ok: false, error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => null);
    if (!body) return new Response("Invalid JSON", { status: 400, headers: corsHeaders });

    const tenantId = body.tenantId as string | undefined;
    const filename = (body.filename as string | undefined) ?? "logo.png";
    const contentType = (body.contentType as string | undefined) ?? "image/png";
    const fileBase64 = body.fileBase64 as string | undefined;

    if (!tenantId || !fileBase64) {
      return new Response(JSON.stringify({ ok: false, error: "Missing tenantId or fileBase64" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ext = filename.split(".").pop()?.toLowerCase() || "png";
    const path = `tenants/${tenantId}/logo.${ext}`;

    const supabase = createSupabaseAdmin();

    const bytes = decodeBase64ToBytes(fileBase64);

    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, bytes, { upsert: true, contentType });

    if (upErr) {
      console.error(`[${fn}] upload failed`, { upErr });
      return new Response(JSON.stringify({ ok: false, error: upErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: tenant, error: tErr } = await supabase
      .from("tenants")
      .select("id, branding_json")
      .eq("id", tenantId)
      .maybeSingle();

    if (tErr || !tenant) {
      console.error(`[${fn}] tenant not found`, { tErr });
      return new Response(JSON.stringify({ ok: false, error: "Tenant not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const nextBranding = {
      ...(tenant.branding_json ?? {}),
      logo: { bucket: BUCKET, path, updated_at: new Date().toISOString() },
    };

    const { error: uErr } = await supabase
      .from("tenants")
      .update({ branding_json: nextBranding })
      .eq("id", tenantId);

    if (uErr) {
      console.error(`[${fn}] tenant update failed`, { uErr });
      return new Response(JSON.stringify({ ok: false, error: "Failed to update tenant" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabase.rpc("append_audit_ledger", {
      p_tenant_id: tenantId,
      p_payload: { kind: "tenant_logo_uploaded", path, contentType, by: callerEmail },
    });

    const publicUrl = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

    console.log(`[${fn}] logo uploaded`, { tenantId, path, by: callerEmail });

    return new Response(JSON.stringify({ ok: true, tenantId, bucket: BUCKET, path, publicUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(`[branding-upload-logo] Unhandled error`, { e: String(e) });
    return new Response("Internal error", { status: 500, headers: corsHeaders });
  }
});
