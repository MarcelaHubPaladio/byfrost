import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

const RANKING_URL =
  "https://pryoirzeghatrgecwrci.supabase.co/functions/v1/public-campaign-ranking";

type Row = {
  display_name: string;
  photo_url: string | null;
  score: number;
  position: number;
};

function initials(name: string) {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  const i = parts.map((p) => p[0]?.toUpperCase()).join("");
  return i || "?";
}

function PodiumCard({ row, place }: { row: Row; place: 1 | 2 | 3 }) {
  const badge =
    place === 1
      ? "bg-amber-500 text-white"
      : place === 2
        ? "bg-slate-400 text-white"
        : "bg-orange-700 text-white";

  const ring =
    place === 1
      ? "ring-amber-300"
      : place === 2
        ? "ring-slate-300"
        : "ring-orange-300";

  const scoreFmt = useMemo(() => {
    const n = Number(row.score ?? 0);
    if (Number.isNaN(n)) return "0";
    return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(n);
  }, [row.score]);

  return (
    <Card className="rounded-3xl border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <div className="inline-flex items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${badge}`}>
            #{place}
          </span>
          <div className="text-sm font-semibold text-slate-900 line-clamp-1">{row.display_name}</div>
        </div>
        <div className="text-xs font-medium text-slate-600">{scoreFmt}</div>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <Avatar className={`h-12 w-12 ring-2 ${ring} ring-offset-2 ring-offset-white`}>
          <AvatarImage src={row.photo_url ?? undefined} alt={row.display_name} />
          <AvatarFallback className="bg-slate-100 text-slate-700">
            {initials(row.display_name)}
          </AvatarFallback>
        </Avatar>
        <div className="text-xs text-slate-500">Pontuação (realtime)</div>
      </div>
    </Card>
  );
}

export default function PublicCampaignRanking() {
  const { tenant, campaign } = useParams();
  const [items, setItems] = useState<Row[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorDetail, setErrorDetail] = useState<any>(null);

  const [tenantName, setTenantName] = useState<string | null>(null);
  const [campaignName, setCampaignName] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [primaryHex, setPrimaryHex] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const top3 = items.slice(0, 3);
  const top10 = items.slice(0, 10);

  const loadRanking = async () => {
    if (!tenant || !campaign) return;

    setLoading(true);
    try {
      setError(null);
      setErrorDetail(null);

      // reset meta
      setTenantName(null);
      setCampaignName(null);
      setLogoUrl(null);
      setPrimaryHex(null);

      // 1) Try Edge Function first (supports signed URLs for private photos + logo)
      const url = new URL(RANKING_URL);
      url.searchParams.set("tenant_slug", tenant);
      url.searchParams.set("campaign_id", campaign);

      const res = await fetch(url.toString(), { method: "GET" });
      const json = await res.json().catch(() => null);

      // If the function is not deployed in this Supabase project, Supabase often returns 404
      // with a body that is either non-JSON or JSON that does NOT match our { ok, error } shape.
      const looksLikeOurResponse =
        Boolean(json) && typeof (json as any).ok === "boolean" && typeof (json as any).error === "string";
      const shouldFallbackToRpc = res.status === 404 && !looksLikeOurResponse;

      if (!shouldFallbackToRpc) {
        if (!res.ok || !json?.ok) {
          const msg = String(json?.error ?? `HTTP ${res.status}`);
          const detail = json?.detail ?? null;
          // eslint-disable-next-line no-console
          console.error("public ranking failed", { status: res.status, msg, detail, url: url.toString() });
          throw Object.assign(new Error(msg), { detail });
        }

        setItems((json.items ?? []) as Row[]);
        setUpdatedAt(String(json.updated_at ?? new Date().toISOString()));
        setTenantName((json.tenant_name as string | null | undefined) ?? null);
        setCampaignName((json.campaign_name as string | null | undefined) ?? null);
        setPrimaryHex((json.palette_primary_hex as string | null | undefined) ?? null);
        setLogoUrl((json.logo_url as string | null | undefined) ?? null);
        return;
      }

      // 2) Fallback: SQL RPC (does not require Edge Function deployment)
      const { data, error: rpcErr } = await supabase.rpc("public_campaign_ranking", {
        p_tenant_slug: tenant,
        p_campaign_id: campaign,
        p_limit: 10,
      });

      if (rpcErr) throw rpcErr;

      if (!data?.ok) {
        const msg = String(data?.error ?? "Erro");
        throw Object.assign(new Error(msg), { detail: null });
      }

      setItems((data.items ?? []) as Row[]);
      setUpdatedAt(String(data.updated_at ?? new Date().toISOString()));
      setTenantName((data.tenant_name as string | null | undefined) ?? null);
      setCampaignName((data.campaign_name as string | null | undefined) ?? null);
      setPrimaryHex((data.palette_primary_hex as string | null | undefined) ?? null);

      // logo (best effort): works only if bucket is public
      const bucket = (data.logo_bucket as string | null | undefined) ?? null;
      const path = (data.logo_path as string | null | undefined) ?? null;
      if (bucket && path) {
        try {
          const publicUrl = supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
          setLogoUrl(publicUrl);
        } catch {
          // ignore
        }
      }
    } catch (e: any) {
      setError(String(e?.message ?? "Erro"));
      setErrorDetail(e?.detail ?? null);
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const title = ["Ranking", tenantName ?? tenant, campaignName ?? campaign].filter(Boolean).join(" • ");
    document.title = title || "Ranking";
  }, [tenantName, campaignName, tenant, campaign]);

  useEffect(() => {
    // Apply tenant theme colors (best effort)
    const hex = String(primaryHex ?? "").trim();
    const root = document.documentElement;

    const isValidHex = /^#[0-9a-fA-F]{6}$/.test(hex);
    if (!isValidHex) {
      root.style.removeProperty("--tenant-accent");
      root.style.removeProperty("--tenant-bg");
      return;
    }

    const v = hex.replace("#", "");
    const r = parseInt(v.slice(0, 2), 16);
    const g = parseInt(v.slice(2, 4), 16);
    const b = parseInt(v.slice(4, 6), 16);

    const toHsl = (rr: number, gg: number, bb: number) => {
      rr /= 255;
      gg /= 255;
      bb /= 255;
      const max = Math.max(rr, gg, bb);
      const min = Math.min(rr, gg, bb);
      let h = 0;
      let s = 0;
      const l = (max + min) / 2;
      const d = max - min;
      if (d !== 0) {
        s = d / (1 - Math.abs(2 * l - 1));
        switch (max) {
          case rr:
            h = ((gg - bb) / d) % 6;
            break;
          case gg:
            h = (bb - rr) / d + 2;
            break;
          case bb:
            h = (rr - gg) / d + 4;
            break;
        }
        h *= 60;
        if (h < 0) h += 360;
      }
      return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
    };

    const accent = toHsl(r, g, b);
    const bg = { h: accent.h, s: Math.min(35, Math.max(10, Math.round(accent.s * 0.35))), l: 97 };

    root.style.setProperty("--tenant-accent", `${accent.h} ${accent.s}% ${accent.l}%`);
    root.style.setProperty("--tenant-bg", `${bg.h} ${bg.s}% ${bg.l}%`);

    return () => {
      root.style.removeProperty("--tenant-accent");
      root.style.removeProperty("--tenant-bg");
    };
  }, [primaryHex]);

  useEffect(() => {
    // initial
    loadRanking();

    // refresh every 30 minutes
    const id = setInterval(loadRanking, 30 * 60 * 1000);

    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant, campaign]);

  const helpText = useMemo(() => {
    const e = String(error ?? "");
    const el = e.toLowerCase();

    if (el.includes("public_campaign_ranking") && (el.includes("could not find") || el.includes("does not exist"))) {
      return "A função SQL de fallback não está instalada no seu Supabase. Execute a migration 0026_public_campaign_ranking_rpc.sql no SQL Editor.";
    }

    switch (error) {
      case "tenant_not_found":
        return "Tenant não encontrado. Verifique o tenant_slug na URL.";
      case "campaign_not_found":
        return "Campanha não encontrada para este tenant. Verifique o campaign_id na URL.";
      case "forbidden":
        return "Esta campanha não está pública. No painel, deixe visibility=public para liberar o ranking.";
      case "ranking_query_failed":
        return "Falha ao consultar o ranking (view/campos podem não existir). Confirme se as migrations do Incentive Engine foram aplicadas.";
      case "participants_query_failed":
        return "Falha ao carregar participantes. Confirme se as tabelas do Incentive Engine existem e se o projeto tem a função configurada.";
      case "missing_params":
        return "URL incompleta. Use /incentives/<tenant_slug>/<campaign_id>.";
      default:
        return null;
    }
  }, [error]);

  const updatedAtFmt = useMemo(() => {
    if (!updatedAt) return null;
    const d = new Date(updatedAt);
    if (Number.isNaN(d.getTime())) return null;
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "medium",
    }).format(d);
  }, [updatedAt]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[hsl(var(--tenant-bg)/1)] to-white">
      <div className="mx-auto max-w-3xl px-4 py-10">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white">
              {logoUrl ? (
                <img src={logoUrl} alt="Logo do tenant" className="h-full w-full object-contain" />
              ) : (
                <div className="text-lg font-semibold text-slate-700">
                  {(tenantName ?? tenant ?? "T").slice(0, 1).toUpperCase()}
                </div>
              )}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-medium text-slate-600">Ranking</div>
              <div className="truncate text-2xl font-semibold tracking-tight text-slate-900">
                {tenantName ?? tenant}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {campaignName ?? campaign}
                {updatedAtFmt ? ` • atualizado ${updatedAtFmt}` : ""}
                <span className="text-slate-400"> • atualização automática a cada 30 min</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              className="h-9 rounded-2xl"
              onClick={loadRanking}
              disabled={loading}
              title="Atualizar ranking"
            >
              <RefreshCw className={"mr-2 h-4 w-4" + (loading ? " animate-spin" : "")} />
              {loading ? "Atualizando…" : "Atualizar"}
            </Button>
            <div className="hidden sm:block rounded-2xl border border-[hsl(var(--tenant-accent)/0.25)] bg-[hsl(var(--tenant-accent)/0.08)] px-3 py-2 text-xs font-semibold text-[hsl(var(--tenant-accent))]">
              público
            </div>
          </div>
        </div>

        {error && (
          <Card className="mt-6 rounded-3xl border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
            <div className="font-semibold">Não foi possível carregar o ranking</div>
            <div className="mt-1">Erro: {error}</div>
            {helpText && <div className="mt-2 text-sm text-rose-900/90">{helpText}</div>}
            {errorDetail?.message && (
              <div className="mt-2 rounded-2xl border border-rose-200 bg-white/60 p-3 text-[12px] text-rose-900">
                <div className="font-semibold">Detalhe</div>
                <div className="mt-1 font-mono">{String(errorDetail.message)}</div>
                {errorDetail.code && <div className="mt-1 font-mono">code: {String(errorDetail.code)}</div>}
              </div>
            )}
          </Card>
        )}

        {!error && top3.length > 0 && (
          <div className="mt-6 grid gap-3 md:grid-cols-3">
            <PodiumCard row={top3[1] ?? top3[0]} place={2} />
            <PodiumCard row={top3[0]} place={1} />
            <PodiumCard row={top3[2] ?? top3[0]} place={3} />
          </div>
        )}

        <Card className="mt-6 rounded-3xl border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-900">Top 10</div>
            <div className="text-xs text-slate-500">Campanha: {campaign}</div>
          </div>
          <Separator className="my-3" />

          {top10.length === 0 && !error ? (
            <div className="text-sm text-slate-600">Sem dados ainda.</div>
          ) : (
            <div className="grid gap-2">
              {top10.map((row) => (
                <div
                  key={`${row.position}-${row.display_name}`}
                  className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 text-sm font-semibold tabular-nums text-slate-700">
                      #{row.position}
                    </div>
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={row.photo_url ?? undefined} alt={row.display_name} />
                      <AvatarFallback className="bg-white text-slate-700">
                        {initials(row.display_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="text-sm font-medium text-slate-900 line-clamp-1">
                      {row.display_name}
                    </div>
                  </div>
                  <div className="text-sm font-semibold tabular-nums text-slate-900">
                    {new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(row.score)}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-3 text-[11px] text-slate-500">
            Observação: ranking calculado em tempo real (sem persistência).
          </div>
        </Card>
      </div>
    </div>
  );
}