"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Layer, Line, Stage } from "react-konva";
import type Konva from "konva";

import type { WhiteboardData, WhiteboardStroke } from "@/types/timeline";

export type CardWhiteboardHandle = {
  getSketchDataUrl: () => string | null;
};

const STAGE_WIDTH = 960;
const STAGE_HEIGHT = 540;

type Tool = "brush" | "eraser";

interface CardWhiteboardProps {
  data: WhiteboardData;
  onChange: (data: WhiteboardData) => void;
  onSketchExport?: (dataUrl: string) => void;
}

export const CardWhiteboard = forwardRef<
  CardWhiteboardHandle,
  CardWhiteboardProps
>(function CardWhiteboard({ data, onChange, onSketchExport }, ref) {
  const [tool, setTool] = useState<Tool>("brush");
  const [color, setColor] = useState("#e5e7eb");
  const [strokeWidth, setStrokeWidth] = useState(4);
  const isDrawing = useRef(false);
  const stageRef = useRef<Konva.Stage | null>(null);

  const exportSketch = useCallback((): string | null => {
    if (!stageRef.current) return null;
    try {
      return stageRef.current.toDataURL({ pixelRatio: 1 });
    } catch {
      return null;
    }
  }, []);

  useImperativeHandle(ref, () => ({ getSketchDataUrl: exportSketch }), [
    exportSketch,
  ]);

  const handlePointerDown = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
      isDrawing.current = true;
      const stage = e.target.getStage();
      const pos = stage?.getPointerPosition();
      if (!pos) return;

      const stroke: WhiteboardStroke = {
        tool,
        points: [pos.x, pos.y],
        strokeWidth: tool === "eraser" ? strokeWidth * 3 : strokeWidth,
        color: tool === "eraser" ? "#0f0f12" : color,
      };

      onChange({ strokes: [...data.strokes, stroke] });
    },
    [color, data.strokes, onChange, strokeWidth, tool],
  );

  const handlePointerMove = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
      if (!isDrawing.current) return;
      const stage = e.target.getStage();
      const pos = stage?.getPointerPosition();
      if (!pos || data.strokes.length === 0) return;

      const strokes = [...data.strokes];
      const last = { ...strokes[strokes.length - 1] };
      last.points = last.points.concat([pos.x, pos.y]);
      strokes[strokes.length - 1] = last;
      onChange({ strokes });
    },
    [data.strokes, onChange],
  );

  const handlePointerUp = useCallback(() => {
    isDrawing.current = false;
    const dataUrl = exportSketch();
    if (dataUrl && onSketchExport) onSketchExport(dataUrl);
  }, [exportSketch, onSketchExport]);

  useEffect(() => {
    const dataUrl = exportSketch();
    if (dataUrl && onSketchExport) onSketchExport(dataUrl);
  }, [data.strokes, exportSketch, onSketchExport]);

  function clearCanvas() {
    onChange({ strokes: [] });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-hidden rounded-xl border border-[#2a2a2e] bg-[#0f0f12]">
        <Stage
          ref={stageRef}
          width={STAGE_WIDTH}
          height={STAGE_HEIGHT}
          className="mx-auto max-w-full touch-none"
          onMouseDown={handlePointerDown}
          onMousemove={handlePointerMove}
          onMouseup={handlePointerUp}
          onMouseleave={handlePointerUp}
          onTouchStart={handlePointerDown}
          onTouchmove={handlePointerMove}
          onTouchend={handlePointerUp}
        >
          <Layer>
            {data.strokes.map((stroke, i) => (
              <Line
                key={i}
                points={stroke.points}
                stroke={stroke.color}
                strokeWidth={stroke.strokeWidth}
                tension={0.4}
                lineCap="round"
                lineJoin="round"
                globalCompositeOperation={
                  stroke.tool === "eraser" ? "destination-out" : "source-over"
                }
              />
            ))}
          </Layer>
        </Stage>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <ToolButton
          active={tool === "brush"}
          onClick={() => setTool("brush")}
          label="Brush"
        />
        <ToolButton
          active={tool === "eraser"}
          onClick={() => setTool("eraser")}
          label="Erase"
        />
        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="h-8 w-10 cursor-pointer rounded border border-[#2a2a2e] bg-transparent"
          aria-label="Brush color"
        />
        <label className="flex items-center gap-2 text-xs text-[#9ca3af]">
          Size
          <input
            type="range"
            min={2}
            max={24}
            value={strokeWidth}
            onChange={(e) => setStrokeWidth(Number(e.target.value))}
            className="w-24"
          />
        </label>
        <button
          type="button"
          onClick={clearCanvas}
          className="ml-auto rounded-lg border border-[#2a2a2e] px-3 py-1.5 text-xs text-[#9ca3af] hover:border-[#7c3aed] hover:text-white"
        >
          Clear
        </button>
      </div>
    </div>
  );
});

function ToolButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "rounded-lg bg-[#7c3aed] px-3 py-1.5 text-xs font-medium text-white"
          : "rounded-lg border border-[#2a2a2e] px-3 py-1.5 text-xs text-[#9ca3af] hover:text-white"
      }
    >
      {label}
    </button>
  );
}
