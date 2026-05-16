import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-auth";
import { getProject, updateProject } from "@/lib/local-store";
import { falSubscribeImage, projectStyleConfig } from "@/lib/fal";

type RouteContext = { params: Promise<{ id: string }> };

interface PinRef {
  label: string;
  description?: string | null;
  canvas_x: number;
  canvas_y: number;
}

/**
 * Translates a canvas-space (x, y) coordinate into rich spatial language that
 * Flux can honour when composing the scene.
 */
function spatialPhrase(x: number, y: number, cw: number, ch: number): string {
  const xPct = x / cw;
  const yPct = y / ch;

  const h =
    xPct < 0.25
      ? "far left"
      : xPct < 0.42
        ? "left side"
        : xPct < 0.58
          ? "center"
          : xPct < 0.75
            ? "right side"
            : "far right";

  const v =
    yPct < 0.25
      ? "upper"
      : yPct < 0.42
        ? "upper-middle"
        : yPct < 0.58
          ? "middle"
          : yPct < 0.75
            ? "lower-middle"
            : "lower foreground";

  if (v === "middle" && h === "center") return "in the center of the image";
  if (v === "middle") return `on the ${h} of the image`;
  if (h === "center") return `in the ${v} center of the image`;
  return `in the ${v} ${h} of the image`;
}

/**
 * Builds a visual description of a location from its label and optional
 * description text. The result is a concrete visual subject phrase — e.g.
 * "an erupting volcano with flowing lava" — not a UI annotation.
 */
function locationSubject(label: string, description?: string | null): string {
  const base = label.trim();
  if (description?.trim()) {
    return `${base} — ${description.trim()}`;
  }
  return base;
}

export async function POST(request: Request, context: RouteContext) {
  const { id: projectId } = await context.params;
  try {
    const body = (await request.json()) as {
      pins?: PinRef[];
      canvas_width?: number;
      canvas_height?: number;
      // sketch_dataurl intentionally ignored: we generate from text so the
      // output shows what the pins MEAN, not what the UI circles look like.
    };

    const project = await getProject(projectId);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const styleConfig = projectStyleConfig(project);
    const cw = body.canvas_width ?? 1280;
    const ch = body.canvas_height ?? 720;

    // ── Build style clause ────────────────────────────────────────────────────
    const styleParts: string[] = [];
    if (styleConfig.aesthetic_style) styleParts.push(styleConfig.aesthetic_style);
    if (styleConfig.aesthetic && styleConfig.aesthetic !== styleConfig.aesthetic_style)
      styleParts.push(styleConfig.aesthetic);
    if (styleConfig.theme) styleParts.push(styleConfig.theme.replace(/_/g, " "));
    if (styleConfig.tone) styleParts.push(styleConfig.tone);
    const styleClause = styleParts.length ? styleParts.join(", ") : "cinematic fantasy";
    const genreWord = styleConfig.theme?.replace(/_/g, " ") ?? "fantasy";

    // ── Build scene from pin content (label + description = the visual subject) ─
    const pins = body.pins ?? [];

    let sceneBody: string;

    if (pins.length === 0) {
      // No pins — generate a rich establishing shot for the world
      sceneBody =
        `A sweeping ${genreWord} landscape, wide-angle establishing shot. ` +
        `Dramatic atmospheric lighting, volumetric fog, rich environmental detail ` +
        `from foreground to the horizon. Matte-painting quality, highly detailed.`;
    } else if (pins.length === 1) {
      const pin = pins[0];
      const subject = locationSubject(pin.label, pin.description);
      const pos = spatialPhrase(pin.canvas_x, pin.canvas_y, cw, ch);
      sceneBody =
        `A dramatic ${genreWord} landscape scene dominated by ${subject}, ` +
        `prominently placed ${pos}. ` +
        `Wide-angle view showing the full environment surrounding this landmark. ` +
        `Dramatic atmospheric lighting, volumetric haze, richly detailed textures. ` +
        `Cinematic establishing shot.`;
    } else {
      // Multiple pins — compose a panorama where every pin is a distinct visual landmark.
      const landmarkLines = pins
        .map((pin) => {
          const subject = locationSubject(pin.label, pin.description);
          const pos = spatialPhrase(pin.canvas_x, pin.canvas_y, cw, ch);
          return `• ${subject.toUpperCase()} — clearly visible ${pos}`;
        })
        .join("\n");

      sceneBody =
        `A single sweeping ${genreWord} panoramic landscape that contains ALL of ` +
        `the following landmarks simultaneously, each placed exactly where described:\n` +
        landmarkLines + `\n` +
        `Composition: ultra-wide establishing shot so every landmark fits in one frame. ` +
        `Each landmark has a unique silhouette, distinct materials, and its own ` +
        `lighting contribution to the overall scene (e.g. volcanic glow, cave shadow, ` +
        `forest canopy light). ` +
        `The landmarks interact believably — a volcano's ash clouds drift toward ` +
        `distant features, cave shadows pool in the foreground, etc. ` +
        `Dramatic sky, atmospheric depth haze, matte-painting quality.`;
    }

    const prompt =
      `${styleClause}. ${sceneBody} ` +
      `Masterpiece quality, 8K render, hyper-detailed environments, ` +
      `no human figures, no text, no UI markers — pure world backdrop.`;

    // ── Always use text-to-image: Flux generates the world from the prompt ────
    const imageUrl = await falSubscribeImage({
      prompt,
      model: "fal-ai/flux/dev",
      width: 1280,
      height: 720,
    });

    const canvasState = {
      ...(typeof project.canvas_state === "object" && project.canvas_state !== null
        ? project.canvas_state
        : {}),
      scenery_preview_url: imageUrl ?? null,
      last_synthesis_at: new Date().toISOString(),
    };

    await updateProject(projectId, { canvas_state: canvasState });

    return NextResponse.json({ image_url: imageUrl ?? null });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Unknown error");
  }
}
