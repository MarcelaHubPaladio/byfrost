import { useEffect, useMemo, useRef, useState } from "react";
import { YouTubeQuadrant } from "@/components/youtube/YouTubeQuadrant";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";

const STORAGE_KEY = "youtube_wall_2x2_video_ids_v1";

type PanelGroupHandle = {
  getLayout: () => number[];
  setLayout: (layout: number[]) => void;
};

type WallState = {
  videoIds: Array<string | null>;
  audioIdx: number | null;
  rowLayout?: number[]; // [top, bottom]
  colLayout?: number[]; // [left, right]
};

function normalizeLayout(raw: unknown, expectedLen: number): number[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  if (raw.length !== expectedLen) return undefined;
  const nums = raw
    .map((v) => (typeof v === "number" && Number.isFinite(v) ? v : null))
    .filter((v) => v !== null) as number[];
  if (nums.length !== expectedLen) return undefined;
  return nums;
}

function normalizeState(raw: unknown): WallState {
  const fallback: WallState = {
    videoIds: [null, null, null, null],
    audioIdx: null,
    rowLayout: [50, 50],
    colLayout: [50, 50],
  };
  if (!raw || typeof raw !== "object") return fallback;

  const any = raw as any;
  const ids = Array.isArray(any.videoIds) ? any.videoIds : null;
  if (!ids) return fallback;

  const videoIds: Array<string | null> = [null, null, null, null];
  for (let i = 0; i < 4; i++) {
    const v = ids[i];
    videoIds[i] = typeof v === "string" && v.trim() ? v.trim() : null;
  }

  const rawAudioIdx =
    typeof any.audioIdx === "number" && Number.isFinite(any.audioIdx)
      ? any.audioIdx
      : null;

  const audioIdx =
    rawAudioIdx !== null && rawAudioIdx >= 0 && rawAudioIdx < 4
      ? rawAudioIdx
      : null;

  const rowLayout = normalizeLayout(any.rowLayout, 2) ?? fallback.rowLayout;
  const colLayout = normalizeLayout(any.colLayout, 2) ?? fallback.colLayout;

  return { videoIds, audioIdx, rowLayout, colLayout };
}

function firstAvailableAudioIdx(videoIds: Array<string | null>): number | null {
  const idx = videoIds.findIndex((v) => Boolean(v));
  return idx >= 0 ? idx : null;
}

function isTopRow(idx: number) {
  return idx === 0 || idx === 1;
}

function isLeftCol(idx: number) {
  return idx === 0 || idx === 2;
}

