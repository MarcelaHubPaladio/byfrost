import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type PublicCase = {
  id: string;
  case_type: string;
  title: string | null;
  status: string;
  state: string;
  created_at: string;
  updated_at: string;
};

export type PublicTimelineEvent = {
  id: string;
  case_id: string | null;
  event_type: string;
  actor_type: string;
  message: string;
  occurred_at: string;
  meta_json: any;
};

function fmtDate(ts: string) {
  try {
    return new Date(ts).toLocaleDateString("pt-BR", { year: "numeric", month: "2-digit", day: "2-digit" });
  } catch {
    return ts;
  }
}

function fmtTime(ts: string) {
  try {
    return new Date(ts).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function safe(s: any) {
  return String(s ?? "").trim();
}

export function PublicEntityHistory({
  cases,
  events,
}: {
  cases: PublicCase[];
  events: PublicTimelineEvent[];
}) {
  const byCase = new Map<string, PublicCase>();
  for (const c of cases) byCase.set(c.id, c);

  // Most recent first (top) -> older below.
  const ordered = [...(events ?? [])].sort(
    (a, b) => new Date(String(b.occurred_at)).getTime() - new Date(String(a.occurred_at)).getTime()
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm" style={{ color: "var(--public-card-text)" as any }}>
        <Badge variant="secondary">{cases.length} caso(s)</Badge>
        <Badge variant="secondary">{events.length} evento(s)</Badge>
      </div>

      {/* Timeline layout inspired by the mock: center line, alternating sides. */}
      <div className="relative rounded-[28px] border border-black/10 bg-white/85 p-4 shadow-sm">
        <div className="absolute bottom-6 left-1/2 top-6 hidden w-px -translate-x-1/2 bg-black/15 md:block" />

        {ordered.length === 0 ? (
          <div className="p-4 text-sm text-slate-700">Sem eventos.</div>
        ) : (
          <div className="grid gap-6">
            {ordered.map((ev, idx) => {
              const c = ev.case_id ? byCase.get(ev.case_id) : null;
              const side: "left" | "right" = idx % 2 === 0 ? "left" : "right";

              const dateBlock = (
                <div
                  className={cn(
                    "space-y-1",
                    // align towards the center line
                    side === "left" ? "text-right" : "text-left"
                  )}
                  style={{ color: "var(--public-card-text)" as any }}
                >
                  <div className="text-2xl font-extrabold tracking-tight md:text-3xl">{fmtDate(ev.occurred_at)}</div>
                  <div className="text-xs font-semibold opacity-80">{fmtTime(ev.occurred_at)}</div>
                </div>
              );

              const contentBlock = (
                <Card className="rounded-[26px] border-black/10 bg-white/90 p-4 shadow-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{safe(ev.event_type) || "evento"}</Badge>
                    <span className="text-xs text-slate-500">actor: {safe(ev.actor_type) || "—"}</span>
                  </div>

                  <div className="mt-2 text-sm font-semibold text-slate-900">{safe(ev.message) || "(sem mensagem)"}</div>

                  {c ? (
                    <div className="mt-3 rounded-2xl border border-black/10 bg-white px-3 py-2 text-xs text-slate-700">
                      <div className="font-semibold text-slate-900">
                        {c.title || "(sem título)"} • {c.case_type}
                      </div>
                      <div className="mt-0.5 text-[11px] text-slate-600">
                        status: {c.status} • state: {c.state} • atualizado: {fmtDate(c.updated_at)} {fmtTime(c.updated_at)}
                      </div>
                    </div>
                  ) : null}
                </Card>
              );

              return (
                <div key={ev.id} className="relative">
                  {/* Mobile: stack */}
                  <div className="grid gap-2 md:hidden">
                    {dateBlock}
                    {contentBlock}
                  </div>

                  {/* Desktop: alternate sides around a center line */}
                  <div className="hidden md:grid md:grid-cols-[1fr_56px_1fr] md:items-start md:gap-6">
                    <div className={cn("flex", side === "left" ? "justify-end" : "justify-end")}>
                      {side === "left" ? dateBlock : contentBlock}
                    </div>

                    <div className="relative flex items-start justify-center">
                      <div className="mt-3 h-3 w-3 rounded-full bg-[hsl(var(--byfrost-accent))] shadow-sm" />
                      {/* small connector lines */}
                      <div className="absolute top-[18px] left-1/2 hidden h-px w-6 -translate-x-[calc(100%+8px)] bg-black/15 md:block" />
                      <div className="absolute top-[18px] left-1/2 hidden h-px w-6 translate-x-[8px] bg-black/15 md:block" />
                    </div>

                    <div className={cn("flex", side === "left" ? "justify-start" : "justify-start")}>
                      {side === "left" ? contentBlock : dateBlock}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}