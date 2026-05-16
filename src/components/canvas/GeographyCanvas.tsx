"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { Stage, Layer, Line, Circle, Text, Group, Image as KonvaImage } from "react-konva";
import type Konva from "konva";
import type { LocationPin } from "@/types/app";
import { GEN_STATUS_COLORS } from "@/lib/constants";
import {
  broadcastCanvasOp,
  type CanvasOpPayload,
} from "@/hooks/useRealtime";
import { parseKonvaCanvasState } from "@/lib/canvas-state";
import { cn } from "@/lib/cn";
import { PinCreator } from "./PinCreator";
import { toastError } from "@/store/toast-store";

export type CanvasTool = "brush" | "pan";

export interface GeographyCanvasProps {
  projectId: string;
  pins: LocationPin[];
  onPinsChange: Dispatch<SetStateAction<LocationPin[]>>;
  onPinSelect: (pin: LocationPin) => void;
  onCanvasChange: (konvaJson: object) => void;
  initialCanvasState?: Record<string, unknown> | null;
  onHydrated?: () => void;
  loading?: boolean;
  userId?: string;
  apiAvailable?: boolean;
  highlightedPinId?: string | null;
}

export interface GeographyCanvasHandle {
  applyCanvasOp: (op: CanvasOpPayload) => void;
  hydrateFromState: (state: Record<string, unknown> | null | undefined) => void;
}

interface BrushLine {
  id: string;
  points: number[];
}

// World-space bounding box for the synthesised scenery image so it pans/zooms
// with the rest of the canvas instead of being fixed to the screen.
interface SceneryBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

const MIN_SCALE = 0.1;
const MAX_SCALE = 5;
const CURSOR_STALE_MS = 4000;
const CURSOR_BROADCAST_MS = 80;
// World-space distance the pointer must travel before a mousedown turns into a
// brush drag instead of a "click to place pin" action.
const DRAG_THRESHOLD = 4;

interface PeerCursor {
  x: number;
  y: number;
  updatedAt: number;
}

function pinColor(status: LocationPin["gen_status"]) {
  return GEN_STATUS_COLORS[status] ?? "#F59E0B";
}

export const GeographyCanvas = forwardRef<
  GeographyCanvasHandle,
  GeographyCanvasProps
