"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import type { Export, ExportType, TimelineEvent } from "@/types/app";
import { RemoteImage } from "@/components/shared/RemoteImage";
import { cn } from "@/lib/cn";
import {
  PROJECT_API_UNAVAILABLE_MESSAGE,
  readApiError,
} from "@/lib/project-api";
import { toastError } from "@/store/toast-store";

interface ExportTerminalProps {
  projectId: string;
  events: TimelineEvent[];
  apiAvailable?: boolean;
  onExportUpdate?: (exp: Export) => void;
  liveExport?: Export | null;
  realtimeActive?: boolean;
}

const EXPORT_TYPES: { id: ExportType; label: string }[] = [
  { id: "storyboard_pdf", label: "Storyboard bundle (JSON)" },
  { id: "audio_script", label: "Narration audio (Kokoro)" },
  { id: "animatic_video", label: "Animatic video (Luma)" },
];

/** `audio_script` exports store a JSON array of URLs in `output_url`. */
function resolveExportDownloadUrl(
  type: ExportType,
  outputUrl: string | null | undefined,
  signedUrl?: string | null,
): string | null {
  if (signedUrl) return signedUrl;
  if (!outputUrl) return null;
  if (type === "audio_script") {
    try {
      const parsed = JSON.parse(outputUrl) as unknown;
      if (Array.isArray(parsed) && typeof parsed[0] === "string") {
        return parsed[0];
      }
    } catch {
      // fall through — output_url may already be a single URL
    }
  }
  return outputUrl;
}

/** Parse `output_url` for `animatic_video` — may be a JSON array of clip URLs. */
function parseVideoClips(outputUrl: string | null | undefined): string[] {
  if (!outputUrl) return [];
  try {
    const parsed = JSON.parse(outputUrl) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter((u): u is string => typeof u === "string");
    }
  } catch {
    // single URL stored directly
  }
  return typeof outputUrl === "string" ? [outputUrl] : [];
}

function progressWidth(status: Export["status"] | null) {
  switch (status) {
    case "queued":
      return "10%";
    case "processing":
      return "50%";
    case "done":
      return "100%";
    default:
      return "0%";
  }
}

