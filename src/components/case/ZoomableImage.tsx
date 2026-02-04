import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Minus, Plus, RotateCcw } from "lucide-react";

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function ZoomableImage(props: {
  src: string;
  alt: string;
  className?: string;
  maxScale?: number;
}) {
  const { src, alt, className, maxScale = 6 } = props;
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [drag, setDrag] = useState<null | {
    pointerId: number;
    startX: number;
    startY: number;
    baseX: number;
    baseY: number;
  }>(null);

  const reset = useCallback(() => {
    setScale(1);
    setPos({ x: 0, y: 0 });
  }, []);

  // Reset whenever image changes
  useEffect(() => {
    reset();
  }, [src, reset]);

  const zoomAt = useCallback(
    (nextScale: number, clientX?: number, clientY?: number) => {
      const s0 = scale;
      const s1 = clamp(nextScale, 1, maxScale);
      if (s1 === s0) return;

      const el = containerRef.current;
      if (!el || clientX == null || clientY == null) {
        setScale(s1);
        return;
      }

      const rect = el.getBoundingClientRect();
      const cx = clientX - rect.left - rect.width / 2;
      const cy = clientY - rect.top - rect.height / 2;

      // Keep the point under cursor stable when scaling.
      setPos((p) => ({
        x: p.x + cx * (s0 - s1),
        y: p.y + cy * (s0 - s1),
      }));
      setScale(s1);
    },
    [maxScale, scale]
  );

  const controls = useMemo(() => {
    const pct = Math.round(scale * 100);
    return {
      pct,
      canZoomOut: scale > 1.001,
      canZoomIn: scale < maxScale - 0.001,
    };
  }, [scale, maxScale]);

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative h-full w-full touch-none overflow-hidden",
        scale > 1 ? "cursor-grab" : "cursor-default",
        drag ? "cursor-grabbing" : "",
        className
      )}
      onPointerDown={(e) => {
        if (scale <= 1) return;
        const el = containerRef.current;
        if (!el) return;
        (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
        setDrag({
          pointerId: e.pointerId,
          startX: e.clientX,
          startY: e.clientY,
          baseX: pos.x,
          baseY: pos.y,
        });
      }}
      onPointerMove={(e) => {
        if (!drag || drag.pointerId !== e.pointerId) return;
        const dx = e.clientX - drag.startX;
        const dy = e.clientY - drag.startY;
        setPos({ x: drag.baseX + dx, y: drag.baseY + dy });
      }}
      onPointerUp={(e) => {
        if (drag?.pointerId === e.pointerId) setDrag(null);
      }}
      onPointerCancel={(e) => {
        if (drag?.pointerId === e.pointerId) setDrag(null);
      }}
      onWheel={(e) => {
        // Natural: wheel up -> zoom in, wheel down -> zoom out
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
        zoomAt(scale * factor, e.clientX, e.clientY);
      }}
    >
      <div className="absolute left-3 top-3 z-10 flex items-center gap-2">
        <div className="flex items-center overflow-hidden rounded-2xl border border-slate-200 bg-white/90 shadow-sm backdrop-blur">
          <Button
            type="button"
            variant="ghost"
            className="h-9 w-9 rounded-none"
            onClick={(e) => {
              e.stopPropagation();
              zoomAt(scale / 1.2);
            }}
            disabled={!controls.canZoomOut}
            title="Diminuir zoom"
          >
            <Minus className="h-4 w-4" />
          </Button>
          <div className="px-2 text-xs font-semibold tabular-nums text-slate-800">
            {controls.pct}%
          </div>
          <Button
            type="button"
            variant="ghost"
            className="h-9 w-9 rounded-none"
            onClick={(e) => {
              e.stopPropagation();
              zoomAt(scale * 1.2);
            }}
            disabled={!controls.canZoomIn}
            title="Aumentar zoom"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        <Button
          type="button"
          variant="secondary"
          className="h-9 rounded-2xl border border-slate-200 bg-white/90 shadow-sm"
          onClick={(e) => {
            e.stopPropagation();
            reset();
          }}
          title="Resetar (ajustar)"
        >
          <RotateCcw className="mr-2 h-4 w-4" /> Ajustar
        </Button>
      </div>

      <div className="pointer-events-none absolute bottom-3 left-3 z-10 rounded-2xl border border-slate-200 bg-white/90 px-3 py-1.5 text-[11px] font-medium text-slate-700 shadow-sm backdrop-blur">
        Scroll para zoom • arraste para mover
      </div>

      <img
        src={src}
        alt={alt}
        draggable={false}
        className="pointer-events-none h-full w-full select-none object-contain"
        style={{
          transform: `translate3d(${pos.x}px, ${pos.y}px, 0) scale(${scale})`,
          transformOrigin: "center",
          willChange: "transform",
        }}
      />
    </div>
  );
}