export default function Screen() {
  const [videoIds, setVideoIds] = useState<Array<string | null>>([
    null,
    null,
    null,
    null,
  ]);
  const [audioIdx, setAudioIdx] = useState<number | null>(null);

  // Resizable state (also persisted)
  const [rowLayout, setRowLayout] = useState<number[]>([50, 50]);
  const [colLayout, setColLayout] = useState<number[]>([50, 50]);

  // Maximize state (in-app)
  const [maximizedIdx, setMaximizedIdx] = useState<number | null>(null);
  const prevLayoutRef = useRef<{ row: number[]; col: number[] } | null>(null);

  // Panel group refs (to programmatically set layout)
  const rowsRef = useRef<PanelGroupHandle | null>(null);
  const topColsRef = useRef<PanelGroupHandle | null>(null);
  const bottomColsRef = useRef<PanelGroupHandle | null>(null);
  const syncingColsRef = useRef(false);

  const applyColLayout = (layout: number[]) => {
    syncingColsRef.current = true;
    try {
      topColsRef.current?.setLayout(layout);
      bottomColsRef.current?.setLayout(layout);
    } finally {
      requestAnimationFrame(() => {
        syncingColsRef.current = false;
      });
    }
  };

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const next = normalizeState(parsed);

      setVideoIds(next.videoIds);
      setAudioIdx(next.audioIdx ?? firstAvailableAudioIdx(next.videoIds));
      setRowLayout(next.rowLayout ?? [50, 50]);
      setColLayout(next.colLayout ?? [50, 50]);

      // Apply the persisted layouts to panel groups (after they mount).
      queueMicrotask(() => {
        rowsRef.current?.setLayout(next.rowLayout ?? [50, 50]);
        applyColLayout(next.colLayout ?? [50, 50]);
      });
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep audioIdx valid when videos are removed.
  useEffect(() => {
    if (audioIdx === null) {
      const next = firstAvailableAudioIdx(videoIds);
      if (next !== null) setAudioIdx(next);
      return;
    }

    if (!videoIds[audioIdx]) {
      setAudioIdx(firstAvailableAudioIdx(videoIds));
    }
  }, [videoIds, audioIdx]);

  useEffect(() => {
    const payload: WallState = { videoIds, audioIdx, rowLayout, colLayout };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // ignore
    }
  }, [videoIds, audioIdx, rowLayout, colLayout]);

  const anyMaximized = maximizedIdx !== null;

  const handleColsLayout = (source: "top" | "bottom", layout: number[]) => {
    if (syncingColsRef.current) return;

    setColLayout(layout);

    syncingColsRef.current = true;
    try {
      if (source === "top") bottomColsRef.current?.setLayout(layout);
      else topColsRef.current?.setLayout(layout);
    } finally {
      requestAnimationFrame(() => {
        syncingColsRef.current = false;
      });
    }
  };

  const maximizeQuadrant = (idx: number) => {
    prevLayoutRef.current = {
      row: rowsRef.current?.getLayout() ?? rowLayout,
      col: topColsRef.current?.getLayout() ?? colLayout,
    };

    const nextRow: number[] = isTopRow(idx) ? [100, 0] : [0, 100];
    const nextCol: number[] = isLeftCol(idx) ? [100, 0] : [0, 100];

    setMaximizedIdx(idx);
    setRowLayout(nextRow);
    setColLayout(nextCol);

    rowsRef.current?.setLayout(nextRow);
    applyColLayout(nextCol);
  };

  const restoreFromMaximize = () => {
    const prev = prevLayoutRef.current;
    const nextRow = prev?.row ?? [50, 50];
    const nextCol = prev?.col ?? [50, 50];

    setMaximizedIdx(null);
    setRowLayout(nextRow);
    setColLayout(nextCol);

    rowsRef.current?.setLayout(nextRow);
    applyColLayout(nextCol);
  };

  const toggleMaximize = (idx: number) => {
    if (maximizedIdx === idx) restoreFromMaximize();
    else maximizeQuadrant(idx);
  };

  const handleClass =
    "bg-white/10 hover:bg-white/20 after:w-2 data-[panel-group-direction=vertical]:after:h-2";

  // When maximized, prevent the non-maximized quadrants from stealing hover/focus,
  // even though they might still be mounted with size 0.
  const quadrantPointerClass = useMemo(() => {
    if (!anyMaximized) return "";
    return "pointer-events-none";
  }, [anyMaximized]);

  return (
    <div className="h-screen w-screen bg-black">
      <ResizablePanelGroup
        direction="vertical"
        className="h-full w-full"
        // @ts-expect-error - react-resizable-panels imperative handle
        groupRef={rowsRef}
        onLayout={(layout) => setRowLayout(layout)}
      >
        <ResizablePanel defaultSize={rowLayout[0]} minSize={0} collapsible>
          <ResizablePanelGroup
            direction="horizontal"
            className={"h-full w-full " + (anyMaximized ? quadrantPointerClass : "")}
            // @ts-expect-error - react-resizable-panels imperative handle
            groupRef={topColsRef}
            onLayout={(layout) => handleColsLayout("top", layout)}
          >
            <ResizablePanel defaultSize={colLayout[0]} minSize={0} collapsible>
              <div
                className={
                  "h-full w-full " +
                  (maximizedIdx !== null && maximizedIdx !== 0
                    ? "pointer-events-none opacity-0"
                    : "")
                }
              >
                <YouTubeQuadrant
                  index={0}
                  videoId={videoIds[0]}
                  maximized={maximizedIdx === 0}
                  anyMaximized={anyMaximized}
                  audioSelected={audioIdx === 0}
                  onSelectAudio={() => setAudioIdx(0)}
                  onToggleMaximize={() => toggleMaximize(0)}
                  onSetVideoId={(next) =>
                    setVideoIds((cur) => {
                      const copy = [...cur];
                      copy[0] = next;
                      return copy;
                    })
                  }
                />
              </div>
            </ResizablePanel>
            <ResizableHandle className={handleClass} />
            <ResizablePanel defaultSize={colLayout[1]} minSize={0} collapsible>
              <div
                className={
                  "h-full w-full " +
                  (maximizedIdx !== null && maximizedIdx !== 1
                    ? "pointer-events-none opacity-0"
                    : "")
                }
              >
                <YouTubeQuadrant
                  index={1}
                  videoId={videoIds[1]}
                  maximized={maximizedIdx === 1}
                  anyMaximized={anyMaximized}
                  audioSelected={audioIdx === 1}
                  onSelectAudio={() => setAudioIdx(1)}
                  onToggleMaximize={() => toggleMaximize(1)}
                  onSetVideoId={(next) =>
                    setVideoIds((cur) => {
                      const copy = [...cur];
                      copy[1] = next;
                      return copy;
                    })
                  }
                />
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>

        <ResizableHandle className={handleClass} />

        <ResizablePanel defaultSize={rowLayout[1]} minSize={0} collapsible>
          <ResizablePanelGroup
            direction="horizontal"
            className={"h-full w-full " + (anyMaximized ? quadrantPointerClass : "")}
            // @ts-expect-error - react-resizable-panels imperative handle
            groupRef={bottomColsRef}
            onLayout={(layout) => handleColsLayout("bottom", layout)}
          >
            <ResizablePanel defaultSize={colLayout[0]} minSize={0} collapsible>
              <div
                className={
                  "h-full w-full " +
                  (maximizedIdx !== null && maximizedIdx !== 2
                    ? "pointer-events-none opacity-0"
                    : "")
                }
              >
                <YouTubeQuadrant
                  index={2}
                  videoId={videoIds[2]}
                  maximized={maximizedIdx === 2}
                  anyMaximized={anyMaximized}
                  audioSelected={audioIdx === 2}
                  onSelectAudio={() => setAudioIdx(2)}
                  onToggleMaximize={() => toggleMaximize(2)}
                  onSetVideoId={(next) =>
                    setVideoIds((cur) => {
                      const copy = [...cur];
                      copy[2] = next;
                      return copy;
                    })
                  }
                />
              </div>
            </ResizablePanel>
            <ResizableHandle className={handleClass} />
            <ResizablePanel defaultSize={colLayout[1]} minSize={0} collapsible>
              <div
                className={
                  "h-full w-full " +
                  (maximizedIdx !== null && maximizedIdx !== 3
                    ? "pointer-events-none opacity-0"
                    : "")
                }
              >
                <YouTubeQuadrant
                  index={3}
                  videoId={videoIds[3]}
                  maximized={maximizedIdx === 3}
                  anyMaximized={anyMaximized}
                  audioSelected={audioIdx === 3}
                  onSelectAudio={() => setAudioIdx(3)}
                  onToggleMaximize={() => toggleMaximize(3)}
                  onSetVideoId={(next) =>
                    setVideoIds((cur) => {
                      const copy = [...cur];
                      copy[3] = next;
                      return copy;
                    })
                  }
                />
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}