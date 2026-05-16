"use client";

import { useEffect } from "react";

import { CardTimeline } from "@/components/timeline/CardTimeline";
import { TimelineExportBar } from "@/components/export/TimelineExportBar";
import { useTimelineStore } from "@/store/timeline-store";

export function TimelineShell() {
  const hydrated = useTimelineStore((s) => s.hydrated);
  const projectName = useTimelineStore((s) => s.project.name);
  const setProjectName = useTimelineStore((s) => s.setProjectName);
  const setHydrated = useTimelineStore((s) => s.setHydrated);

  useEffect(() => {
    setHydrated(true);
  }, [setHydrated]);

  if (!hydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0f0f12] text-[#9ca3af]">
        Loading timeline…
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#0f0f12] text-[#e5e7eb]">
      <header className="flex shrink-0 items-center gap-4 border-b border-[#2a2a2e] px-6 py-4">
        <p className="text-xs font-medium uppercase tracking-widest text-[#7c3aed]">
          SagaSandbox
        </p>
        <input
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          className="min-w-0 flex-1 bg-transparent text-lg font-semibold outline-none placeholder:text-[#6b7280]"
          placeholder="Story title"
          aria-label="Project name"
        />
      </header>

      <main className="flex min-h-0 flex-1 flex-col gap-2 px-4 py-4">
        <p className="text-sm text-[#9ca3af]">
          Click a card to open its whiteboard, sketch your scene, add a prompt, and
          generate. Drag cards to reorder.
        </p>
        <CardTimeline />
      </main>

      <TimelineExportBar />
    </div>
  );
}