>(function GeographyCanvas(
  {
    projectId,
    pins,
    onPinsChange,
    onPinSelect,
    onCanvasChange,
    initialCanvasState = null,
    onHydrated,
    loading = false,
    userId = "local",
    apiAvailable = true,
    highlightedPinId = null,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const cursorThrottleRef = useRef(0);
  const hydratedStateKeyRef = useRef<string | null>(null);

  // Distinguish a "click" from a "drag" without relying on e.target class checks.
  // mouseDownRef  — true while the primary button is held
  // hasMovedRef   — flips to true once the pointer crosses DRAG_THRESHOLD
  // mouseDownPt   — world-space position where the button was pressed
  const mouseDownRef = useRef(false);
  const hasMovedRef = useRef(false);
  const mouseDownPt = useRef<{ x: number; y: number } | null>(null);

  const [size, setSize] = useState({ width: 800, height: 600 });
  const [tool, setTool] = useState<CanvasTool>("brush");
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const [lines, setLines] = useState<BrushLine[]>([]);
  const [peerCursors, setPeerCursors] = useState<Record<string, PeerCursor>>(
    {},
  );
  const [drawing, setDrawing] = useState(false);
  const [currentLineId, setCurrentLineId] = useState<string | null>(null);
  const [pinCreator, setPinCreator] = useState<{ x: number; y: number } | null>(null);
  const [pinsVisible, setPinsVisible] = useState(true);

  // Scenery image is stored in *world space* so it moves and zooms with the canvas.
  const [sceneryImageUrl, setSceneryImageUrl] = useState<string | null>(null);
  const [sceneryBounds, setSceneryBounds] = useState<SceneryBounds | null>(null);
  const [sceneryImage, setSceneryImage] = useState<HTMLImageElement | null>(null);
  const [synthesizing, setSynthesizing] = useState(false);

  const hydrateFromState = useCallback(
    (state: Record<string, unknown> | null | undefined) => {
      const parsed = parseKonvaCanvasState(state);
      if (!parsed) {
        onHydrated?.();
        return;
      }
      setLines(parsed.lines);
      setStagePos({ x: parsed.viewport.x, y: parsed.viewport.y });
      setScale(parsed.viewport.scale);
      onHydrated?.();
    },
    [onHydrated],
  );

  const applyCanvasOp = useCallback(
    (op: CanvasOpPayload) => {
      if (op.user_id === userId) return;

      switch (op.op) {
        case "add":
        case "modify": {
          const points = op.payload.points;
          if (
            !Array.isArray(points) ||
            points.some((n) => typeof n !== "number")
          ) {
            return;
          }
          setLines((prev) => {
            const idx = prev.findIndex((l) => l.id === op.object_id);
            if (idx === -1) {
              return [...prev, { id: op.object_id, points: points as number[] }];
            }
            return prev.map((line) =>
              line.id === op.object_id
                ? { ...line, points: points as number[] }
                : line,
            );
          });
          break;
        }
        case "delete":
          setLines((prev) => prev.filter((l) => l.id !== op.object_id));
          break;
        case "cursor": {
          const x = op.payload.x;
          const y = op.payload.y;
          if (typeof x !== "number" || typeof y !== "number") return;
          setPeerCursors((prev) => ({
            ...prev,
            [op.user_id]: { x, y, updatedAt: Date.now() },
          }));
          break;
        }
        default:
          break;
      }
    },
    [userId],
  );

  useImperativeHandle(
    ref,
    () => ({ applyCanvasOp, hydrateFromState }),
    [applyCanvasOp, hydrateFromState],
  );

  // Hydrate canvas state and restore any previously synthesised scenery
  useEffect(() => {
    const stateKey = JSON.stringify(initialCanvasState ?? null);
    if (hydratedStateKeyRef.current === stateKey) return;
    hydratedStateKeyRef.current = stateKey;
    hydrateFromState(initialCanvasState);

    const url =
      typeof initialCanvasState?.scenery_preview_url === "string"
        ? initialCanvasState.scenery_preview_url
        : null;
    if (url) setSceneryImageUrl(url);
  }, [initialCanvasState, hydrateFromState]);

  // Load HTMLImageElement whenever the URL changes
  useEffect(() => {
    if (!sceneryImageUrl) {
      setSceneryImage(null);
      return;
    }
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.src = sceneryImageUrl;
    img.onload = () => setSceneryImage(img);
    img.onerror = () => setSceneryImage(null);
  }, [sceneryImageUrl]);

  // Prune stale peer cursors
  useEffect(() => {
    const interval = setInterval(() => {
      const cutoff = Date.now() - CURSOR_STALE_MS;
      setPeerCursors((prev) => {
        const next: Record<string, PeerCursor> = {};
        let changed = false;
        for (const [id, cursor] of Object.entries(prev)) {
          if (cursor.updatedAt >= cutoff) {
            next[id] = cursor;
          } else {
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Observe container resize
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const persistCanvas = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    onCanvasChange(JSON.parse(stage.toJSON()) as object);
  }, [onCanvasChange]);

  const handleWheel = useCallback((e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;

    const oldScale = stage.scaleX();
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const direction = e.evt.deltaY > 0 ? -1 : 1;
    const newScale = Math.min(
      MAX_SCALE,
      Math.max(MIN_SCALE, oldScale * (1 + direction * 0.08)),
    );

    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };

    const newPos = {
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    };

    stage.scale({ x: newScale, y: newScale });
    stage.position(newPos);
    onCanvasChange(JSON.parse(stage.toJSON()) as object);
    setScale(newScale);
    setStagePos(newPos);
  }, [onCanvasChange]);

  const getStagePoint = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return null;
    const pos = stage.getPointerPosition();
    if (!pos) return null;
    const transform = stage.getAbsoluteTransform().copy().invert();
    return transform.point(pos);
  }, []);

  // Record where the button went down — don't start drawing yet.
  const handlePointerDown = useCallback(() => {
    if (tool === "pan") return;
    const point = getStagePoint();
    if (!point) return;
    mouseDownRef.current = true;
    hasMovedRef.current = false;
    mouseDownPt.current = point;
  }, [tool, getStagePoint]);

  const broadcastCursor = useCallback(
    (point: { x: number; y: number }) => {
      const now = Date.now();
      if (now - cursorThrottleRef.current < CURSOR_BROADCAST_MS) return;
      cursorThrottleRef.current = now;
      void broadcastCanvasOp(projectId, {
        op: "cursor",
        user_id: userId,
        object_id: userId,
        payload: { x: point.x, y: point.y },
      });
    },
    [projectId, userId],
  );

  const handlePointerMove = useCallback(() => {
    const point = getStagePoint();
    if (!point) return;

    // Cross the drag threshold → start a brush stroke from the original down-point.
    if (
      mouseDownRef.current &&
      !hasMovedRef.current &&
      mouseDownPt.current &&
      tool === "brush"
    ) {
      const dx = Math.abs(point.x - mouseDownPt.current.x);
      const dy = Math.abs(point.y - mouseDownPt.current.y);
      if (dx > DRAG_THRESHOLD || dy > DRAG_THRESHOLD) {
        hasMovedRef.current = true;
        const id = crypto.randomUUID();
        setCurrentLineId(id);
        setDrawing(true);
        setLines((prev) => [
          ...prev,
          {
            id,
            points: [
              mouseDownPt.current!.x,
              mouseDownPt.current!.y,
              point.x,
              point.y,
            ],
          },
        ]);
        broadcastCursor(point);
        return; // point already included above
      }
    }

    if (drawing && currentLineId) {
      setLines((prev) =>
        prev.map((line) =>
          line.id === currentLineId
            ? { ...line, points: [...line.points, point.x, point.y] }
            : line,
        ),
      );
    }

    broadcastCursor(point);
  }, [drawing, currentLineId, tool, getStagePoint, broadcastCursor]);

  const handlePointerUp = useCallback(() => {
    mouseDownRef.current = false;
    if (drawing && currentLineId) {
      const line = lines.find((l) => l.id === currentLineId);
      if (line) {
        void broadcastCanvasOp(projectId, {
          op: "modify",
          user_id: userId,
          object_id: currentLineId,
          payload: { points: line.points },
        });
      }
      persistCanvas();
    }
    setDrawing(false);
    setCurrentLineId(null);
  }, [
    drawing,
    currentLineId,
    lines,
    projectId,
    userId,
    persistCanvas,
  ]);

  // Open the pin creator only on a true click (no drag). Because we no longer
  // create single-point stray lines on click, e.target is always the Stage or
  // Layer when clicking empty space — but we skip the target check entirely and
  // rely purely on hasMoved. Existing pins cancel event bubbling themselves.
  const handleStageClick = useCallback(
    (_e: Konva.KonvaEventObject<MouseEvent>) => {
      if (tool !== "brush") return;
      if (hasMovedRef.current) return; // was a drag
      const point = getStagePoint();
      if (!point) return;
      setPinCreator({ x: point.x, y: point.y });
    },
    [tool, getStagePoint],
  );

  const handlePinCreated = useCallback(
    (pin: LocationPin) => {
      onPinsChange((prev) => [...prev, pin]);
      setPinCreator(null);
    },
    [onPinsChange],
  );

  const toolbar = useMemo(
    () => (
      <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 gap-2 rounded-lg border border-[#2a2a2e] bg-[#1a1a1e]/95 p-1 shadow-lg backdrop-blur">
        {(["brush", "pan"] as CanvasTool[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTool(t)}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium capitalize",
              tool === t
                ? "bg-[#7c3aed] text-white"
                : "text-[#9ca3af] hover:text-white",
            )}
          >
            {t}
          </button>
        ))}
        {/* Hide / show pins toggle */}
        <button
          type="button"
          onClick={() => setPinsVisible((v) => !v)}
          title={pinsVisible ? "Hide location pins" : "Show location pins"}
          className={cn(
            "rounded-md px-3 py-1.5 text-xs font-medium",
            pinsVisible ? "text-[#9ca3af] hover:text-white" : "bg-[#1a1a1e] text-[#7c3aed] ring-1 ring-[#7c3aed]/60",
          )}
        >
          {pinsVisible ? "Hide pins" : "Show pins"}
        </button>
        {apiAvailable ? (
          <button
            type="button"
            disabled={synthesizing}
            onClick={() => {
              setSynthesizing(true);
              // Capture viewport world bounds at synthesis time so the generated
              // image is placed at exactly the region that was visible.
              const capturedBounds: SceneryBounds = {
                x: -stagePos.x / scale,
                y: -stagePos.y / scale,
                w: size.width / scale,
                h: size.height / scale,
              };
              void (async () => {
                try {
                  const pinRefs = pins.map((p) => ({
                    label: p.label,
                    description: p.description,
                    canvas_x: p.canvas_x,
                    canvas_y: p.canvas_y,
                  }));

                  const res = await fetch(
                    `/api/projects/${projectId}/canvas/synthesize`,
                    {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        pins: pinRefs,
                        canvas_width: size.width,
                        canvas_height: size.height,
                      }),
                    },
                  );
                  if (!res.ok) {
                    const body = (await res.json()) as { error?: string };
                    throw new Error(body.error ?? "Synthesis failed");
                  }
                  const data = (await res.json()) as { image_url?: string | null };
                  if (data.image_url) {
                    setSceneryImageUrl(data.image_url);
                    setSceneryBounds(capturedBounds);
                  } else {
                    toastError("Synthesis returned no image — check FAL_KEY");
                  }
                } catch (err) {
                  toastError(err instanceof Error ? err.message : "Synthesis failed");
                } finally {
                  setSynthesizing(false);
                }
              })();
            }}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium",
              synthesizing
                ? "cursor-wait text-[#9ca3af]"
                : "text-[#a78bfa] hover:bg-[#7c3aed]/20",
            )}
          >
            {synthesizing ? "Synthesizing…" : "Synthesize scenery"}
          </button>
        ) : null}
      </div>
    ),
    [tool, apiAvailable, projectId, pins, size, synthesizing, stagePos, scale, pinsVisible],
  );

  return (
    <div ref={containerRef} className="relative h-full w-full bg-[#0e0e0f]">
      {loading ? (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#0e0e0f]/80">
          <div className="h-48 w-full max-w-md animate-pulse rounded-lg bg-[#1a1a1e]" />
        </div>
      ) : null}
      {toolbar}
      {pins.length === 0 && !pinCreator ? (
        <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-[#9ca3af]">
          Click anywhere to add a location
        </p>
      ) : null}

      <Stage
        ref={stageRef}
        width={size.width}
        height={size.height}
        x={stagePos.x}
        y={stagePos.y}
        scaleX={scale}
        scaleY={scale}
        draggable={tool === "pan"}
        onWheel={handleWheel}
        onMouseDown={handlePointerDown}
        onTouchStart={handlePointerDown}
        onMousemove={handlePointerMove}
        onTouchMove={handlePointerMove}
        onMouseup={handlePointerUp}
        onTouchEnd={handlePointerUp}
        onClick={handleStageClick}
        onDragEnd={(e) => {
          if (tool === "pan") {
            const pos = { x: e.target.x(), y: e.target.y() };
            setStagePos(pos);
            persistCanvas();
          }
        }}
        className="cursor-crosshair"
      >
        {/* Scenery backdrop — lives in world space so it pans/zooms with the canvas.
            listening={false} ensures it never intercepts pointer events. */}
        {sceneryImage && sceneryBounds ? (
          <Layer listening={false}>
            <KonvaImage
              image={sceneryImage}
              x={sceneryBounds.x}
              y={sceneryBounds.y}
              width={sceneryBounds.w}
              height={sceneryBounds.h}
              opacity={0.85}
            />
          </Layer>
        ) : null}

        <Layer>
          {lines.map((line) => (
            <Line
              key={line.id}
              id={line.id}
              points={line.points}
              stroke="#7c3aed"
              strokeWidth={3 / scale}
              tension={0.4}
              lineCap="round"
              lineJoin="round"
            />
          ))}
          {Object.entries(peerCursors).map(([peerId, cursor]) => (
            <Group key={`cursor-${peerId}`} x={cursor.x} y={cursor.y}>
              <Circle radius={6} fill="#10b981" stroke="#0e0e0f" strokeWidth={2} />
              <Text
                text="Collaborator"
                fontSize={10}
                fill="#10b981"
                y={10}
                offsetX={28}
              />
            </Group>
          ))}
          {pinsVisible && pins.map((pin) => (
            <Group
              key={pin.id}
              x={pin.canvas_x}
              y={pin.canvas_y}
              onClick={(e) => {
                e.cancelBubble = true;
                onPinSelect(pin);
              }}
              onTap={(e) => {
                e.cancelBubble = true;
                onPinSelect(pin);
              }}
            >
              <Circle
                radius={10}
                fill={pinColor(pin.gen_status)}
                stroke={highlightedPinId === pin.id ? "#7c3aed" : "#0e0e0f"}
                strokeWidth={highlightedPinId === pin.id ? 3 : 2}
                shadowBlur={pin.gen_status === "generating" ? 8 : 0}
              />
              <Text
                text={pin.label}
                fontSize={12}
                fill="#e5e7eb"
                y={14}
                offsetX={pin.label.length * 3}
              />
            </Group>
          ))}
        </Layer>
      </Stage>

      {pinCreator ? (
        <PinCreator
          projectId={projectId}
          canvasX={pinCreator.x}
          canvasY={pinCreator.y}
          apiAvailable={apiAvailable}
          onCreated={handlePinCreated}
          onCancel={() => setPinCreator(null)}
        />
      ) : null}
    </div>
  );
});
