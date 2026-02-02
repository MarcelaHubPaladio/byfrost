import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function err(message: string, status = 400) {
  return json({ ok: false, error: message }, status);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (req.method !== "POST") return err("method_not_allowed", 405);

    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return err("unauthorized", 401);
    const token = auth.slice("Bearer ".length).trim();

    const body = await req.json().catch(() => null);
    const metaAccountId = String(body?.metaAccountId ?? "").trim();
    const isActive = Boolean(body?.isActive);
    if (!metaAccountId) return err("missing_metaAccountId", 400);

    const supabase = createSupabaseAdmin();

    const { data: userRes, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userRes?.user) return err("unauthorized", 401);

    const userId = userRes.user.id;

    const { data: acc, error: accErr } = await supabase
      .from("meta_accounts")
      .select("id,tenant_id")
      .eq("id", metaAccountId)
      .maybeSingle();

    if (accErr || !acc) return err("not_found", 404);

    const { data: membership, error: memErr } = await supabase
      .from("users_profile")
      .select("user_id")
      .eq("tenant_id", acc.tenant_id)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .maybeSingle();

    const isSuperAdmin = Boolean(
      (userRes.user.app_metadata as any)?.byfrost_super_admin || (userRes.user.app_metadata as any)?.super_admin
    );

    if (memErr || (!membership && !isSuperAdmin)) return err("forbidden", 403);

    const { error: upErr } = await supabase
      .from("meta_accounts")
      .update({ is_active: isActive })
      .eq("id", metaAccountId);

    if (upErr) {
      console.error("[meta-accounts-deactivate] update failed", { error: upErr.message });
      return err("update_failed", 500);
    }

    console.log("[meta-accounts-deactivate] updated", { metaAccountId, isActive, by: userId });

    return json({ ok: true });
  } catch (e: any) {
    console.error("[meta-accounts-deactivate] unhandled", { error: e?.message ?? String(e) });
    return err("internal_error", 500);
  }
});
