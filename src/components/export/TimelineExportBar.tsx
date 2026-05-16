"use client";

import { useState } from "react";
import { Download, Film, Loader2 } from "lucide-react";

import { useSortedCards } from "@/store/timeline-store";

export function TimelineExportBar() {
  const cards = useSortedCards();
  const readyImages = cards
    .filter((c) => c.generatedImageUrl)
    .map((c) => c.generatedImageUrl as string);

  const [exporting, setExporting] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function handleExport() {
    if (readyImages.length === 0) {
      setError("Generate at least one scene image before exporting.");
      return;
    }

    setExporting(true);
    setError(null);
    setVideoUrl(null);
    setNote(null);

    const prompt =
      cards.find((c) => c.generatedImageUrl && (c.prompt || c.title))?.prompt ||
      cards.find((c) => c.generatedImageUrl)?.title ||
      cards.map((c) => c.prompt || c.title).filter(Boolean).join(". ");

    try {
      const res = await fetch("/api/timeline/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          imageUrls: readyImages,
        }),
      });
      const data = (await res.json()) as {
        videoUrl?: string;
        error?: string;
        note?: string;
      };
      if (!res.ok) {
        throw new Error(data.error ?? "Export failed");
      }
      setVideoUrl(data.videoUrl ?? null);
      setNote(data.note ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-[#2a2a2e] px-4 py-3">
      <button
        type="button"
        disabled={exporting || readyImages.length === 0}
        onClick={() => void handleExport()}
        className="inline-flex items-center gap-2 rounded-full bg-[#7c3aed] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#6d28d9] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {exporting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Film className="h-4 w-4" />
        )}
        Export timeline video
      </button>

      <span className="font-mono text-[10px] text-[#6b7280]">
        {readyImages.length}/{cards.length} scenes ready
      </span>

      {error ? (
        <p className="text-xs text-[#ef4444]">{error}</p>
      ) : null}

      {note ? <p className="text-xs text-[#9ca3af]">{note}</p> : null}

      {videoUrl ? (
        <a
          href={videoUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs text-[#10b981] hover:underline"
        >
          <Download className="h-3.5 w-3.5" />
          Download MP4
        </a>
      ) : null}
    </div>
  );
}
