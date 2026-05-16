import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-auth";
import { getProject, updateProject } from "@/lib/local-store";
import { falSubscribeImage, buildPrompt, projectStyleConfig } from "@/lib/fal";
import { falDepthMap } from "@/lib/fal-media";
import { fal } from "@fal-ai/client";

if (process.env.FAL_KEY) {
  fal.config({ credentials: process.env.FAL_KEY });
}

type RouteContext = { params: Promise<{ id: string }> };

interface PinRef {
  label: string;
  canvas_x: number;
  canvas_y: number;
}

export async function POST(request: Request, context: RouteContext) {
  const { id: projectId } = await context.params;
  try {
    const body = (await request.json()) as {
      sketch_description?: string;
      /** Base64 data URL (data:image/png;base64,...) of the exported canvas */
      sketch_dataurl?: string;
      /** Pin references to embed positional hints in the prompt */
      pins?: PinRef[];
      /** Canvas viewport dimensions for normalising pin positions */
      canvas_width?: number;
      canvas_height?: number;
    };

    const project = await getProject(projectId);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const styleConfig = projectStyleConfig(project);

    // Build a spatial description of each pin so fal knows where to place landmarks
    const pinLines: string[] = (body.pins ?? []).map((pin) => {
      const cw = body.canvas_width ?? 1280;
      const ch = body.canvas_height ?? 720;
      const xPct = pin.canvas_x / cw;
      const yPct = pin.canvas_y / ch;
      const hPos = xPct < 0.33 ? "left" : xPct > 0.67 ? "right" : "center";
      const vPos = yPct < 0.33 ? "top" : yPct > 0.67 ? "bottom" : "middle";
      return `"${pin.label}" landmark in the ${vPos}-${hPos}`;
    });

    const locationHint = pinLines.length
      ? `Landmark locations: ${pinLines.join(", ")}.`
      : "";

    const baseDescription =
      body.sketch_description ??
      "Transform this sketch into a cinematic environment backdrop";

    const prompt = buildPrompt({
      styleConfig,
      description: `${baseDescription}. ${locationHint}`.trim(),
    });

    // Upload the sketch canvas image to fal.ai storage so it can be used as img2img reference
    let sketchCdnUrl: string | undefined;
    if (body.sketch_dataurl && process.env.FAL_KEY) {
      try {
        const base64 = body.sketch_dataurl.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(base64, "base64");
        const blob = new Blob([buffer], { type: "image/png" });
        sketchCdnUrl = await fal.storage.upload(blob);
      } catch (err) {
        console.warn("Sketch upload to fal storage failed, falling back to text-to-image", err);
      }
    }

    const [imageUrl, depthPreviewUrl] = await Promise.all([
      falSubscribeImage({
        prompt,
        // Use the sketch as img2img reference when available
        model: sketchCdnUrl ? "fal-ai/flux/dev/image-to-image" : "fal-ai/flux/dev",
        imageUrl: sketchCdnUrl,
        width: 1280,
        height: 720,
      }),
      sketchCdnUrl ? falDepthMap(sketchCdnUrl) : Promise.resolve(null),
    ]);

    const canvasState = {
      ...(typeof project.canvas_state === "object" && project.canvas_state !== null
        ? project.canvas_state
        : {}),
      scenery_preview_url: imageUrl ?? null,
      depth_preview_url: depthPreviewUrl,
      last_synthesis_at: new Date().toISOString(),
    };

    await updateProject(projectId, { canvas_state: canvasState });

    return NextResponse.json({
      image_url: imageUrl ?? null,
      depth_preview_url: depthPreviewUrl,
    });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Unknown error");
  }
}
