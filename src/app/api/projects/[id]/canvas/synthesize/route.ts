import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-auth";
import { getProject, updateProject } from "@/lib/local-store";
import { falSubscribeImage, projectStyleConfig } from "@/lib/fal";
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

/**
 * Returns a concise spatial descriptor for a canvas (x,y) coordinate.
 * Uses thirds so Flux can map phrases to image regions reliably.
 */
function spatialPhrase(x: number, y: number, cw: number, ch: number): string {
  const xPct = x / cw;
  const yPct = y / ch;

  const col =
    xPct < 0.15 ? "far-left edge" :
    xPct < 0.38 ? "left third" :
    xPct < 0.62 ? "center" :
    xPct < 0.85 ? "right third" :
                  "far-right edge";

  const row =
    yPct < 0.15 ? "top edge" :
    yPct < 0.38 ? "upper third" :
    yPct < 0.62 ? "middle" :
    yPct < 0.85 ? "lower third" :
                  "bottom foreground";

  if (col === "center" && row === "middle") return "the center";
  if (col === "center") return `the ${row}`;
  if (row === "middle") return `the ${col}`;
  return `the ${row}, ${col}`;
}

/** Constructs a vivid visual subject line from label + description. */
function locationSubject(label: string, description?: string | null): string {
  const base = label.trim();
  const detail = description?.trim();
  if (!detail) return base;
  // Avoid duplicating the label if description starts with it
  if (detail.toLowerCase().startsWith(base.toLowerCase())) return detail;
  return `${base}: ${detail}`;
}

export async function POST(request: Request, context: RouteContext) {
  const { id: projectId } = await context.params;
  try {
    const body = (await request.json()) as {
      pins?: PinRef[];
      canvas_width?: number;
      canvas_height?: number;
      /** URL of the previously generated scenery. When present we use img2img
       *  at low strength so existing landmark positions are preserved. */
      existing_image_url?: string;
    };

    const project = await getProject(projectId);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const styleConfig = projectStyleConfig(project);
    const cw = body.canvas_width ?? 1280;
    const ch = body.canvas_height ?? 720;

    // ── Style clause ──────────────────────────────────────────────────────────
    const styleParts: string[] = [];
    if (styleConfig.aesthetic_style) styleParts.push(styleConfig.aesthetic_style);
    if (styleConfig.aesthetic && styleConfig.aesthetic !== styleConfig.aesthetic_style)
      styleParts.push(styleConfig.aesthetic);
    if (styleConfig.theme) styleParts.push(styleConfig.theme.replace(/_/g, " "));
    if (styleConfig.tone) styleParts.push(styleConfig.tone);
    const styleClause = styleParts.length ? styleParts.join(", ") : "cinematic fantasy";
    const genreWord = styleConfig.theme?.replace(/_/g, " ") ?? "fantasy";

    // ── Build prompt ──────────────────────────────────────────────────────────
    const pins = body.pins ?? [];
    const ordinals = ["ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT"];
    const countWord = ordinals[(pins.length || 1) - 1] ?? String(pins.length);

    let sceneBody: string;

    if (pins.length === 0) {
      sceneBody =
        `A sweeping ${genreWord} landscape — wide-angle establishing shot. ` +
        `Dramatic atmospheric lighting, volumetric fog, rich environmental detail ` +
        `from foreground rocks to the distant horizon. Matte-painting quality.`;
    } else {
      // Number each landmark with subject + exact position.
      // The numbered format gives each subject equal model attention;
      // the closing checklist reinforces recall so none are dropped.
      const entries = pins.map((pin, i) => {
        const subject = locationSubject(pin.label, pin.description);
        const pos = spatialPhrase(pin.canvas_x, pin.canvas_y, cw, ch);
        return `Landmark ${i + 1}: ${subject} — located at ${pos} of the image.`;
      });

      const checklist = pins
        .map((pin, i) => `${i + 1}. ${pin.label.toUpperCase()}`)
        .join("  |  ");

      const useAnchor = Boolean(body.existing_image_url);

      sceneBody =
        (useAnchor
          // When anchoring off existing image: focus instruction on preserving
          // existing elements and incorporating the updated landmark list.
          ? `Keep all existing landmarks in their current positions. ` +
            `Update and integrate the following COMPLETE landmark list into the scene:\n`
          : `A single ultra-wide panoramic ${genreWord} establishing shot ` +
            `containing EXACTLY ${countWord} (${pins.length}) clearly distinct landmarks:\n`
        ) +
        entries.join("\n") + "\n" +
        `Every landmark listed above MUST be clearly visible and recognisable ` +
        `in its stated position. Do not omit or merge any landmark. ` +
        `Composition checklist — all ${pins.length} must be present: ${checklist}. ` +
        `Ultra-wide frame so all landmarks fit simultaneously. ` +
        `Each landmark has a unique silhouette and lighting character. ` +
        `Dramatic ${genreWord} sky, volumetric atmosphere, depth haze, ` +
        `matte-painting quality, no figures, no text.`;
    }

    const prompt =
      `${styleClause}. ${sceneBody} ` +
      `Masterpiece-quality environment concept art, 8K ultra-detailed, ` +
      `rich colour grading — pure cinematic world backdrop.`;

    // ── Upload existing scenery as img2img anchor if provided ─────────────────
    // Low strength (0.35) means the existing layout is ~65% preserved, so
    // positions of already-rendered landmarks don't drift when new ones are added.
    let anchorCdnUrl: string | undefined;
    if (body.existing_image_url && process.env.FAL_KEY) {
      try {
        const resp = await fetch(body.existing_image_url);
        if (resp.ok) {
          const buffer = await resp.arrayBuffer();
          const blob = new Blob([buffer], { type: "image/png" });
          anchorCdnUrl = await fal.storage.upload(blob);
        }
      } catch (err) {
        console.warn("Anchor image upload failed, falling back to t2i", err);
      }
    }

    const imageUrl = await falSubscribeImage({
      prompt,
      model: anchorCdnUrl
        ? "fal-ai/flux/dev/image-to-image"
        : "fal-ai/flux/dev",
      imageUrl: anchorCdnUrl,
      // 0.35 = 65% of the existing layout is preserved; new landmarks integrate
      // without displacing the ones already rendered.
      strength: 0.35,
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
