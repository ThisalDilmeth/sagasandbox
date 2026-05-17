"use client";

import { useCallback, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { MapPin, Plus, Trash2, Pencil, Check, X, Download, Sparkles } from "lucide-react";
import type { LocationPin, Project } from "@/types/app";
import { ToastHost } from "@/components/shared/ToastHost";
import { RemoteImage } from "@/components/shared/RemoteImage";
import { cn } from "@/lib/cn";
import { toastError } from "@/store/toast-store";
import { readApiError } from "@/lib/project-api";

const GeographyCanvas = dynamic(
  () =>
    import("@/components/canvas/GeographyCanvas").then(
      (m) => m.GeographyCanvas,
    ),
  { ssr: false },
);

// ── Style presets ─────────────────────────────────────────────────────────────
const STYLE_PRESETS = [
  { id: "photorealistic",  label: "Photorealistic", theme: "photorealistic",    aesthetic_style: "cinematic photorealistic" },
  { id: "fantasy",         label: "Fantasy",        theme: "High Fantasy",      aesthetic_style: "painterly high fantasy" },
  { id: "cyberpunk",       label: "Cyberpunk",      theme: "Cyberpunk Noir",    aesthetic_style: "neon-lit cyberpunk" },
  { id: "horror",          label: "Horror",         theme: "Psychological Horror", aesthetic_style: "dark atmospheric horror" },
  { id: "watercolour",     label: "Watercolour",    theme: "photorealistic",    aesthetic_style: "soft watercolour illustration" },
  { id: "scifi",           label: "Sci-Fi",         theme: "Sci-Fi",            aesthetic_style: "cinematic science fiction" },
] as const;

// ── Inline pin editor ─────────────────────────────────────────────────────────
function PinRow({
  pin,
  projectId,
  onUpdated,
  onDeleted,
}: {
  pin: LocationPin;
  projectId: string;
  onUpdated: (p: LocationPin) => void;
  onDeleted: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(pin.label);
  const [desc, setDesc] = useState(pin.description ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/pins/${pin.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, description: desc }),
      });
      if (!res.ok) throw new Error(await readApiError(res, "Save failed"));
      const { pin: updated } = (await res.json()) as { pin: LocationPin };
      onUpdated(updated);
      setEditing(false);
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function del() {
    if (!confirm(`Remove "${pin.label}"?`)) return;
    try {
      const res = await fetch(`/api/projects/${projectId}/pins/${pin.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await readApiError(res, "Delete failed"));
      onDeleted(pin.id);
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  if (editing) {
    return (
      <div className="rounded-lg border border-[#7c3aed]/50 bg-[#1a1a1e] p-2 space-y-1.5">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Object name"
          className="w-full rounded border border-[#2a2a2e] bg-[#0e0e0f] px-2 py-1 text-xs text-white outline-none focus:border-[#7c3aed]"
        />
        <textarea
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder="Describe it (optional)"
          rows={2}
          className="w-full resize-none rounded border border-[#2a2a2e] bg-[#0e0e0f] px-2 py-1 text-xs text-white outline-none focus:border-[#7c3aed]"
        />
        <div className="flex gap-1.5">
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="flex items-center gap-1 rounded bg-[#7c3aed] px-2 py-1 text-xs font-medium text-white disabled:opacity-50"
          >
            <Check className="h-3 w-3" /> Save
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="flex items-center gap-1 rounded border border-[#2a2a2e] px-2 py-1 text-xs text-[#9ca3af] hover:text-white"
          >
            <X className="h-3 w-3" /> Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="group flex items-start gap-2 rounded-lg border border-[#2a2a2e] bg-[#1a1a1e] p-2.5 hover:border-[#3a3a3e]">
      <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#7c3aed]" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-white">{pin.label}</p>
        {pin.description ? (
          <p className="mt-0.5 line-clamp-2 text-[10px] text-[#6b7280]">{pin.description}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="rounded p-1 text-[#9ca3af] hover:bg-[#2a2a2e] hover:text-white"
          title="Edit"
        >
          <Pencil className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={() => void del()}
          className="rounded p-1 text-[#9ca3af] hover:bg-[#2a2a2e] hover:text-[#ef4444]"
          title="Remove"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

// ── Main workspace ─────────────────────────────────────────────────────────────
export interface StudioWorkspaceProps {
  project: Project;
  initialPins: LocationPin[];
}

export function StudioWorkspace({ project, initialPins }: StudioWorkspaceProps) {
  const [pins, setPins] = useState(initialPins);
  const [selectedPin, setSelectedPin] = useState<LocationPin | null>(null);
  const [styleId, setStyleId] = useState("photorealistic");
  const [projectTheme, setProjectTheme] = useState(project.theme);
  const [projectStyle, setProjectStyle] = useState(project.aesthetic_style);
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  const [synthesizing, setSynthesizing] = useState(false);
  const [showResult, setShowResult] = useState(false);

  const handlePinSelect = useCallback((pin: LocationPin) => {
    setSelectedPin(pin);
  }, []);

  const handlePinsChange = useCallback(
    (updater: React.SetStateAction<LocationPin[]>) => {
      setPins(updater);
    },
    [],
  );

  async function applyStyle(id: string) {
    const preset = STYLE_PRESETS.find((p) => p.id === id);
    if (!preset) return;
    setStyleId(id);
    setProjectTheme(preset.theme);
    setProjectStyle(preset.aesthetic_style);
    try {
      await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme: preset.theme, aesthetic_style: preset.aesthetic_style }),
      });
    } catch {
      // non-critical — style is applied locally regardless
    }
  }

  async function handleGenerate() {
    if (pins.length === 0) {
      toastError("Place at least one pin on the canvas first");
      return;
    }
    setSynthesizing(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/canvas/synthesize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pins: pins.map((p) => ({
            label: p.label,
            description: p.description,
            canvas_x: p.canvas_x,
            canvas_y: p.canvas_y,
          })),
          canvas_width: 1280,
          canvas_height: 720,
          existing_image_url: generatedImageUrl ?? undefined,
        }),
      });
      if (!res.ok) throw new Error(await readApiError(res, "Generation failed"));
      const { image_url } = (await res.json()) as { image_url: string };
      setGeneratedImageUrl(image_url);
      setShowResult(true);
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setSynthesizing(false);
    }
  }

  return (
    <div className="flex h-screen flex-col bg-[#0f0f12] text-white">
      <ToastHost />

      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-[#1a1a1e] px-4">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="flex items-center gap-2 text-sm font-semibold text-white hover:text-[#a78bfa] transition-colors"
          >
            <span className="text-[#7c3aed]">◈</span>
            PinScene
          </Link>
          <span className="text-[#2a2a2e]">|</span>
          <span className="text-xs text-[#6b7280]">{project.name}</span>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/studio"
            className="rounded-md border border-[#2a2a2e] px-3 py-1.5 text-xs text-[#9ca3af] hover:border-[#7c3aed]/50 hover:text-white transition-colors"
          >
            <Plus className="inline h-3 w-3 mr-1" />
            New scene
          </Link>
        </div>
      </header>

      {/* ── Main area ─────────────────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1">
        {/* Canvas */}
        <div className="relative flex-1">
          <GeographyCanvas
            projectId={project.id}
            pins={pins}
            userId="local"
            apiAvailable
            onPinsChange={handlePinsChange}
            onPinSelect={handlePinSelect}
            onCanvasChange={() => {
              /* no-op for studio — canvas state not persisted */
            }}
          />
        </div>

        {/* ── Right sidebar ─────────────────────────────────────────────── */}
        <aside className="flex w-72 shrink-0 flex-col border-l border-[#1a1a1e] bg-[#0f0f12]">
          {/* Style selector */}
          <div className="border-b border-[#1a1a1e] p-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-[#4b5563]">
              Style
            </p>
            <div className="flex flex-wrap gap-1.5">
              {STYLE_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => void applyStyle(preset.id)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                    styleId === preset.id
                      ? "border-[#7c3aed] bg-[#7c3aed]/20 text-white"
                      : "border-[#2a2a2e] text-[#6b7280] hover:border-[#3a3a3e] hover:text-[#9ca3af]",
                  )}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Generate button */}
          <div className="border-b border-[#1a1a1e] p-3">
            <button
              type="button"
              disabled={synthesizing || pins.length === 0}
              onClick={() => void handleGenerate()}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#7c3aed] py-2.5 text-sm font-semibold text-white shadow-lg shadow-[#7c3aed]/20 transition-all hover:bg-[#6d28d9] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {synthesizing ? (
                <>
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Generating…
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Generate image
                </>
              )}
            </button>
            {pins.length === 0 ? (
              <p className="mt-1.5 text-center text-[10px] text-[#4b5563]">
                Click the canvas to place your first pin
              </p>
            ) : (
              <p className="mt-1.5 text-center text-[10px] text-[#4b5563]">
                {pins.length} object{pins.length > 1 ? "s" : ""} · click Generate to render
              </p>
            )}
          </div>

          {/* Pin list */}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="flex items-center justify-between px-3 pt-3 pb-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-[#4b5563]">
                Objects on canvas
              </p>
              {pins.length > 0 ? (
                <span className="rounded-full bg-[#7c3aed]/20 px-2 py-0.5 text-[10px] font-bold text-[#a78bfa]">
                  {pins.length}
                </span>
              ) : null}
            </div>

            {pins.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full border border-dashed border-[#2a2a2e]">
                  <MapPin className="h-5 w-5 text-[#3a3a3e]" />
                </div>
                <p className="text-xs text-[#4b5563]">
                  Click anywhere on the canvas to place an object pin.
                </p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2">
                {pins.map((pin) => (
                  <PinRow
                    key={pin.id}
                    pin={pin}
                    projectId={project.id}
                    onUpdated={(updated) =>
                      setPins((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
                    }
                    onDeleted={(id) =>
                      setPins((prev) => prev.filter((p) => p.id !== id))
                    }
                  />
                ))}
              </div>
            )}
          </div>

          {/* Generated image preview */}
          {generatedImageUrl ? (
            <div className="border-t border-[#1a1a1e] p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-[#4b5563]">
                  Last result
                </p>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setShowResult((v) => !v)}
                    className="rounded px-2 py-0.5 text-[10px] text-[#6b7280] hover:text-white"
                  >
                    {showResult ? "Hide" : "Show on canvas"}
                  </button>
                </div>
              </div>
              <div className="relative overflow-hidden rounded-lg border border-[#2a2a2e]">
                <RemoteImage
                  src={generatedImageUrl}
                  alt="Generated scene"
                  width={256}
                  height={144}
                  className="w-full object-cover"
                />
                <a
                  href={generatedImageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  download
                  className="absolute bottom-1.5 right-1.5 flex items-center gap-1 rounded-md bg-black/60 px-2 py-1 text-[10px] text-white backdrop-blur-sm hover:bg-black/80"
                >
                  <Download className="h-3 w-3" />
                  Download
                </a>
              </div>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
