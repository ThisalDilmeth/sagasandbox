import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-auth";
import { getProject, updateProject } from "@/lib/local-store";
import { falSubscribeImage, projectStyleConfig } from "@/lib/fal";
import { falDepthMap } from "@/lib/fal-media";
import { fal } from "@fal-ai/client";

if (process.env.FAL_KEY) {
  fal.config({ credentials: process.env.FAL_KEY });
}

type RouteContext = { params: Promise<{ id: string }> };

interface PinRef {
  label: string;
  description?: string | null;
  canvas_x: number;
  canvas_y: number;
}

function spatialPosition(
  x: number,
  y: number,
  cw: number,
  ch: number,
): string {
  const xPct = x / cw;
  const yPct = y / ch;
  const h = xPct < 0.33 ? "left" : xPct > 0.67 ? "right" : "center";
  const v = yPct < 0.33 ? "top" : yPct > 0.67 ? "bottom" : "middle";
  if (v === "middle" && h === "center") return "center";
  if (v === "middle") return h;
  if (h === "center") return v;
  return `${v}-${h}`;
}

export async function POST(request: Request, context: RouteContext) {
  const { id: projectId } = await context.params;
  try {
    const body = (await request.json()) as {
      sketch_dataurl?: string;
      pins?: PinRef[];
      canvas_width?: number;
      canvas_height?: number;
    };

    const project = await getProject(projectId);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const styleConfig = projectStyleConfig(project);
    const cw = body.canvas_width ?? 1280;
    const ch = body.canvas_height ?? 720;

    // ── Build the scene prompt from pin content ──────────────────────────────
    // Each pin contributes what it IS (label + description) and WHERE it sits.
    // The goal is a single vivid image that looks like the project's world.
    const aesthetic = [
      styleConfig.aesthetic_style,
      styleConfig.aesthetic,
      styleConfig.theme ? `${styleConfig.theme} world` : null,
      styleConfig.tone,
    ]
      .filter(Boolean)
      .join(", ");

    const pins = body.pins ?? [];

    let sceneDesc: string;

    if (pins.length === 0) {
      sceneDesc =
        "A sweeping cinematic landscape backdrop with dramatic lighting, " +
        "rich environmental detail, high production value";
    } else {
      // Describe each location as a real visual element placed in the scene
      const locationDescs = pins.map((pin) => {
        const pos = spatialPosition(pin.canvas_x, pin.canvas_y, cw, ch);
        const detail = pin.description?.trim()
          ? `${pin.label} — ${pin.description}`
          : pin.label;
        return `in the ${pos}: ${detail}`;
      });

      sceneDesc =
        `A single cohesive cinematic scene showing the following locations: ` +
        locationDescs.join("; ") +
        `. Each location rendered as a distinct recognisable landmark visible in the image, ` +
        `dramatic lighting, high production value, photorealistic detail`;
    }

    const prompt =
      `${aesthetic}. ${sceneDesc}. ` +
      `The image should feel like an establishing shot from a ${styleConfig.theme ?? "fantasy"} world, ` +
      `with every named location clearly visible in its stated position.`;

    // ── Upload sketch to fal storage for img2img ─────────────────────────────
    let sketchCdnUrl: string | undefined;
    if (body.sketch_dataurl && process.env.FAL_KEY) {
      try {
        const base64 = body.sketch_dataurl.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(base64, "base64");
        const blob = new Blob([buffer], { type: "image/png" });
        sketchCdnUrl = await fal.storage.upload(blob);
      } catch (err) {
        console.warn("Sketch upload failed, using text-to-image fallback", err);
      }
    }

    const [imageUrl, depthPreviewUrl] = await Promise.all([
      falSubscribeImage({
        prompt,
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
