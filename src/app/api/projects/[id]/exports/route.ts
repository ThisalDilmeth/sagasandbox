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
          const selected = allEvents.filter((e) => body.event_ids.includes(e.id));

          const styleConfig = projectStyleConfig(project);
          const stylePrefix = `${styleConfig.aesthetic_style ?? ""} ${styleConfig.theme ?? ""}`.trim();

          // Build a sequential narrative prompt from selected events
          const sceneDescriptions = selected
            .map(
              (e, i) =>
                `Scene ${i + 1}: ${e.description ?? e.title}`,
            )
            .join(". ");

          const prompt = `${stylePrefix}. Cinematic animated sequence. ${sceneDescriptions}. Smooth transitions between scenes.`;

          // Use the first event's image as a visual anchor if available
          const firstImageUrl = selected.find((e) => e.generated_image_url)
            ?.generated_image_url ?? undefined;

          const videoUrl = await falSubscribeVideo({
            prompt,
            imageUrl: firstImageUrl,
          });

          await updateExport(projectId, exportRow.id, {
            status: videoUrl ? "done" : "error",
            output_url: videoUrl ?? null,
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
