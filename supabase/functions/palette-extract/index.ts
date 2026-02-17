import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// Minimal, authenticated palette extraction for internal usage (public portal theming).
// Uses Google Vision (IMAGE_PROPERTIES) like branding-extract-palette, but does NOT update the DB.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function createSupabaseAdmin() {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (!url || !serviceKey) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");

  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function err(message: string, status = 400, detail?: any) {
  return json({ ok: false, error: message, detail }, status);
}

function toHex(n: number) {
  const v = Math.max(0, Math.min(255, Math.round(n)));
  return v.toString(16).padStart(2, "0");
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function luminance(r: number, g: number, b: number) {
  const srgb = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
}

function bestTextOn(r: number, g: number, b: number) {
  const L = luminance(r, g, b);
  return L > 0.6 ? "#0b1220" : "#fffdf5";
}

async function fetchAsBase64(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch_failed_${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());

  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    bin += String.fromCharCode(...buf.slice(i, i + chunk));
  }
  return btoa(bin);
}

function extractVisionError(json: any): string | null {
  const top = json?.error?.message;
  if (typeof top === "string" && top.trim()) return top;
  const perReq = json?.responses?.[0]?.error?.message;
  if (typeof perReq === "string" && perReq.trim()) return perReq;
  return null;
}

type Body = {
  tenantId?: string;
  logoUrl?: string;
  bucket?: string;
  path?: string;
};

serve(async (req) => {
  const fn = "palette-extract";

  try {
    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
    if (req.method !== "POST") return err("method_not_allowed", 405);

    const apiKey = (Deno.env.get("GOOGLE_VISION_API_KEY") ?? "").trim();
    if (!apiKey) return err("Missing GOOGLE_VISION_API_KEY", 400);

    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.toLowerCase().startsWith("bearer ")) return err("unauthorized", 401);
    const token = auth.slice("bearer ".length).trim();

    const body = (await req.json().catch(() => null)) as Body | null;
    if (!body) return err("invalid_json", 400);

    const tenantId = String(body.tenantId ?? "").trim();
    if (!tenantId) return err("missing_tenantId", 400);

    const supabase = createSupabaseAdmin();

    const { data: userRes, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userRes?.user) return err("unauthorized", 401);

    const isSuperAdmin = Boolean(
      (userRes.user.app_metadata as any)?.byfrost_super_admin || (userRes.user.app_metadata as any)?.super_admin
    );

    if (!isSuperAdmin) {
      const { data: membership, error: mErr } = await supabase
        .from("users_profile")
        .select("user_id")
        .eq("tenant_id", tenantId)
        .eq("user_id", userRes.user.id)
        .is("deleted_at", null)
        .maybeSingle();

      if (mErr) return err("membership_check_failed", 500, { message: mErr.message });
      if (!membership) return err("forbidden", 403);
    }

    let logoUrl = String(body.logoUrl ?? "").trim();

    if (!logoUrl) {
      const bucket = String(body.bucket ?? "").trim();
      const path = String(body.path ?? "").trim();
      if (!bucket || !path) return err("missing_logo", 400, { hint: "Provide logoUrl or (bucket+path)" });

      const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60);
      if (error || !data?.signedUrl) return err("sign_failed", 500, { message: error?.message });
      logoUrl = data.signedUrl;
    }

    const content = await fetchAsBase64(logoUrl);

    const endpoint = `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(apiKey)}`;

    const visionReq = {
      requests: [{ image: { content }, features: [{ type: "IMAGE_PROPERTIES" }] }],
    };

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(visionReq),
    });

    const j = await res.json().catch(() => null);
    const visionErr = extractVisionError(j);
    if (!res.ok || !j || visionErr) {
      return err(
        visionErr ? `Google Vision: ${visionErr}` : "Google Vision request failed",
        502,
        { upstreamStatus: res.status }
      );
    }

    const colors = j?.responses?.[0]?.imagePropertiesAnnotation?.dominantColors?.colors ?? [];

    const top = (colors as any[])
      .map((c) => ({
        r: Number(c?.color?.red ?? 0),
        g: Number(c?.color?.green ?? 0),
        b: Number(c?.color?.blue ?? 0),
        score: Number(c?.score ?? 0),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);

    if (!top.length) return err("No dominant colors found", 422);

    const palette = {
      primary: { hex: rgbToHex(top[0].r, top[0].g, top[0].b), text: bestTextOn(top[0].r, top[0].g, top[0].b) },
      secondary: top[1]
        ? { hex: rgbToHex(top[1].r, top[1].g, top[1].b), text: bestTextOn(top[1].r, top[1].g, top[1].b) }
        : null,
      tertiary: top[2]
        ? { hex: rgbToHex(top[2].r, top[2].g, top[2].b), text: bestTextOn(top[2].r, top[2].g, top[2].b) }
        : null,
      quaternary: top[3]
        ? { hex: rgbToHex(top[3].r, top[3].g, top[3].b), text: bestTextOn(top[3].r, top[3].g, top[3].b) }
        : null,
      source: "google_vision:image_properties",
    };

    return json({ ok: true, tenantId, palette, logoUrl });
  } catch (e: any) {
    console.error(`[${fn}] unhandled`, { error: e?.message ?? String(e) });
    return err("internal_error", 500, { message: e?.message ?? String(e) });
  }
});
