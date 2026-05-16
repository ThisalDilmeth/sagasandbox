import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-auth";
import {
  getProject,
  listEvents,
  createExport,
  updateExport,
} from "@/lib/local-store";
import { falSubscribeVideo } from "@/lib/fal-media";
import { projectStyleConfig } from "@/lib/fal";
import type { ExportType } from "@/types/app";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const { id: projectId } = await context.params;
  try {
    const body = (await request.json()) as {
      type: ExportType;
      event_ids: string[];
    };

    if (!body.type || !Array.isArray(body.event_ids)) {
      return NextResponse.json(
        { error: "type and event_ids are required" },
        { status: 400 },
      );
    }

    const project = await getProject(projectId);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const exportRow = await createExport(projectId, {
      type: body.type,
      event_ids: body.event_ids,
      status: "queued",
      output_url: null,
    });

    // Run the export asynchronously (non-blocking response)
    void (async () => {
      try {
        await updateExport(projectId, exportRow.id, { status: "processing" });

        if (body.type === "animatic_video") {
          const allEvents = await listEvents(projectId);
          const selected = allEvents
            .filter((e) => body.event_ids.includes(e.id))
            .sort((a, b) => a.sequence_order - b.sequence_order);

          const styleConfig = projectStyleConfig(project);
          const stylePrefix = `${styleConfig.aesthetic_style ?? ""} ${styleConfig.theme ?? ""}`.trim();

          // Generate a short animated video clip for EACH scene card in parallel.
          // Each clip uses the card's generated scene image as the visual anchor
          // and the card's description as the motion prompt.
          const clipResults = await Promise.allSettled(
            selected.map(async (ev) => {
              const motionPrompt = [
                stylePrefix,
                `Cinematic camera motion through a single scene.`,
                ev.scene_keywords ?? ev.description ?? ev.title,
                `Smooth atmospheric movement, no cuts.`,
              ]
                .filter(Boolean)
                .join(" ");

              return falSubscribeVideo({
                prompt: motionPrompt,
                imageUrl: ev.generated_image_url ?? undefined,
              });
            }),
          );

          const videoUrls: string[] = clipResults
            .map((r) => (r.status === "fulfilled" ? r.value : null))
            .filter((u): u is string => typeof u === "string" && u.length > 0);

          // Store all clip URLs as JSON; the first URL is used as the primary
          // download in the current ExportTerminal UI.
          const outputUrl = videoUrls.length
            ? JSON.stringify(videoUrls)
            : null;

          await updateExport(projectId, exportRow.id, {
            status: videoUrls.length > 0 ? "done" : "error",
            output_url: outputUrl,
          });
        } else if (body.type === "storyboard_pdf") {
          // Storyboard: return event data + images as JSON (no external service needed)
          const allEvents = await listEvents(projectId);
          const selected = allEvents.filter((e) => body.event_ids.includes(e.id));
          const storyboardData = JSON.stringify(
            selected.map((e) => ({
              title: e.title,
              description: e.description,
              image_url: e.generated_image_url,
              in_world_time: e.in_world_time,
            })),
            null,
            2,
          );
          // Encode as a data URI for download
          const dataUri = `data:application/json;charset=utf-8,${encodeURIComponent(storyboardData)}`;
          await updateExport(projectId, exportRow.id, {
            status: "done",
            output_url: dataUri,
          });
        } else if (body.type === "audio_script") {
          // Script: combine all event descriptions into a plain-text narrative
          const allEvents = await listEvents(projectId);
          const selected = allEvents.filter((e) => body.event_ids.includes(e.id));
          const script = selected
            .map((e) => `[${e.title}]\n${e.description ?? e.audio_summary ?? ""}`)
            .join("\n\n");
          const dataUri = `data:text/plain;charset=utf-8,${encodeURIComponent(script)}`;
          await updateExport(projectId, exportRow.id, {
            status: "done",
            output_url: dataUri,
          });
        }
      } catch (err) {
        console.error("Export failed", err);
        await updateExport(projectId, exportRow.id, { status: "error" });
      }
    })();

    return NextResponse.json({ export: exportRow }, { status: 201 });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Unknown error");
  }
}
