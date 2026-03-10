import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";

const BUCKET = "tenant-assets";

type UploadKind = "participants" | "events" | "branding"; // Added "branding"

type Body = {
  action?: "upload" | "sign";
  tenantId?: string;
  kind?: UploadKind;

  // upload (robust support)
  filename?: string;
  fileName?: string;
  contentType?: string;
  mimeType?: string;
  fileBase64?: string;
  mediaBase64?: string;

  // sign
  path?: string;
  expiresIn?: number;
};

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function err(message: string, status = 400) {
  return json({ ok: false, error: message }, status);
}

function decodeBase64ToBytes(b64: string) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function sanitizeFilename(filename: string) {
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
  return safe || "file.bin";
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

function tenantIdFromPath(path: string) {
  const seg1 = path.split("/")[0] ?? "";
  const seg2 = path.split("/")[1] ?? "";
  if (seg1 === "tenants") return seg2;
  return seg1;
}

serve(async (req) => {
  const fn = "upload-tenant-asset";
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (req.method !== "POST") return err("method_not_allowed", 405);

    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return err("unauthorized", 401);
    const token = auth.slice("Bearer ".length).trim();

    const contentTypeHeader = req.headers.get("Content-Type") ?? "";
    let action: string = "upload";
    let tenantIdStr: string = "";
    let kindStr: string = "";
    let fileName: string = "";
    let mimeType: string = "";
    let fileBytes: Uint8Array | null = null;
    let pathParam: string = "";
    let expiresInParam: number = 3600;

    if (contentTypeHeader.includes("multipart/form-data")) {
      const formData = await req.formData();
      action = String(formData.get("action") ?? "upload");
      tenantIdStr = String(formData.get("tenantId") ?? "").trim();
      kindStr = String(formData.get("kind") ?? "").trim();

      const file = formData.get("file");
      if (file instanceof File) {
        fileName = file.name;
        mimeType = file.type;
        fileBytes = new Uint8Array(await file.arrayBuffer());
      }

      pathParam = String(formData.get("path") ?? "").trim();
      expiresInParam = Number(formData.get("expiresIn") ?? 3600);
    } else {
      // Fallback for legacy JSON/Base64 (or if we want to support it for a bit)
      const body = (await req.json().catch(() => null)) as Body | null;
      if (!body) return err("invalid_json", 400);

      action = body.action ?? "upload";
      tenantIdStr = String(body.tenantId ?? "").trim();
      kindStr = String(body.kind ?? "").trim();
      fileName = String(body.filename ?? body.fileName ?? "file.bin");
      mimeType = String(body.contentType ?? body.mimeType ?? "application/octet-stream");

      const b64 = String(body.fileBase64 ?? body.mediaBase64 ?? "").trim();
      if (b64) fileBytes = decodeBase64ToBytes(b64);

      pathParam = String(body.path ?? "").trim();
      expiresInParam = Number(body.expiresIn ?? 3600);
    }

    if (!tenantIdStr || !isUuid(tenantIdStr)) return err("invalid_tenantId", 400);

    const supabase = createSupabaseAdmin();

    const { data: userRes, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userRes?.user) return err("unauthorized", 401);

    const userId = userRes.user.id;
    const isSuperAdmin = Boolean(
      (userRes.user.app_metadata as any)?.byfrost_super_admin ||
      (userRes.user.app_metadata as any)?.super_admin,
    );

    // Tenant boundary
    const { data: membership, error: memErr } = await supabase
      .from("users_profile")
      .select("user_id")
      .eq("tenant_id", tenantIdStr)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .maybeSingle();

    if (memErr || (!membership && !isSuperAdmin)) {
      console.warn(`[${fn}] forbidden`, { tenantId: tenantIdStr, userId, memErr });
      return err("forbidden", 403);
    }

    if (action === "sign") {
      if (!pathParam) return err("missing_path", 400);

      const pathTenantId = tenantIdFromPath(pathParam);
      if (pathTenantId !== tenantIdStr) return err("cross_tenant_path", 403);

      const expiresIn = Math.max(60, Math.min(expiresInParam, 60 * 60 * 24));

      const { data, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(pathParam, expiresIn);

      if (error || !data?.signedUrl) {
        return err(error?.message ?? "sign_failed", 500);
      }

      return json({ ok: true, bucket: BUCKET, path: pathParam, signedUrl: data.signedUrl, expiresIn });
    }

    // action === "upload"
    const kind = kindStr as UploadKind;
    if (kind !== "participants" && kind !== "events" && kind !== "branding") return err("invalid_kind", 400);

    if (!fileBytes) return err("missing_file", 400);

    const safeFilenameStr = sanitizeFilename(fileName);
    const uid = crypto.randomUUID();
    const path = `${tenantIdStr}/${kind}/${uid}-${safeFilenameStr}`;

    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, fileBytes, {
      upsert: false,
      contentType: mimeType,
    });

    if (upErr) {
      console.error(`[${fn}] upload failed`, { error: upErr.message, tenantId: tenantIdStr, path });
      return err(upErr.message, 500);
    }

    const { data: signData } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, 3600 * 24 * 365);

    const publicUrl = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

    return json({
      ok: true,
      bucket: BUCKET,
      path,
      signedUrl: signData?.signedUrl || null,
      publicUrl,
      expiresIn: 3600 * 24 * 365
    });
  } catch (e: any) {
    console.error(`[upload-tenant-asset] unhandled`, { error: e?.message ?? String(e) });
    return err("internal_error", 500);
  }
});
