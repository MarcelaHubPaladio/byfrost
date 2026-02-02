import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";

const BUCKET = "content-media";

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function err(fn: string, message: string, status = 400) {
  console.error(`[${fn}] error`, { message, status });
  return json({ ok: false, error: message }, status);
}

function decodeBase64ToBytes(b64: string) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function safeFilename(name: string) {
  return (name ?? "file")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .slice(0, 120);
}

serve(async (req) => {
  const fn = "content-upload-media";

  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (req.method !== "POST") return err(fn, "method_not_allowed", 405);

    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.toLowerCase().startsWith("bearer ")) return err(fn, "unauthorized", 401);
    const token = auth.slice("bearer ".length).trim();

    const body = await req.json().catch(() => null);
    const tenantId = String(body?.tenantId ?? "").trim();
    const contentItemId = String(body?.contentItemId ?? "").trim();
    const filename = String(body?.filename ?? "file.bin");
    const contentType = String(body?.contentType ?? "application/octet-stream");
    const fileBase64 = String(body?.fileBase64 ?? "");

    if (!tenantId || !contentItemId || !fileBase64) {
      return err(fn, "missing_params", 400);
    }

    const supabase = createSupabaseAdmin();

    const { data: userRes, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userRes?.user) return err(fn, "unauthorized", 401);

    const userId = userRes.user.id;
    const isSuperAdmin = Boolean(
      (userRes.user.app_metadata as any)?.byfrost_super_admin || (userRes.user.app_metadata as any)?.super_admin
    );

    const { data: membership, error: memErr } = await supabase
      .from("users_profile")
      .select("user_id")
      .eq("tenant_id", tenantId)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .maybeSingle();

    if (memErr || (!membership && !isSuperAdmin)) return err(fn, "forbidden", 403);

    // Ensure content item belongs to tenant (defense-in-depth)
    const { data: item, error: itemErr } = await supabase
      .from("content_items")
      .select("id,tenant_id")
      .eq("id", contentItemId)
      .maybeSingle();

    if (itemErr || !item) return err(fn, "content_item_not_found", 404);
    if (String((item as any).tenant_id) !== tenantId) return err(fn, "forbidden", 403);

    const ext = safeFilename(filename);
    const path = `tenants/${tenantId}/content/${contentItemId}/${crypto.randomUUID()}-${ext}`;

    const bytes = decodeBase64ToBytes(fileBase64);
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, bytes, { upsert: false, contentType });

    if (upErr) {
      console.error(`[${fn}] upload failed`, { error: upErr.message, bucket: BUCKET, path });
      return err(fn, "upload_failed", 500);
    }

    const publicUrl = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

    console.log(`[${fn}] uploaded`, { tenantId, contentItemId, path, by: userId });

    return json({ ok: true, bucket: BUCKET, path, publicUrl });
  } catch (e: any) {
    console.error(`[content-upload-media] unhandled`, { error: e?.message ?? String(e) });
    return json({ ok: false, error: "internal_error" }, 500);
  }
});
