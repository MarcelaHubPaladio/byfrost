import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  FileText,
  Image as ImageIcon,
  MapPin,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
  UserCheck,
} from "lucide-react";

export type CaseTimelineEvent = {
  id: string;
  event_type: string;
  actor_type: string;
  message: string | null;
  occurred_at: string;
};

function fmt(ts: string) {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return ts;
  }
}

function iconFor(e: CaseTimelineEvent) {
  const t = String(e.event_type ?? "").toLowerCase();

  if (t.includes("approved") || t.includes("approval") || t.includes("confirmed")) return UserCheck;
  if (t.includes("doc") || t.includes("contract") || t.includes("attachment")) return FileText;
  if (t.includes("image") || t.includes("photo") || t.includes("ocr")) return ImageIcon;
  if (t.includes("location")) return MapPin;
  if (t.includes("message") || t.includes("reply") || t.includes("whatsapp")) return MessageSquareText;
  if (t.includes("decision") || t.includes("ai") || t.includes("why")) return Sparkles;
  if (t.includes("govern") || t.includes("audit")) return ShieldCheck;

  return CheckCircle2;
}

function toneFor(e: CaseTimelineEvent) {
  const t = String(e.event_type ?? "").toLowerCase();
  if (t.includes("fail") || t.includes("error")) return "rose";
  if (t.includes("pending") || t.includes("pendency")) return "amber";
  return "emerald";
}

export function CaseTimeline({ events }: { events: CaseTimelineEvent[] }) {
  return (
    <div className="rounded-[22px] border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-slate-900">Timeline</div>
        <div className="text-xs text-slate-500">{events.length} evento(s)</div>
      </div>

      <div className="mt-4">
        {events.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-4 text-xs text-slate-500">
            Sem eventos ainda.
          </div>
        ) : (
          <ol className="relative pl-10">
            {/* connector line */}
            <div className="absolute left-[18px] top-1 bottom-1 w-px bg-slate-200" />

            {events.map((e, idx) => {
              const Icon = iconFor(e);
              const tone = toneFor(e);
              const isLast = idx === events.length - 1;

              const ring =
                tone === "emerald"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : tone === "amber"
                    ? "border-amber-200 bg-amber-50 text-amber-700"
                    : "border-rose-200 bg-rose-50 text-rose-700";

              return (
                <li key={e.id} className={cn("relative", !isLast ? "pb-6" : "pb-1")}>
                  <div
                    className={cn(
                      "absolute left-[6px] top-0.5 h-6 w-6 rounded-full border grid place-items-center",
                      ring
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </div>

                  <div className="min-w-0">
                    <div className="text-xs text-slate-500">{fmt(e.occurred_at)}</div>
                    <div className="mt-1 text-sm font-semibold text-slate-900">
                      {e.message ?? "(sem mensagem)"}
                    </div>
                    <div className="mt-1 text-[11px] text-slate-500">
                      {e.actor_type} • {e.event_type}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}
