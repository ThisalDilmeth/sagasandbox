"use client";

import Link from "next/link";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Loader2, Plus, Trash2 } from "lucide-react";

import { cn } from "@/lib/cn";
import { useSortedCards, useTimelineStore } from "@/store/timeline-store";
import type { TimelineCard } from "@/types/timeline";

export function CardTimeline() {
  const cards = useSortedCards();
  const addCard = useTimelineStore((s) => s.addCard);
  const reorderCards = useTimelineStore((s) => s.reorderCards);
  const deleteCard = useTimelineStore((s) => s.deleteCard);
  const updateCard = useTimelineStore((s) => s.updateCard);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    reorderCards(String(active.id), String(over.id));
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={cards.map((c) => c.id)}
          strategy={horizontalListSortingStrategy}
        >
          <div className="flex min-h-0 flex-1 items-stretch gap-3 overflow-x-auto px-1 py-2">
            {cards.map((card) => (
              <SortableCard
                key={card.id}
                card={card}
                onTitleChange={(title) => updateCard(card.id, { title })}
                onDelete={() => deleteCard(card.id)}
              />
            ))}
            <button
              type="button"
              onClick={() => addCard()}
              className="flex h-[120px] w-12 shrink-0 items-center justify-center rounded-xl border border-dashed border-[#2a2a2e] text-[#9ca3af] transition hover:border-[#7c3aed] hover:text-white"
              aria-label="Add card"
            >
              <Plus className="h-5 w-5" />
            </button>
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

function SortableCard({
  card,
  onTitleChange,
  onDelete,
}: {
  card: TimelineCard;
  onTitleChange: (title: string) => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: card.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const hasImage = card.genStatus === "done" && card.generatedImageUrl;
  const isGenerating = card.genStatus === "generating";
  const failed = card.genStatus === "error";

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group relative flex h-[120px] w-44 shrink-0 flex-col overflow-hidden rounded-xl border bg-[#1a1a1e]",
        failed ? "border-[#ef4444]" : "border-[#2a2a2e]",
        "hover:border-[#7c3aed]/60",
      )}
    >
      <Link
        href={`/timeline/${card.id}`}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="relative h-16 shrink-0 bg-[#252528]">
          {hasImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={card.generatedImageUrl!}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : isGenerating ? (
            <Loader2 className="absolute inset-0 m-auto h-5 w-5 animate-spin text-[#7c3aed]" />
          ) : (
            <span className="absolute inset-0 flex items-center justify-center font-mono text-[10px] text-[#6b7280]">
              #{card.order + 1}
            </span>
          )}
        </div>
        <div className="flex flex-1 items-center px-2 py-1">
          <input
            value={card.title}
            onClick={(e) => e.preventDefault()}
            onChange={(e) => onTitleChange(e.target.value)}
            className="w-full truncate bg-transparent text-xs font-medium text-white outline-none"
            aria-label="Card title"
          />
        </div>
      </Link>

      <button
        type="button"
        {...attributes}
        {...listeners}
        className="absolute left-1 top-1 rounded p-0.5 text-[#6b7280] opacity-0 transition group-hover:opacity-100 hover:bg-[#2a2a2e] hover:text-white"
        aria-label="Drag to reorder"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>

      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          if (confirm(`Delete "${card.title}"?`)) onDelete();
        }}
        className="absolute right-1 top-1 rounded p-0.5 text-[#6b7280] opacity-0 transition group-hover:opacity-100 hover:bg-[#2a2a2e] hover:text-[#ef4444]"
        aria-label="Delete card"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
