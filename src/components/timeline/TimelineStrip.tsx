"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check, Loader2, Mic, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { useUIStore } from "@/store/ui-store";
import type { LocationPin, TimelineEvent, Character } from "@/types/app";
import { asGenStatus } from "@/types/app";
import { GenStatusImage } from "@/components/shared/GenStatusImage";
import { RemoteImage } from "@/components/shared/RemoteImage";
import {
  PROJECT_API_UNAVAILABLE_MESSAGE,
  readApiError,
} from "@/lib/project-api";
import { toastError } from "@/store/toast-store";

interface TimelineStripProps {
  projectId: string;
  events: TimelineEvent[];
  pins: LocationPin[];
  characters: Character[];
  apiAvailable?: boolean;
  onEventsChange: Dispatch<SetStateAction<TimelineEvent[]>>;
  onPinSelect?: (pin: LocationPin) => void;
}

export function TimelineStrip({
  projectId,
  events,
  pins,
  characters,
  apiAvailable = true,
  onEventsChange,
  onPinSelect,
}: TimelineStripProps) {
  const activeEvent = useUIStore((s) => s.activeEvent);
  const setActiveEvent = useUIStore((s) => s.setActiveEvent);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: "",
    description: "",
    pin_id: "",
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!apiAvailable) {
      setError(PROJECT_API_UNAVAILABLE_MESSAGE);
      return;
    }
    setError(null);
    const sequence_order =
      events.length > 0
        ? Math.max(...events.map((ev) => ev.sequence_order)) + 1
        : 0;
    const optimistic: TimelineEvent = {
      id: `temp-${Date.now()}`,
      project_id: projectId,
      pin_id: form.pin_id || null,
      title: form.title,
      description: form.description,
      scene_keywords: null,
      sequence_order,
      in_world_time: null,
      generated_image_url: null,
      audio_url: null,
      fal_request_id: null,
      gen_status: "pending",
      is_ghost: false,
      audio_summary: null,
      created_at: new Date().toISOString(),
    };
    onEventsChange((prev) => [...prev, optimistic]);
    setShowAdd(false);
    try {
      const res = await fetch(`/api/projects/${projectId}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          sequence_order,
          pin_id: form.pin_id || undefined,
        }),
      });
      if (!res.ok) {
        throw new Error(await readApiError(res, "Create failed"));
      }
      const { event } = (await res.json()) as { event: TimelineEvent };
      onEventsChange((prev) =>
        [...prev.filter((ev) => ev.id !== optimistic.id), event].sort(
          (a, b) => a.sequence_order - b.sequence_order,
        ),
      );
      setForm({ title: "", description: "", pin_id: "" });
    } catch (err) {
      onEventsChange((prev) => prev.filter((ev) => ev.id !== optimistic.id));
      const message = err instanceof Error ? err.message : "Create failed";
      setError(message);
      toastError(message);
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    if (!apiAvailable) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = events.findIndex((ev) => ev.id === active.id);
    const newIndex = events.findIndex((ev) => ev.id === over.id);
    const reordered = arrayMove(events, oldIndex, newIndex).map((ev, i) => ({
      ...ev,
      sequence_order: i,
    }));
    onEventsChange(reordered);
    await Promise.all(
      reordered.map((ev) =>
        fetch(`/api/projects/${projectId}/events/${ev.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sequence_order: ev.sequence_order }),
        }),
      ),
    );
  }

  function pinLabel(pinId: string | null) {
    if (!pinId) return null;
    return pins.find((p) => p.id === pinId)?.label ?? "Unknown";
  }

  function matchedCharacters(description: string | null) {
    if (!description) return [];
    const lower = description.toLowerCase();
    return characters.filter((c) => lower.includes(c.name.toLowerCase()));
  }

  if (events.length === 0 && !showAdd) {
    return (
      <div className="flex h-full flex-col justify-center gap-2 px-4">
        {!apiAvailable ? (
          <p className="text-xs text-[#9ca3af]">{PROJECT_API_UNAVAILABLE_MESSAGE}</p>
        ) : null}
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          disabled={!apiAvailable}
          className="text-left text-sm text-[#9ca3af] hover:text-white disabled:opacity-50"
        >
          Add your first event →
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {!apiAvailable ? (
        <p className="px-4 pt-2 text-xs text-[#9ca3af]">
          {PROJECT_API_UNAVAILABLE_MESSAGE}
        </p>
      ) : null}
      {error ? (
        <p className="px-4 pt-2 text-xs text-[#ef4444]">{error}</p>
      ) : null}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={events.map((e) => e.id)}
          strategy={horizontalListSortingStrategy}
        >
          <div className="flex min-h-0 flex-1 items-stretch gap-3 overflow-x-auto px-4 py-3">
            {events.map((ev) => (
              <SortableEventCard
                key={ev.id}
                projectId={projectId}
                event={ev}
                pinLabel={pinLabel(ev.pin_id)}
                expanded={expandedId === ev.id}
                isActive={activeEvent?.id === ev.id}
                apiAvailable={apiAvailable}
                onToggle={() => {
                  setExpandedId(expandedId === ev.id ? null : ev.id);
                  setActiveEvent(ev);
                  if (ev.pin_id) {
                    const pin = pins.find((p) => p.id === ev.pin_id);
                    if (pin) onPinSelect?.(pin);
                  }
                }}
                onUpdated={(updated) =>
                  onEventsChange((prev) =>
                    prev.map((e) => (e.id === updated.id ? updated : e)),
                  )
                }
                onDeleted={(id) =>
                  onEventsChange((prev) => prev.filter((e) => e.id !== id))
                }
                matched={matchedCharacters(ev.description)}
              />
            ))}
            <button
              type="button"
              onClick={() => setShowAdd((v) => !v)}
              disabled={!apiAvailable}
              className="flex h-[88px] w-10 shrink-0 items-center justify-center rounded-lg border border-dashed border-[#2a2a2e] text-[#9ca3af] hover:border-[#7c3aed] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Add event"
            >
              <Plus className="h-5 w-5" />
            </button>
          </div>
        </SortableContext>
      </DndContext>

      {showAdd ? (
        <form
          onSubmit={handleAdd}
          className="flex shrink-0 flex-wrap items-end gap-2 border-t border-[#2a2a2e] px-4 py-2"
        >
          <input
            required
            disabled={!apiAvailable}
            placeholder="Event title"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="min-w-[120px] flex-1 rounded border border-[#2a2a2e] bg-[#0e0e0f] px-2 py-1 text-xs text-white disabled:opacity-50"
          />
          <input
            placeholder="Description"
            disabled={!apiAvailable}
            value={form.description}
            onChange={(e) =>
              setForm({ ...form, description: e.target.value })
            }
            className="min-w-[160px] flex-[2] rounded border border-[#2a2a2e] bg-[#0e0e0f] px-2 py-1 text-xs text-white disabled:opacity-50"
          />
          <select
            disabled={!apiAvailable}
            value={form.pin_id}
            onChange={(e) => setForm({ ...form, pin_id: e.target.value })}
            className="rounded border border-[#2a2a2e] bg-[#0e0e0f] px-2 py-1 text-xs text-white disabled:opacity-50"
          >
            <option value="">No pin</option>
            {pins.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={!apiAvailable}
            className="rounded bg-[#7c3aed] px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
          >
            Add
          </button>
        </form>
      ) : null}
    </div>
  );
}

function SortableEventCard({
  projectId,
  event,
  pinLabel,
  expanded,
  isActive,
  apiAvailable,
  onToggle,
  onUpdated,
  onDeleted,
  matched,
}: {
  projectId: string;
  event: TimelineEvent;
  pinLabel: string | null;
  expanded: boolean;
  isActive: boolean;
  apiAvailable: boolean;
  onToggle: () => void;
  onUpdated: (event: TimelineEvent) => void;
  onDeleted: (id: string) => void;
  matched: Character[];
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(event.title);
  const [description, setDescription] = useState(event.description ?? "");
  const [recording, setRecording] = useState(false);
  const [sceneKeywords, setSceneKeywords] = useState(event.scene_keywords ?? "");
  const [generatingScene, setGeneratingScene] = useState(false);
  const isGhost = event.is_ghost;
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: event.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  async function handleSaveEdit() {
    try {
      const res = await fetch(`/api/projects/${projectId}/events/${event.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description }),
      });
      if (!res.ok) throw new Error(await readApiError(res, "Update failed"));
      const { event: updated } = (await res.json()) as { event: TimelineEvent };
      onUpdated(updated);
      setEditing(false);
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Update failed");
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete "${event.title}"?`)) return;
    try {
      const res = await fetch(`/api/projects/${projectId}/events/${event.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(await readApiError(res, "Delete failed"));
      onDeleted(event.id);
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  async function handleVoice(blob: Blob) {
    const form = new FormData();
    form.append("file", blob, "voice.webm");
    try {
      const res = await fetch(`/api/projects/${projectId}/events/${event.id}/voice`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) throw new Error(await readApiError(res, "Voice upload failed"));
      const { event: updated } = (await res.json()) as { event: TimelineEvent };
      onUpdated(updated);
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Voice failed");
    }
  }

  async function handleGenerateScene() {
    if (!apiAvailable) return;
    setGeneratingScene(true);
    // Optimistically mark as generating
    onUpdated({ ...event, gen_status: "generating" });
    try {
      const res = await fetch(
        `/api/projects/${projectId}/events/${event.id}/scene`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scene_keywords: sceneKeywords }),
        },
      );
      if (!res.ok) throw new Error(await readApiError(res, "Scene generation failed"));
      const { event: updated } = (await res.json()) as { event: TimelineEvent };
      onUpdated(updated);
    } catch (err) {
      onUpdated({ ...event, gen_status: "error" });
      toastError(err instanceof Error ? err.message : "Scene generation failed");
    } finally {
      setGeneratingScene(false);
    }
  }

  return (
    <div ref={setNodeRef} style={style} className="relative shrink-0">
      <button
        type="button"
        {...attributes}
        {...listeners}
        onClick={onToggle}
        className={cn(
          "flex h-[88px] w-40 flex-col overflow-hidden rounded-lg border bg-[#1a1a1e] text-left",
          isGhost ? "border-dashed border-[#9ca3af]/50 opacity-50" : "border-[#2a2a2e]",
          isActive && !isGhost && "ring-2 ring-[#7c3aed]",
        )}
      >
        <div className="relative h-10 shrink-0 overflow-hidden bg-[#252528]">
          {event.gen_status === "done" && event.generated_image_url ? (
            <RemoteImage
              src={event.generated_image_url}
              alt=""
              width={160}
              height={40}
              className="h-full w-full object-cover"
            />
          ) : event.gen_status === "generating" ? (
            <Loader2 className="absolute inset-0 m-auto h-4 w-4 animate-spin text-[#7c3aed]" />
          ) : event.gen_status === "done" ? (
            <Check className="absolute right-1 top-1 h-3 w-3 text-[#10b981]" />
          ) : null}
        </div>
        <div className="flex flex-1 flex-col justify-center px-2 py-1">
          <p className="truncate text-xs font-medium text-white">
            {event.title}
          </p>
          {pinLabel ? (
            <span className="truncate text-[10px] text-[#7c3aed]">
              📍 {pinLabel}
            </span>
          ) : null}
        </div>
      </button>

      {expanded ? (
        <div className="absolute bottom-full left-0 z-20 mb-2 w-80 rounded-lg border border-[#2a2a2e] bg-[#1a1a1e] p-3 shadow-xl">
          {isGhost ? (
            <p className="mb-2 text-[10px] uppercase tracking-wide text-[#9ca3af]">
              Ghost node — approve in Copilot
            </p>
          ) : null}

          {/* Scene image / generation status */}
          <GenStatusImage
            status={asGenStatus(event.gen_status)}
            imageUrl={event.generated_image_url}
            alt={event.title}
            className="mb-2"
          />

          {/* ── Scene canvas ─────────────────────────────────────────────── */}
          <div className="mb-3 rounded-md border border-[#2a2a2e] bg-[#0e0e0f] p-2">
            <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-[#7c3aed]">
              Scene
            </p>
            <textarea
              value={sceneKeywords}
              onChange={(e) => setSceneKeywords(e.target.value)}
              placeholder={`What's in this scene? e.g. "volcano erupting at night, hero fleeing, ash clouds"\n(Leave blank to use the event description)`}
              rows={3}
              disabled={!apiAvailable || generatingScene}
              className="mb-2 w-full resize-none rounded border border-[#2a2a2e] bg-[#1a1a1e] px-2 py-1.5 text-xs text-white placeholder-[#4b5563] outline-none focus:border-[#7c3aed] disabled:opacity-50"
            />
            <button
              type="button"
              disabled={!apiAvailable || generatingScene}
              onClick={() => void handleGenerateScene()}
              className="flex w-full items-center justify-center gap-1.5 rounded bg-[#7c3aed] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            >
              {generatingScene ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Generating scene…
                </>
              ) : (
                <>
                  <Sparkles className="h-3 w-3" />
                  Generate scene
                </>
              )}
            </button>
          </div>

          {/* Event description / edit */}
          {editing ? (
            <div className="space-y-2">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded border border-[#2a2a2e] bg-[#0e0e0f] px-2 py-1 text-xs text-white"
              />
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="w-full rounded border border-[#2a2a2e] bg-[#0e0e0f] px-2 py-1 text-xs text-white"
              />
              <button
                type="button"
                onClick={() => void handleSaveEdit()}
                className="rounded bg-[#7c3aed] px-2 py-1 text-xs text-white"
              >
                Save
              </button>
            </div>
          ) : (
            <p className="text-xs text-[#e5e7eb]">
              {event.audio_summary ?? event.description}
            </p>
          )}

          {matched.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1">
              {matched.map((c) => (
                <span
                  key={c.id}
                  className="rounded-full bg-[#2a2a2e] px-2 py-1 text-[10px]"
                >
                  {c.name}
                </span>
              ))}
            </div>
          ) : null}

          {event.audio_url ? (
            <audio controls src={event.audio_url} className="mt-2 w-full" />
          ) : null}

          <div className="mt-2 flex gap-1">
            <button
              type="button"
              disabled={!apiAvailable}
              onClick={() => setEditing((v) => !v)}
              className="rounded p-1 text-[#9ca3af] hover:bg-[#2a2a2e] hover:text-white disabled:opacity-50"
              aria-label="Edit"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              disabled={!apiAvailable || recording}
              onClick={() => {
                void navigator.mediaDevices.getUserMedia({ audio: true }).then(
                  async (stream) => {
                    setRecording(true);
                    const recorder = new MediaRecorder(stream);
                    const chunks: Blob[] = [];
                    recorder.ondataavailable = (e) => chunks.push(e.data);
                    recorder.onstop = () => {
                      stream.getTracks().forEach((t) => t.stop());
                      void handleVoice(new Blob(chunks, { type: "audio/webm" }));
                      setRecording(false);
                    };
                    recorder.start();
                    setTimeout(() => recorder.stop(), 5000);
                  },
                );
              }}
              className="rounded p-1 text-[#9ca3af] hover:bg-[#2a2a2e] hover:text-white disabled:opacity-50"
              aria-label="Record voice"
            >
              <Mic className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              disabled={!apiAvailable}
              onClick={() => void handleDelete()}
              className="rounded p-1 text-[#ef4444] hover:bg-[#2a2a2e] disabled:opacity-50"
              aria-label="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
