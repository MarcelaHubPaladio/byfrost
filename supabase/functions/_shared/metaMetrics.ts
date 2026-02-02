import { decryptText } from "./encryption.ts";

const GRAPH_VERSION = "v19.0";

type SupabaseAdmin = any;

type MetaAccountRow = {
  id: string;
  tenant_id: string;
  ig_business_account_id: string;
  access_token_encrypted: string;
  token_expires_at: string | null;
  is_active: boolean;
};

type PublicationRow = {
  id: string;
  tenant_id: string;
  case_id: string;
  channel: string;
  publish_status: string;
  meta_post_id: string | null;
  scheduled_at: string | null;
  created_at: string;
};

function addDaysIso(iso: string, days: number) {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

async function metaFetchJson(url: string) {
  const res = await fetch(url);
  const text = await res.text();
  let jsonBody: any = null;
  try {
    jsonBody = text ? JSON.parse(text) : null;
  } catch {
    jsonBody = null;
  }

  if (!res.ok) {
    const msg = jsonBody?.error?.message || `HTTP ${res.status}`;
    throw new Error(msg);
  }

  return jsonBody;
}

async function getActiveMetaAccount({ supabase, tenantId }: { supabase: SupabaseAdmin; tenantId: string }) {
  const { data: acc, error } = await supabase
    .from("meta_accounts")
    .select("id,tenant_id,ig_business_account_id,access_token_encrypted,token_expires_at,is_active")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !acc) return { ok: false as const, error: error?.message ?? "no_active_meta_account" };

  const meta = acc as any as MetaAccountRow;

  if (meta.token_expires_at && new Date(meta.token_expires_at).getTime() < Date.now()) {
    return { ok: false as const, error: "token_expired" };
  }

  let accessToken = "";
  try {
    accessToken = await decryptText(meta.access_token_encrypted);
  } catch (e: any) {
    return { ok: false as const, error: `decrypt_failed:${e?.message ?? "error"}` };
  }

  return { ok: true as const, meta, accessToken };
}

function pickInsightValue(res: any, metric: string) {
  // Graph insights responses can be:
  // - { data: [{ name, values: [{ value }] }] }
  // - { data: [{ name, value }] }
  const row = (res?.data ?? []).find((r: any) => r?.name === metric) ?? null;
  if (!row) return null;

  if (typeof row?.value === "number") return row.value as number;

  const values = Array.isArray(row?.values) ? row.values : [];
  const sum = values
    .map((v: any) => (typeof v?.value === "number" ? v.value : 0))
    .reduce((a: number, b: number) => a + b, 0);

  return Number.isFinite(sum) ? sum : null;
}

export async function collectContentMetricsSnapshot({
  supabase,
  tenantId,
  publicationId,
  windowDays,
}: {
  supabase: SupabaseAdmin;
  tenantId: string;
  publicationId: string;
  windowDays: 1 | 3 | 7;
}) {
  const fn = "meta-metrics-collect";

  // 1) Load publication
  const { data: pub, error: pubErr } = await supabase
    .from("content_publications")
    .select("id,tenant_id,case_id,channel,publish_status,meta_post_id,scheduled_at,created_at")
    .eq("id", publicationId)
    .maybeSingle();

  if (pubErr || !pub) {
    console.error(`[${fn}] publication not found`, { publicationId, error: pubErr?.message });
    return { ok: false as const, error: "publication_not_found" };
  }

  const row = pub as any as PublicationRow;
  if (row.tenant_id !== tenantId) {
    console.error(`[${fn}] tenant mismatch`, { tenantId, publicationTenantId: row.tenant_id, publicationId });
    return { ok: false as const, error: "tenant_mismatch" };
  }

  if (row.publish_status !== "PUBLISHED" || !row.meta_post_id) {
    return { ok: false as const, error: "publication_not_published" };
  }

  // 2) Meta account
  const acc = await getActiveMetaAccount({ supabase, tenantId });
  if (!acc.ok) {
    return { ok: false as const, error: `meta_account:${acc.error}` };
  }

  const igAccountId = String(acc.meta.ig_business_account_id);
  const accessToken = acc.accessToken;
  const mediaId = String(row.meta_post_id);

  // 3) Compute window (best-effort: scheduled_at else created_at)
  const base = row.scheduled_at ?? row.created_at;
  const sinceIso = base;
  const untilIso = addDaysIso(base, windowDays);

  // 4) Fetch metrics
  // 4.1) Media impressions
  let impressions: number | null = null;
  try {
    const url = `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(mediaId)}/insights?metric=impressions&access_token=${encodeURIComponent(accessToken)}`;
    const res = await metaFetchJson(url);
    impressions = pickInsightValue(res, "impressions");
  } catch (e: any) {
    console.warn(`[${fn}] media insights failed (impressions)`, { publicationId, mediaId, error: e?.message ?? String(e) });
  }

  // 4.2) Account-level deltas in the window
  // Mapping (best-effort):
  // - profile_visits -> profile_views
  // - follows -> follower_count (new followers)
  // - messages -> profile_replies (story replies)
  let profileVisits: number | null = null;
  let follows: number | null = null;
  let messages: number | null = null;

  try {
    const params = new URLSearchParams({
      metric: "profile_views,follower_count,profile_replies",
      period: "day",
      since: Math.floor(new Date(sinceIso).getTime() / 1000).toString(),
      until: Math.floor(new Date(untilIso).getTime() / 1000).toString(),
      access_token: accessToken,
    });

    const url = `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(igAccountId)}/insights?${params.toString()}`;
    const res = await metaFetchJson(url);

    profileVisits = pickInsightValue(res, "profile_views");
    follows = pickInsightValue(res, "follower_count");
    messages = pickInsightValue(res, "profile_replies");
  } catch (e: any) {
    console.warn(`[${fn}] account insights failed (window)`, { publicationId, igAccountId, error: e?.message ?? String(e) });
  }

  const metrics = {
    impressions,
    profile_visits: profileVisits,
    follows,
    messages,
    window: { days: windowDays, since: sinceIso, until: untilIso },
  };

  // 5) Upsert snapshot
  const { data: snap, error: upErr } = await supabase
    .from("content_metrics_snapshots")
    .upsert(
      {
        tenant_id: tenantId,
        publication_id: publicationId,
        window_days: windowDays,
        impressions,
        profile_visits: profileVisits,
        follows,
        messages,
        metrics_json: metrics,
        collected_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id,publication_id,window_days" }
    )
    .select("id")
    .maybeSingle();

  if (upErr) {
    console.error(`[${fn}] upsert snapshot failed`, { tenantId, publicationId, windowDays, error: upErr?.message });
    return { ok: false as const, error: "snapshot_upsert_failed" };
  }

  return {
    ok: true as const,
    snapshot_id: String((snap as any)?.id ?? ""),
    publication: { id: publicationId, case_id: row.case_id, channel: row.channel },
    metrics,
  };
}