export function ExportTerminal({
  projectId,
  events,
  apiAvailable = true,
  onExportUpdate,
  liveExport = null,
  realtimeActive = false,
}: ExportTerminalProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [exportType, setExportType] = useState<ExportType>("storyboard_pdf");
  const [currentExportId, setCurrentExportId] = useState<string | null>(null);
  const [exportStatus, setExportStatus] = useState<Export["status"] | null>(
    null,
  );
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [videoClips, setVideoClips] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function toggleEvent(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function startExport() {
    if (!apiAvailable) {
      setError(PROJECT_API_UNAVAILABLE_MESSAGE);
      return;
    }
    if (selected.size === 0) {
      setError("Select at least one event");
      return;
    }
    setSubmitting(true);
    setError(null);
    setDownloadUrl(null);
    setVideoClips([]);
    setExportStatus(null);
    setCurrentExportId(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/exports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: exportType,
          event_ids: Array.from(selected),
        }),
      });
      if (!res.ok) {
        throw new Error(await readApiError(res, "Export failed to start"));
      }
      const { export: exp } = (await res.json()) as { export: Export };
      setCurrentExportId(exp.id);
      setExportStatus(exp.status);
      onExportUpdate?.(exp);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Export failed";
      setError(message);
      toastError(message);
    } finally {
      setSubmitting(false);
    }
  }

  const realtimeExport =
    liveExport && currentExportId && liveExport.id === currentExportId
      ? liveExport
      : null;
  const displayStatus = realtimeExport?.status ?? exportStatus;
  const displayDownloadUrl =
    realtimeExport?.status === "done"
      ? resolveExportDownloadUrl(exportType, realtimeExport.output_url, null)
      : downloadUrl;
  const displayVideoClips =
    exportType === "animatic_video" && displayStatus === "done"
      ? (realtimeExport?.status === "done"
          ? parseVideoClips(realtimeExport.output_url)
          : videoClips)
      : [];
  const displayError =
    realtimeExport?.status === "error" ? "Export failed" : error;

  useEffect(() => {
    if (!currentExportId) return;
    if (
      realtimeExport?.status === "done" ||
      realtimeExport?.status === "error"
    ) {
      return;
    }

    const pollMs = realtimeActive ? 5000 : 2000;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(
          `/api/projects/${projectId}/exports/${currentExportId}`,
        );
        if (!res.ok) return;
        const data = (await res.json()) as {
          export: Export;
          signed_url?: string;
        };
        setExportStatus(data.export.status);
        onExportUpdate?.(data.export);
        if (data.export.status === "done") {
          const resolved = resolveExportDownloadUrl(
            exportType,
            data.export.output_url,
            data.signed_url,
          );
          setDownloadUrl(resolved);
          if (exportType === "animatic_video") {
            setVideoClips(parseVideoClips(data.export.output_url));
          }
          clearInterval(interval);
        }
        if (data.export.status === "error") {
          setError("Export failed");
          clearInterval(interval);
        }
      } catch {
        // ignore poll errors
      }
    }, pollMs);

    return () => clearInterval(interval);
  }, [
    currentExportId,
    projectId,
    exportType,
    onExportUpdate,
    realtimeActive,
    realtimeExport?.status,
  ]);

  return (
    <div className="space-y-4 p-1">
      <h3 className="text-sm font-semibold text-white">Export Terminal</h3>

      {!apiAvailable ? (
        <p className="text-xs text-[#9ca3af]">{PROJECT_API_UNAVAILABLE_MESSAGE}</p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {EXPORT_TYPES.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setExportType(t.id)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium",
              exportType === t.id
                ? "border-[#7c3aed] bg-[#7c3aed]/20 text-white"
                : "border-[#2a2a2e] text-[#9ca3af]",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <ul className="max-h-48 space-y-2 overflow-y-auto">
        {events.map((ev) => (
          <li key={ev.id}>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-[#2a2a2e] p-2 hover:bg-[#252528]">
              <input
                type="checkbox"
                checked={selected.has(ev.id)}
                onChange={() => toggleEvent(ev.id)}
                className="accent-[#7c3aed]"
              />
              {ev.generated_image_url ? (
                <RemoteImage
                  src={ev.generated_image_url}
                  alt=""
                  width={56}
                  height={40}
                  className="h-10 w-14 rounded object-cover"
                />
              ) : (
                <div className="h-10 w-14 rounded bg-[#252528]" />
              )}
              <span className="truncate text-xs text-white">{ev.title}</span>
            </label>
          </li>
        ))}
      </ul>

      {displayStatus ? (
        <div>
          <div className="mb-1 flex justify-between text-[10px] text-[#9ca3af]">
            <span>Status: {displayStatus}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-[#252528]">
            <div
              className="h-full bg-[#7c3aed] transition-all duration-500"
              style={{ width: progressWidth(displayStatus) }}
            />
          </div>
        </div>
      ) : null}

      {displayError ? (
        <p className="text-xs text-[#ef4444]">{displayError}</p>
      ) : null}

      <div className="flex flex-col gap-2">
        <button
          type="button"
          disabled={submitting || selected.size === 0 || !apiAvailable}
          onClick={startExport}
          className="rounded-lg bg-[#7c3aed] py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {submitting ? "Starting…" : "Start export"}
        </button>

        {/* ── Video clips (animatic_video) ──────────────────────────────── */}
        {displayVideoClips.length > 0 ? (
          <div className="space-y-2">
            <p className="text-[10px] font-medium uppercase tracking-wide text-[#9ca3af]">
              {displayVideoClips.length} scene clip
              {displayVideoClips.length > 1 ? "s" : ""} generated
            </p>
            {displayVideoClips.map((url, i) => (
              <div key={url} className="rounded-lg border border-[#2a2a2e] overflow-hidden">
                <p className="px-2 py-1 text-[10px] text-[#9ca3af]">
                  Scene {i + 1}
                </p>
                {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                <video
                  src={url}
                  controls
                  className="w-full"
                  style={{ maxHeight: "140px" }}
                />
                <a
                  href={url}
                  download={`scene-${i + 1}.mp4`}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-[#9ca3af] hover:text-white"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download clip
                </a>
              </div>
            ))}
          </div>
        ) : displayStatus === "done" && displayDownloadUrl ? (
          <a
            href={displayDownloadUrl}
            download
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#2a2a2e] py-2 text-sm text-white hover:border-[#7c3aed]"
          >
            <Download className="h-4 w-4" />
            Download
          </a>
        ) : null}
      </div>
    </div>
  );
}
