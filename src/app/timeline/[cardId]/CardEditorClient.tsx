"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Loader2, Sparkles } from "lucide-react";

import { GenStatusImage } from "@/components/shared/GenStatusImage";
import { useTimelineStore } from "@/store/timeline-store";
import type { GenStatus } from "@/types/timeline";

import type { CardWhiteboardHandle } from "@/components/whiteboard/CardWhiteboard";

const CardWhiteboard = dynamic(
  () =>
    import("@/components/whiteboard/CardWhiteboard").then(
      (m) => m.CardWhiteboard,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[320px] items-center justify-center rounded-xl bg-[#1a1a1e] text-sm text-[#9ca3af]">
        Loading whiteboard…
      </div>
    ),
  },
);

function mapGenStatus(status: string): GenStatus {
  if (status === "generating") return "generating";
  if (status === "done") return "done";
  if (status === "error") return "error";
  return "idle";
}

function toDisplayStatus(
  status: ReturnType<typeof mapGenStatus>,
): "pending" | "generating" | "done" | "error" {
  if (status === "idle") return "pending";
  return status;
}

export function CardEditorClient({ cardId }: { cardId: string }) {
  const router = useRouter();
  const card = useTimelineStore((s) =>
    s.project.cards.find((c) => c.id === cardId),
  );
  const setWhiteboard = useTimelineStore((s) => s.setWhiteboard);
  const setCardPrompt = useTimelineStore((s) => s.setCardPrompt);
  const setCardGeneration = useTimelineStore((s) => s.setCardGeneration);
  const updateCard = useTimelineStore((s) => s.updateCard);

  const sketchRef = useRef<string | null>(null);
  const whiteboardRef = useRef<CardWhiteboardHandle>(null);
  const [localPrompt, setLocalPrompt] = useState("");
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (card) setLocalPrompt(card.prompt);
  }, [card?.id, card?.prompt, card]);

  const handleSketchExport = useCallback((dataUrl: string) => {
    sketchRef.current = dataUrl;
  }, []);

  if (!card) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#0f0f12] text-[#e5e7eb]">
        <p>Card not found.</p>
        <Link href="/timeline" className="text-[#7c3aed] hover:underline">
          Back to timeline
        </Link>
      </div>
    );
  }

  async function handleGenerate() {
    const prompt = localPrompt.trim();
    if (!prompt) return;

    setGenerating(true);
    setCardPrompt(cardId, prompt);
    setCardGeneration(cardId, {
      genStatus: "generating",
      genError: undefined,
    });

    try {
      const res = await fetch("/api/timeline/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          sketchDataUrl:
            whiteboardRef.current?.getSketchDataUrl() ?? sketchRef.current,
        }),
      });
      const data = (await res.json()) as {
        imageUrl?: string;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error ?? "Generation failed");
      }
      setCardGeneration(cardId, {
        genStatus: "done",
        generatedImageUrl: data.imageUrl ?? null,
        genError: undefined,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Generation failed";
      setCardGeneration(cardId, {
        genStatus: "error",
        genError: message,
      });
    } finally {
      setGenerating(false);
    }
  }

  const displayStatus = toDisplayStatus(mapGenStatus(card.genStatus));

  return (
    <div className="flex min-h-screen flex-col bg-[#0f0f12] text-[#e5e7eb]">
      <header className="flex items-center gap-3 border-b border-[#2a2a2e] px-4 py-3">
        <button
          type="button"
          onClick={() => router.push("/timeline")}
          className="inline-flex items-center gap-1 rounded-lg border border-[#2a2a2e] px-2 py-1 text-xs text-[#9ca3af] hover:text-white"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Timeline
        </button>
        <input
          value={card.title}
          onChange={(e) => updateCard(cardId, { title: e.target.value })}
          className="min-w-0 flex-1 bg-transparent text-base font-semibold outline-none"
        />
        <span className="font-mono text-[10px] text-[#6b7280]">
          #{card.order + 1}
        </span>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6">
        <CardWhiteboard
          ref={whiteboardRef}
          data={card.whiteboard}
          onChange={(whiteboard) => setWhiteboard(cardId, whiteboard)}
          onSketchExport={handleSketchExport}
        />

        <section className="space-y-3">
          <label className="block text-xs font-medium uppercase tracking-wide text-[#9ca3af]">
            Scene prompt
          </label>
          <textarea
            value={localPrompt}
            onChange={(e) => setLocalPrompt(e.target.value)}
            rows={3}
            placeholder="Describe the scenario for this beat…"
            className="w-full resize-y rounded-xl border border-[#2a2a2e] bg-[#1a1a1e] px-3 py-2 text-sm text-white outline-none focus:border-[#7c3aed]"
          />
          <button
            type="button"
            disabled={generating || !localPrompt.trim()}
            onClick={() => void handleGenerate()}
            className="inline-flex items-center gap-2 rounded-full bg-[#7c3aed] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#6d28d9] disabled:opacity-50"
          >
            {generating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Generate scene
          </button>
          {card.genError ? (
            <p className="text-xs text-[#ef4444]">{card.genError}</p>
          ) : null}
        </section>

        <section className="space-y-2">
          <h2 className="text-xs font-medium uppercase tracking-wide text-[#9ca3af]">
            Generated preview
          </h2>
          <GenStatusImage
            status={displayStatus}
            imageUrl={card.generatedImageUrl}
            alt={card.title}
            onRetry={() => void handleGenerate()}
          />
        </section>
      </main>
    </div>
  );
}
