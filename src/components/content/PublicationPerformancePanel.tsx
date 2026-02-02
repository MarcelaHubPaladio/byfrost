import { useMemo, useState } from "react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { RefreshCw, Sparkles } from "lucide-react";

export type MetricsSnapshot = {
  window_days: number;
  impressions: number | null;
  profile_visits: number | null;
  follows: number | null;
  messages: number | null;
  collected_at?: string;
};

function toK(v: number) {
  if (v >= 1000) return `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k`;
  return String(v);
}

function lastByWindow(snaps: MetricsSnapshot[]) {
  const sorted = [...snaps].sort((a, b) => a.window_days - b.window_days);
  return sorted[sorted.length - 1] ?? null;
}

export function PublicationPerformancePanel({
  channel,
  snapshots,
  reportText,
  onCollect,
  busy,
}: {
  channel: string;
  snapshots: MetricsSnapshot[];
  reportText: string | null;
  busy: boolean;
  onCollect: (windowDays: 1 | 3 | 7) => void;
}) {
  const [windowDays, setWindowDays] = useState<1 | 3 | 7>(1);

  const last = useMemo(() => lastByWindow(snapshots), [snapshots]);

  const chartData = useMemo(() => {
    const sorted = [...snapshots].sort((a, b) => a.window_days - b.window_days);
    return sorted.map((s) => ({
      label: `D+${s.window_days}`,
      impressions: s.impressions ?? null,
      profile_visits: s.profile_visits ?? null,
      follows: s.follows ?? null,
      messages: s.messages ?? null,
    }));
  }, [snapshots]);

  const hasAny = snapshots.length > 0;

  return (
    <div className="mt-3 rounded-[18px] border border-slate-200 bg-white p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-xs font-semibold text-slate-900">Métricas</div>
            <Badge className="rounded-full border-0 bg-[hsl(var(--byfrost-accent)/0.12)] text-[hsl(var(--byfrost-accent))] hover:bg-[hsl(var(--byfrost-accent)/0.12)]">
              {channel}
            </Badge>
            {last?.collected_at ? (
              <span className="text-[11px] text-slate-500">
                atualizado: {new Date(last.collected_at).toLocaleString()}
              </span>
            ) : null}
          </div>
          <div className="mt-1 text-[11px] text-slate-600">
            Deltas de conta (perfil/follows/replies) são coletados por janela; impressões vêm do insight do post.
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-1">
            {[1, 3, 7].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setWindowDays(d as 1 | 3 | 7)}
                className={cn(
                  "h-8 rounded-2xl px-3 text-[11px] font-semibold",
                  windowDays === d ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-white"
                )}
              >
                D+{d}
              </button>
            ))}
          </div>

          <Button
            onClick={() => onCollect(windowDays)}
            disabled={busy}
            className="h-9 rounded-2xl bg-[hsl(var(--byfrost-accent))] text-white hover:bg-[hsl(var(--byfrost-accent)/0.92)]"
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            {busy ? "Coletando…" : "Coletar"}
          </Button>
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-4">
        {(
          [
            { label: "Impressões", value: last?.impressions },
            { label: "Visitas", value: last?.profile_visits },
            { label: "Follows", value: last?.follows },
            { label: "Mensagens", value: last?.messages },
          ] as const
        ).map((m) => {
          const v = typeof m.value === "number" ? m.value : null;
          return (
            <div key={m.label} className="rounded-[16px] border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="text-[11px] font-semibold text-slate-700">{m.label}</div>
              <div className="mt-1 text-lg font-semibold tracking-tight text-slate-900">
                {v == null ? "—" : toK(v)}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_0.95fr]">
        <div className="rounded-[18px] border border-slate-200 bg-white px-3 py-3">
          <div className="text-[11px] font-semibold text-slate-700">Evolução (impressões)</div>
          <div className="mt-2 h-[160px]">
            {hasAny ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ left: 6, right: 10, top: 8, bottom: 0 }}>
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} width={34} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 16,
                      border: "1px solid #e2e8f0",
                      boxShadow: "0 10px 20px rgba(15,23,42,0.08)",
                      fontSize: 12,
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="impressions"
                    stroke="hsl(var(--byfrost-accent))"
                    strokeWidth={3}
                    dot={{ r: 4, strokeWidth: 2, fill: "white" }}
                    activeDot={{ r: 6 }}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="grid h-full place-items-center rounded-[16px] border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-600">
                Ainda sem snapshots.
              </div>
            )}
          </div>
        </div>

        <div className="rounded-[18px] border border-slate-200 bg-white px-3 py-3">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-semibold text-slate-700">Relatório do guardião</div>
            <div className="inline-flex items-center gap-1 rounded-full bg-[hsl(var(--byfrost-accent)/0.12)] px-2 py-1 text-[11px] font-semibold text-[hsl(var(--byfrost-accent))]">
              <Sparkles className="h-3.5 w-3.5" /> Analyst
            </div>
          </div>

          {reportText ? (
            <div className="mt-2 whitespace-pre-wrap rounded-[16px] border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-800">
              {reportText}
            </div>
          ) : (
            <div className="mt-2 rounded-[16px] border border-dashed border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
              Colete métricas para gerar o relatório.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
