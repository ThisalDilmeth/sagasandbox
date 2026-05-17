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

/** Constructs a vivid visual subject line from label + description. */
function locationSubject(label: string, description?: string | null): string {
  const base = label.trim();
  const detail = description?.trim();
  if (!detail) return base;
  if (detail.toLowerCase().startsWith(base.toLowerCase())) return detail;
  return `${base} (${detail})`;
}

/**
 * Map a screen-space X percentage to a concrete directional word.
 * Used in the text prompt as a secondary reinforcement of the layout image.
 */
function xWord(xPct: number) {
  if (xPct < 0.18) return "far-left";
  if (xPct < 0.38) return "left";
  if (xPct < 0.62) return "center";
  if (xPct < 0.82) return "right";
  return "far-right";
}

export async function POST(request: Request, context: RouteContext) {
  const { id: projectId } = await context.params;
  try {
    const body = (await request.json()) as {
      pins?: PinRef[];
      canvas_width?: number;
      canvas_height?: number;
      /** Previously generated scene — used as anchor for re-synthesis. */
      existing_image_url?: string;
      /**
       * Spatial layout sketch generated on the client.
       * A JPEG data URL (data:image/jpeg;base64,...) with one coloured blob per
       * pin at its exact screen position on a neutral grey background.
       * Using this as the img2img seed gives Flux a reliable visual layout
       * map — far more accurate than text position hints alone.
       */
      layout_dataurl?: string;
    };

    const project = await getProject(projectId);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const styleConfig = projectStyleConfig(project);
    const cw = body.canvas_width ?? 1280;
    const ch = body.canvas_height ?? 720;

    // ── Style clause ─────────────────────────────────────────────────────────
    const styleParts: string[] = [];
    if (styleConfig.aesthetic_style) styleParts.push(styleConfig.aesthetic_style);
    if (styleConfig.aesthetic && styleConfig.aesthetic !== styleConfig.aesthetic_style)
      styleParts.push(styleConfig.aesthetic);
    if (styleConfig.theme) styleParts.push(styleConfig.theme.replace(/_/g, " "));
    if (styleConfig.tone) styleParts.push(styleConfig.tone);
    const styleClause = styleParts.length ? styleParts.join(", ") : "cinematic photorealistic";
    const genreWord   = styleConfig.theme?.replace(/_/g, " ") ?? "realistic";

    // ── Build prompt ─────────────────────────────────────────────────────────
    const pins = body.pins ?? [];

    let sceneBody: string;

    if (pins.length === 0) {
      sceneBody =
        `A sweeping ${genreWord} landscape — wide-angle establishing shot. ` +
        `Dramatic atmospheric lighting, volumetric fog, rich environmental detail. ` +
        `Matte-painting quality.`;
    } else {
      // ── Subject list ordered left-to-right, then top-to-bottom ──────────
      // Sorting by X (then Y) means the text reads like a natural spatial scan
      // which matches how diffusion models interpret left-to-right descriptions.
      const sorted = [...pins].sort((a, b) =>
        a.canvas_x !== b.canvas_x ? a.canvas_x - b.canvas_x : a.canvas_y - b.canvas_y,
      );

      const entries = sorted.map((pin) => {
        const subject = locationSubject(pin.label, pin.description);
        const xPct    = pin.canvas_x / cw;
        const yPct    = pin.canvas_y / ch;
        const xDesc   = xWord(xPct);
        const yDesc   =
          yPct < 0.22 ? "in the sky / upper background" :
          yPct < 0.42 ? "in the upper midground" :
          yPct < 0.58 ? "in the center of the frame" :
          yPct < 0.78 ? "in the lower midground" :
                        "in the foreground / ground level";
        return `• ${subject} — ${xDesc} of the frame, ${yDesc}`;
      });

      // Flat checklist so none are forgotten
      const checklist = pins.map((p) => p.label.toUpperCase()).join(" | ");

      const hasLayout = Boolean(body.layout_dataurl) && !body.existing_image_url;

      if (hasLayout) {
        // ── Layout-guided generation ────────────────────────────────────────
        // The client sent a spatial sketch: coloured blobs on grey, one per
        // pin. We use this as the img2img start frame so Flux follows the
        // visual layout. The prompt describes WHAT to render at each blob.
        sceneBody =
          `Replace each coloured region in this position guide with the ` +
          `corresponding real-world subject listed below. ` +
          `Preserve the exact spatial layout of the guide — each subject MUST ` +
          `appear at the same location as its coloured blob.\n\n` +
          `Subjects (left → right order):\n` +
          entries.join("\n") + "\n\n" +
          `Complete subject inventory (ALL must be present): ${checklist}.\n` +
          `Wide-angle composition, all subjects simultaneously visible. ` +
          `${genreWord} atmosphere, dramatic lighting, no text overlays.`;
      } else if (body.existing_image_url) {
        // ── Re-synthesis: integrate new subjects without moving existing ones ──
        sceneBody =
          `Evolve this existing scene. Keep all currently rendered subjects ` +
          `exactly where they are. Add any missing subjects from the list below ` +
          `into the composition at the indicated positions.\n\n` +
          `Full subject inventory:\n` +
          entries.join("\n") + "\n\n" +
          `ALL of the following must be clearly visible: ${checklist}. ` +
          `Maintain the existing lighting, atmosphere and style.`;
      } else {
        // ── Pure text-to-image (no anchor available) ───────────────────────
        sceneBody =
          `A single wide-angle ${genreWord} establishing shot containing ` +
          `exactly ${pins.length} distinct subject${pins.length > 1 ? "s" : ""}. ` +
          `Compose them from left to right in this order:\n` +
          entries.join("\n") + "\n\n" +
          `All ${pins.length} subject${pins.length > 1 ? "s" : ""} (${checklist}) ` +
          `must be clearly recognisable. Ultra-wide frame, dramatic ${genreWord} sky.`;
      }
    }

    const prompt =
      `${styleClause}. ${sceneBody} ` +
      `Masterpiece-quality environment art, 8K ultra-detailed, rich colour grading, ` +
      `no people, no text, no UI.`;

    // ── Determine img2img anchor ─────────────────────────────────────────────
    // Priority order:
    //   1. Re-synthesis: existing rendered image (preserves current layout)
    //   2. First generation: layout sketch (gives Flux a spatial position map)
    //   3. No anchor: pure text-to-image
    let anchorCdnUrl: string | undefined;
    let anchorStrength = 0.65;

    if (body.existing_image_url && process.env.FAL_KEY) {
      try {
        const resp = await fetch(body.existing_image_url);
        if (resp.ok) {
          const buffer = await resp.arrayBuffer();
          anchorCdnUrl   = await fal.storage.upload(new Blob([buffer], { type: "image/png" }));
          anchorStrength = 0.55; // enough creative budget to add new subjects
        }
      } catch (err) {
        console.warn("Existing image upload failed — falling back", err);
      }
    } else if (body.layout_dataurl && process.env.FAL_KEY) {
      try {
        // Data URL format: "data:image/jpeg;base64,<b64>"
        const comma    = body.layout_dataurl.indexOf(",");
        const base64   = body.layout_dataurl.slice(comma + 1);
        const buffer   = Buffer.from(base64, "base64");
        anchorCdnUrl   = await fal.storage.upload(new Blob([buffer], { type: "image/jpeg" }));
        // 0.80 strength: strong enough to fully generate the real scene,
        // but the model still uses the spatial skeleton from the sketch.
        anchorStrength = 0.80;
      } catch (err) {
        console.warn("Layout sketch upload failed — falling back to t2i", err);
      }
    }

    const imageUrl = await falSubscribeImage({
      prompt,
      model: anchorCdnUrl ? "fal-ai/flux/dev/image-to-image" : "fal-ai/flux/dev",
      imageUrl: anchorCdnUrl,
      strength: anchorStrength,
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
