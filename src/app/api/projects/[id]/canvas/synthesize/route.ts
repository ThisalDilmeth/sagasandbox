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

    // ── Derive a rich style clause from the project configuration ─────────────
    const styleParts: string[] = [];
    if (styleConfig.aesthetic_style) styleParts.push(styleConfig.aesthetic_style);
    if (styleConfig.aesthetic && styleConfig.aesthetic !== styleConfig.aesthetic_style)
      styleParts.push(styleConfig.aesthetic);
    if (styleConfig.theme) styleParts.push(`${styleConfig.theme.replace(/_/g, " ")} setting`);
    if (styleConfig.tone) styleParts.push(styleConfig.tone);
    const styleClause = styleParts.length ? styleParts.join(", ") : "cinematic fantasy";
    const genreWord = styleConfig.theme?.replace(/_/g, " ") ?? "cinematic";

    // ── Build location descriptions from pin content and spatial position ─────
    const pins = body.pins ?? [];

    let sceneDesc: string;

    if (pins.length === 0) {
      sceneDesc =
        "sweeping wide-angle establishing shot, dramatic atmospheric lighting, " +
        "rich foreground-to-horizon environmental depth, volumetric fog or haze, " +
        "highly detailed architecture and landscape, matte-painting quality";
    } else {
      const locationDescs = pins.map((pin) => {
        const pos = spatialPosition(pin.canvas_x, pin.canvas_y, cw, ch);
        const xPct = Math.round((pin.canvas_x / cw) * 100);
        const yPct = Math.round((pin.canvas_y / ch) * 100);
        const detail = pin.description?.trim()
          ? `${pin.label} (${pin.description.trim()})`
          : pin.label;
        return `[${pos} — ${xPct}% across, ${yPct}% down] ${detail}`;
      });

      sceneDesc =
        `A single vast panoramic ${genreWord} landscape with ALL of the following clearly visible landmarks ` +
        `rendered at their indicated positions: ${locationDescs.join(" | ")}. ` +
        `Composition rule: ultra-wide establishing shot so every landmark fits in frame simultaneously. ` +
        `Each landmark is a distinct, recognisable architectural or geographic feature with unique ` +
        `silhouette and lighting. ` +
        `Dramatic volumetric lighting, atmospheric depth haze, highly detailed textures on every surface. ` +
        `Golden-hour or moonlit sky casting long shadows that reinforce the ${genreWord} mood.`;
    }

    const prompt =
      `${styleClause}. ${sceneDesc}. ` +
      `Masterpiece-quality environment art, 8K ultra-detailed, rich colour grading, ` +
      `no people in frame, no text overlays, no UI elements — pure cinematic world backdrop.`;

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
