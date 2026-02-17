import { Badge } from "@/components/ui/badge";

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

function fmtTs(ts: string) {
  try {
    return new Date(ts).toLocaleString("pt-BR");
  } catch {
    return ts;
  }
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

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm" style={{ color: "var(--public-card-text)" as any }}>
        <Badge variant="secondary">{cases.length} caso(s)</Badge>
        <Badge variant="secondary">{events.length} evento(s)</Badge>
      </div>

      <div className="divide-y rounded-[28px] border border-black/10 bg-white/85 shadow-sm">
        {events.length === 0 ? (
          <div className="p-4 text-sm text-slate-700">Sem eventos.</div>
        ) : (
          events.map((ev) => {
            const c = ev.case_id ? byCase.get(ev.case_id) : null;
            return (
              <div key={ev.id} className="p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{ev.event_type}</Badge>
                  <span className="text-xs text-slate-600">{fmtTs(ev.occurred_at)}</span>
                  <span className="text-xs text-slate-500">actor: {ev.actor_type}</span>
                </div>

                {c ? (
                  <div className="mt-2 rounded-2xl border border-black/10 bg-white px-3 py-2 text-xs text-slate-700">
                    <div className="font-semibold text-slate-900">
                      {c.title || "(sem título)"} • {c.case_type}
                    </div>
                    <div className="mt-0.5 text-[11px] text-slate-600">
                      status: {c.status} • state: {c.state} • atualizado: {fmtTs(c.updated_at)}
                    </div>
                  </div>
                ) : null}

                <div className="mt-2 text-sm text-slate-800">{ev.message}</div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
