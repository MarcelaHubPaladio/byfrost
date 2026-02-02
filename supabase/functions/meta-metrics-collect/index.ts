import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { collectContentMetricsSnapshot } from "../_shared/metaMetrics.ts";
import { buildPerformanceReport } from "../_shared/performanceAnalyst.ts";

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function err(message: string, status = 400, extra?: any) {
  return json({ ok: false, error: message, ...extra }, status);
}

serve(async (req) => {
  const fn = "meta-metrics-collect";
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (req.method !== "POST") return err("method_not_allowed", 405);

    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return err("unauthorized", 401);
    const token = auth.slice("Bearer ".length).trim();

    const body = await req.json().catch(() => null);
    const tenantId = String(body?.tenantId ?? "").trim();
    const publicationId = String(body?.publicationId ?? "").trim();
    const windowDays = Number(body?.windowDays ?? 1);

    if (!tenantId) return err("missing_tenantId", 400);
    if (!publicationId) return err("missing_publicationId", 400);
    if (![1, 3, 7].includes(windowDays)) return err("invalid_windowDays", 400);

    const supabase = createSupabaseAdmin();

    // Manual auth (verify_jwt is false)
    const { data: userRes, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userRes?.user) {
      console.error(`[${fn}] auth.getUser failed`, { error: userErr?.message });
      return err("unauthorized", 401);
    }

    const userId = userRes.user.id;

    // Tenant membership check (multi-tenant boundary)
    const { data: membership, error: memErr } = await supabase
      .from("users_profile")
      .select("user_id")
      .eq("tenant_id", tenantId)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .maybeSingle();

    const isSuperAdmin = Boolean(
      (userRes.user.app_metadata as any)?.byfrost_super_admin || (userRes.user.app_metadata as any)?.super_admin
    );

    if (memErr || (!membership && !isSuperAdmin)) return err("forbidden", 403);

    const out = await collectContentMetricsSnapshot({
      supabase,
      tenantId,
      publicationId,
      windowDays: windowDays as 1 | 3 | 7,
    });

    if (!out.ok) return err(out.error, 400);

    // Fetch all snapshots for the publication to generate a better report
    const { data: snaps } = await supabase
      .from("content_metrics_snapshots")
      .select("window_days,impressions,profile_visits,follows,messages")
      .eq("tenant_id", tenantId)
      .eq("publication_id", publicationId)
      .order("window_days", { ascending: true })
      .limit(10);

    const points = (snaps ?? []).map((s: any) => ({
      window_days: Number(s.window_days),
      impressions: s.impressions ?? null,
      profile_visits: s.profile_visits ?? null,
      follows: s.follows ?? null,
      messages: s.messages ?? null,
    }));

    const report = buildPerformanceReport({ points, channel: out.publication.channel });

    // Write a decision log (agent output)
    const { data: agent } = await supabase
      .from("agents")
      .select("id")
      .eq("key", "performance_analyst_agent")
      .limit(1)
      .maybeSingle();

    if (agent?.id) {
      await supabase.from("decision_logs").insert({
        tenant_id: tenantId,
        case_id: out.publication.case_id,
        agent_id: agent.id,
        input_summary: `Métricas D+${windowDays} (publicação ${publicationId.slice(0, 8)}…)`,
        output_summary: `Relatório do guardião (D+${windowDays})`,
        reasoning_public: report.reportText,
        why_json: {
          kind: "content_performance_report",
          publication_id: publicationId,
          channel: out.publication.channel,
          points,
          derived: report.derived,
        },
        confidence_json: { overall: 0.72, method: "heuristic" },
        occurred_at: new Date().toISOString(),
      });
    }

    return json({ ok: true, result: out, report });
  } catch (e: any) {
    console.error(`[${fn}] unhandled`, { error: e?.message ?? String(e) });
    return err("internal_error", 500);
  }
});
