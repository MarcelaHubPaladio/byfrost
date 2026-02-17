import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export type PublicPublication = {
  id: string;
  channel: string;
  scheduled_at: string | null;
  publish_status: string;
  content_items?: { theme_title: string | null; client_name: string | null } | null;
};

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function startOfWeek(d: Date) {
  const x = new Date(d);
  const day = x.getDay();
  const diff = (day + 6) % 7; // monday-based
  x.setDate(x.getDate() - diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

function dayKey(iso: string) {
  try {
    return new Date(iso).toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

function fmtTime(iso: string | null) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function titleize(s: string) {
  return (s ?? "")
    .replace(/[_-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function PublicPostsCalendar({ publications }: { publications: PublicPublication[] }) {
  const [cursor, setCursor] = useState<Date>(() => new Date());

  const range = useMemo(() => {
    const m = startOfMonth(cursor);
    const gridStart = startOfWeek(m);
    const gridEnd = addDays(gridStart, 42);
    return { start: gridStart, end: gridEnd, gridDays: 42 };
  }, [cursor]);

  const pubsInRange = useMemo(() => {
    const start = range.start.getTime();
    const end = range.end.getTime();
    return (publications ?? []).filter((p) => {
      const s = p.scheduled_at;
      if (!s) return false;
      const t = new Date(s).getTime();
      return t >= start && t < end;
    });
  }, [publications, range.end, range.start]);

  const byDay = useMemo(() => {
    const m = new Map<string, PublicPublication[]>();
    for (const r of pubsInRange) {
      const iso = String(r.scheduled_at ?? "");
      if (!iso) continue;
      const k = dayKey(iso);
      const cur = m.get(k) ?? [];
      cur.push(r);
      m.set(k, cur);
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => new Date(String(a.scheduled_at)).getTime() - new Date(String(b.scheduled_at)).getTime());
    }
    return m;
  }, [pubsInRange]);

  const headerLabel = cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  const prev = () => {
    const c = new Date(cursor);
    c.setMonth(c.getMonth() - 1);
    setCursor(c);
  };

  const next = () => {
    const c = new Date(cursor);
    c.setMonth(c.getMonth() + 1);
    setCursor(c);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold" style={{ color: "var(--public-card-text)" as any }}>
          {headerLabel}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={prev}
            className="h-10 rounded-2xl bg-white/70 px-3 text-sm font-semibold text-slate-800 hover:bg-white"
          >
            ←
          </button>
          <button
            type="button"
            onClick={next}
            className="h-10 rounded-2xl bg-white/70 px-3 text-sm font-semibold text-slate-800 hover:bg-white"
          >
            →
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[880px]">
          <div className="grid grid-cols-7 gap-2 text-[11px] font-semibold" style={{ color: "var(--public-card-text)" as any }}>
            {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((d) => (
              <div key={d} className="px-1">
                {d}
              </div>
            ))}
          </div>

          <div className="mt-2 grid grid-cols-7 gap-2">
            {Array.from({ length: range.gridDays }).map((_, idx) => {
              const d = addDays(range.start, idx);
              const k = d.toISOString().slice(0, 10);
              const items = byDay.get(k) ?? [];
              const isToday = k === new Date().toISOString().slice(0, 10);

              return (
                <div
                  key={k}
                  className={cn(
                    "min-h-[120px] rounded-[22px] border bg-white/80 p-2 shadow-sm",
                    isToday ? "border-black/30" : "border-black/10"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className={cn("text-xs font-semibold", isToday ? "text-slate-900" : "text-slate-700")}>
                      {d.getDate()}
                    </div>
                    {items.length ? <Badge variant="secondary">{items.length}</Badge> : null}
                  </div>

                  <div className="mt-2 grid gap-1">
                    {items.slice(0, 4).map((p) => (
                      <div
                        key={p.id}
                        className="rounded-xl border border-black/10 bg-white px-2 py-1 text-[11px] text-slate-800"
                        title={`${titleize(p.channel)} • ${p.publish_status}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate font-semibold">{fmtTime(p.scheduled_at)}</span>
                          <span className="shrink-0 text-[10px] text-slate-500">{titleize(p.channel)}</span>
                        </div>
                        {p.content_items?.theme_title ? (
                          <div className="mt-0.5 truncate text-[10px] text-slate-600">{p.content_items.theme_title}</div>
                        ) : null}
                      </div>
                    ))}
                    {items.length > 4 ? (
                      <div className="text-[11px] text-slate-600">+{items.length - 4}…</div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
