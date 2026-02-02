import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";

type RoleKey = string;

type GenerateLinkType = "invite" | "magiclink";

function normalizePhone(v: any): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  if (s.startsWith("+")) return s;
  const digits = s.replace(/\D/g, "");
  return digits ? `+${digits}` : null;
}

function isAlreadyRegisteredError(message: string) {
  const msg = (message ?? "").toLowerCase();
  return (
    msg.includes("already") && (msg.includes("registered") || msg.includes("exists"))
  );
}

serve(async (req) => {
  const fn = "admin-invite-user";

  try {
    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
    if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

    // Manual auth handling (verify_jwt is false)
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7) : "";
    if (!token) {
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createSupabaseAdmin();

    const { data: authData, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !authData?.user) {
      console.error(`[${fn}] auth.getUser failed`, { authErr });
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const caller = authData.user;
    const isSuperAdmin = Boolean(
      (caller.app_metadata as any)?.byfrost_super_admin || (caller.app_metadata as any)?.super_admin
    );

    if (!isSuperAdmin) {
      return new Response(JSON.stringify({ ok: false, error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => null);
    if (!body) {
      return new Response(JSON.stringify({ ok: false, error: "Invalid JSON" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tenantId = String(body.tenantId ?? "").trim();
    const email = String(body.email ?? "").trim().toLowerCase();
    const role = String(body.role ?? "").trim() as RoleKey;
    const displayName = String(body.displayName ?? "").trim() || null;
    const phoneE164 = normalizePhone(body.phoneE164);
    const redirectTo = typeof body.redirectTo === "string" ? body.redirectTo.trim() : "";

    if (!tenantId || !email || !role) {
      return new Response(JSON.stringify({ ok: false, error: "Missing tenantId/email/role" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate that the role exists and is enabled for the tenant
    const { data: roleRow, error: roleErr } = await supabase
      .from("tenant_roles")
      .select("role_id, enabled, roles(key)")
      .eq("tenant_id", tenantId)
      .eq("enabled", true)
      .eq("roles.key", role)
      .limit(1)
      .maybeSingle();

    if (roleErr) {
      console.error(`[${fn}] role validation failed`, { roleErr });
      return new Response(JSON.stringify({ ok: false, error: roleErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!roleRow?.role_id) {
      return new Response(JSON.stringify({ ok: false, error: "Invalid role for tenant" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Primary path: try to send the invite email.
    // NOTE: This can fail when SMTP is not configured OR when the user already exists.
    const { data: invited, error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(email);

    // Secondary path: ALWAYS attempt to generate a link when invite email fails.
    // This also fixes a common admin scenario:
    // - user already exists in Auth (so inviteUserByEmail fails)
    // - but the admin deleted users_profile and needs to re-attach the user to a tenant
    // In that case, we generate a magiclink (login link) and still upsert users_profile.
    if (inviteErr || !invited?.user) {
      const errMsg = String(inviteErr?.message ?? "");
      console.warn(`[${fn}] inviteUserByEmail failed; trying generateLink`, { errMsg });

      const firstTry: GenerateLinkType = isAlreadyRegisteredError(errMsg) ? "magiclink" : "invite";
      const tryOrder: GenerateLinkType[] = firstTry === "invite" ? ["invite", "magiclink"] : ["magiclink", "invite"];

      let linkData: any = null;
      let linkTypeUsed: GenerateLinkType | null = null;
      let lastLinkErr: any = null;

      for (const t of tryOrder) {
        const { data, error } = await supabase.auth.admin.generateLink({
          type: t,
          email,
          options: redirectTo ? { redirectTo } : undefined,
        } as any);

        if (!error && data?.user && (data as any)?.properties?.action_link) {
          linkData = data;
          linkTypeUsed = t;
          break;
        }

        lastLinkErr = error;
        console.warn(`[${fn}] generateLink failed`, { type: t, errorMessage: String(error?.message ?? "") });
      }

      if (!linkData?.user || !linkData?.properties?.action_link) {
        console.error(`[${fn}] generateLink exhausted`, { lastLinkErr });
        return new Response(
          JSON.stringify({
            ok: false,
            error: (lastLinkErr as any)?.message ?? inviteErr?.message ?? "Invite failed",
            hint:
              "Se o usuário já existe, use o link (magiclink) para ele entrar. Se SMTP estiver desligado, compartilhe o link manual.",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const userId = linkData.user.id;
      const inviteLink = (linkData as any).properties.action_link as string;

      const { error: profErr } = await supabase
        .from("users_profile")
        .upsert(
          {
            user_id: userId,
            tenant_id: tenantId,
            role,
            display_name: displayName,
            phone_e164: phoneE164,
            email,
            deleted_at: null,
          } as any,
          { onConflict: "user_id,tenant_id" }
        );

      if (profErr) {
        console.error(`[${fn}] users_profile upsert failed`, { profErr });
        return new Response(JSON.stringify({ ok: false, error: profErr.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Store invite attempt for later retrieval in the admin panel
      const { error: invErr } = await supabase.from("user_invites").insert({
        tenant_id: tenantId,
        user_id: userId,
        email,
        sent_email: false,
        invite_link: inviteLink,
        created_by_user_id: caller.id,
      } as any);

      if (invErr) {
        console.warn(`[${fn}] user_invites insert failed (ignored)`, { invErr });
      }

      // Back-compat: keep vendors/leaders tables in sync when role is vendor/leader.
      if (phoneE164 && (role === "vendor" || role === "leader")) {
        const table = role === "vendor" ? "vendors" : "leaders";
        const payload = {
          tenant_id: tenantId,
          phone_e164: phoneE164,
          display_name: displayName,
          active: true,
          deleted_at: null,
        };

        const { error: upErr } = await supabase.from(table).upsert(payload as any, { onConflict: "tenant_id,phone_e164" });

        if (upErr) {
          console.warn(`[${fn}] ${table} upsert failed (ignored)`, { upErr });
        }
      }

      console.log(`[${fn}] invited user (manual link)`, {
        tenantId,
        userId,
        role,
        email,
        linkType: linkTypeUsed,
        inviteErr: inviteErr ? String(inviteErr.message ?? "") : null,
      });

      return new Response(
        JSON.stringify({
          ok: true,
          userId,
          sentEmail: false,
          inviteLink,
          linkType: linkTypeUsed,
          note:
            linkTypeUsed === "magiclink"
              ? "Usuário já existia no Auth; gerei magiclink e reativei o vínculo no tenant (users_profile)."
              : "Gerei link de convite e reativei o vínculo no tenant (users_profile).",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Invite email succeeded.
    const userId = invited.user.id;

    const { error: profErr } = await supabase
      .from("users_profile")
      .upsert(
        {
          user_id: userId,
          tenant_id: tenantId,
          role, // users_profile.role guarda a key do cargo
          display_name: displayName,
          phone_e164: phoneE164,
          email,
          deleted_at: null,
        } as any,
        { onConflict: "user_id,tenant_id" }
      );

    if (profErr) {
      console.error(`[${fn}] users_profile upsert failed`, { profErr });
      return new Response(JSON.stringify({ ok: false, error: profErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Store invite attempt
    const { error: invErr } = await supabase.from("user_invites").insert({
      tenant_id: tenantId,
      user_id: userId,
      email,
      sent_email: true,
      invite_link: null,
      created_by_user_id: caller.id,
    } as any);

    if (invErr) {
      console.warn(`[${fn}] user_invites insert failed (ignored)`, { invErr });
    }

    // Back-compat: keep vendors/leaders tables in sync when role is vendor/leader.
    if (phoneE164 && (role === "vendor" || role === "leader")) {
      const table = role === "vendor" ? "vendors" : "leaders";
      const payload = {
        tenant_id: tenantId,
        phone_e164: phoneE164,
        display_name: displayName,
        active: true,
        deleted_at: null,
      };

      const { error: upErr } = await supabase.from(table).upsert(payload as any, { onConflict: "tenant_id,phone_e164" });

      if (upErr) {
        console.warn(`[${fn}] ${table} upsert failed (ignored)`, { upErr });
      }
    }

    console.log(`[${fn}] invited user`, { tenantId, userId, role, email });

    return new Response(JSON.stringify({ ok: true, userId, sentEmail: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(`[admin-invite-user] Unhandled error`, { e });
    return new Response("Internal error", { status: 500, headers: corsHeaders });
  }
});