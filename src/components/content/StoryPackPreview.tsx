import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { MessageSquareText, StickyNote } from "lucide-react";

type StorySlide = {
  slide: number;
  headline?: string;
  on_screen_text?: string;
  notes?: string;
};

export function StoryPackPreview({
  storyPack,
}: {
  storyPack: any;
}) {
  const slides: StorySlide[] = Array.isArray(storyPack?.slides) ? storyPack.slides : [];

  if (!slides.length) {
    return (
      <div className="mt-3 rounded-[18px] border border-dashed border-slate-200 bg-white/60 p-3 text-xs text-slate-600">
        Sem slides no Story Pack.
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-[18px] border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-semibold text-slate-900">Story Pack</div>
        <Badge className="rounded-full border-0 bg-[hsl(var(--byfrost-accent)/0.12)] text-[hsl(var(--byfrost-accent))] hover:bg-[hsl(var(--byfrost-accent)/0.12)]">
          {slides.length} slides
        </Badge>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {slides.slice(0, 6).map((s, idx) => {
          const slideNo = Number(s.slide ?? idx + 1);
          return (
            <div
              key={slideNo}
              className={cn(
                "rounded-[18px] border border-slate-200 bg-slate-50 p-3",
                "shadow-[0_10px_18px_rgba(15,23,42,0.06)]"
              )}
            >
              <div className="flex items-center justify-between">
                <div className="text-[11px] font-semibold text-slate-700">Slide {slideNo}</div>
                <div className="h-8 w-8 rounded-2xl bg-white ring-1 ring-slate-200 grid place-items-center text-slate-700">
                  <MessageSquareText className="h-4 w-4" />
                </div>
              </div>

              {s.headline ? <div className="mt-2 text-sm font-semibold text-slate-900">{s.headline}</div> : null}

              {s.on_screen_text ? (
                <div className="mt-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800">
                  {s.on_screen_text}
                </div>
              ) : null}

              {s.notes ? (
                <div className="mt-2 flex items-start gap-2 text-[11px] text-slate-600">
                  <StickyNote className="mt-0.5 h-3.5 w-3.5 text-slate-400" />
                  <span className="leading-relaxed">{s.notes}</span>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {slides.length > 6 ? (
        <div className="mt-2 text-[11px] text-slate-500">Mostrando 6 de {slides.length} slides.</div>
      ) : null}
    </div>
  );
}
