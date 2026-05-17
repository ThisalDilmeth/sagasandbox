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

/** Constructs a vivid visual subject from label + optional description. */
function subject(label: string, description?: string | null): string {
  const base   = label.trim();
  const detail = description?.trim();
  if (!detail) return base;
  if (detail.toLowerCase().startsWith(base.toLowerCase())) return detail;
  return `${base} (${detail})`;
}

/**
 * Build a compact positional phrase from normalised 0–1 coordinates.
 * Language is modelled after a photographer's scene brief so Flux
 * interprets it reliably.
 */
function posPhrase(xPct: number, yPct: number): string {
  const col =
    xPct < 0.20 ? "far-left edge"  :
    xPct < 0.40 ? "left third"     :
    xPct < 0.60 ? "center"         :
    xPct < 0.80 ? "right third"    :
                  "far-right edge";

  const row =
    yPct < 0.20 ? "upper sky"        :
    yPct < 0.40 ? "upper background" :
    yPct < 0.60 ? "middle distance"  :
    yPct < 0.80 ? "lower midground"  :
                  "foreground";

  return `${col}, ${row}`;
}

export async function POST(request: Request, context: RouteContext) {
  const { id: projectId } = await context.params;
  try {
    const body = (await request.json()) as {
      pins?: PinRef[];
      canvas_width?: number;
      canvas_height?: number;
      /** URL of the previously generated scene — used as img2img anchor
       *  so existing landmarks keep their positions when new ones are added. */
      existing_image_url?: string;
      /** Layout sketch from the client — accepted but NOT used as img2img
       *  anchor. Standard Flux img2img treats abstract colour blobs as
       *  visual content rather than a spatial map, which produces the wrong
       *  result. We keep the field so the client doesn't need to change. */
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
    if (styleConfig.tone)  styleParts.push(styleConfig.tone);
    const styleClause = styleParts.length ? styleParts.join(", ") : "cinematic photorealistic";
    const genreWord   = styleConfig.theme?.replace(/_/g, " ") ?? "realistic";

    // ── Build prompt ─────────────────────────────────────────────────────────
    const pins = body.pins ?? [];
    const hasLayout   = !!body.layout_dataurl && !body.existing_image_url;

    let sceneBody: string;

    if (pins.length === 0) {
      sceneBody =
        `A sweeping ${genreWord} landscape — wide-angle establishing shot. ` +
        `Dramatic atmospheric lighting, volumetric fog, rich environmental detail. ` +
        `Matte-painting quality.`;
    } else if (hasLayout) {
      // The client sent a semantic scene sketch (sky/ground background with
      // iconic silhouettes at the correct pin positions). We use it as an
      // img2img anchor so Flux follows the spatial layout while the prompt
      // only describes visual style — the sketch already encodes positions.
      const checklist = pins.map(p => p.label.toUpperCase()).join(" · ");
      sceneBody =
        `Transform this rough sketch into a ${genreWord} photorealistic scene. ` +
        `Every silhouette in the sketch must become a fully realised ` +
        `${genreWord} subject in EXACTLY the same screen position. ` +
        `Required subjects (ALL must be visible): ${checklist}. ` +
        `${styleClause} atmosphere, dramatic volumetric lighting, no UI chrome, no text overlays.`;
    } else {
      // Sort pins left→right so the description reads like a natural spatial
      // scan, which matches how Flux was trained on compositional captions.
      const sorted = [...pins].sort((a, b) => a.canvas_x - b.canvas_x);

      // ── Per-pin subject entries ──────────────────────────────────────────
      const entries = sorted.map((pin) => {
        const subj  = subject(pin.label, pin.description);
        const xPct  = pin.canvas_x / cw;
        const yPct  = pin.canvas_y / ch;
        const pos   = posPhrase(xPct, yPct);
        return `  • ${subj}: ${pos}`;
      });

      // ── Section groupings (left / center / right) ────────────────────────
      // Describing the scene in three spatial sections gives Flux a clear
      // compositional blueprint that mirrors how scene descriptions appear
      // in its training data.
      const leftPins   = sorted.filter(p => p.canvas_x / cw < 0.38);
      const centerPins = sorted.filter(p => { const x = p.canvas_x / cw; return x >= 0.38 && x < 0.62; });
      const rightPins  = sorted.filter(p => p.canvas_x / cw >= 0.62);

      const sectionLine = (label: string, arr: PinRef[]) => {
        if (arr.length === 0) return "";
        const names = arr.map(p => subject(p.label, p.description)).join(", ");
        return `${label}: ${names}`;
      };

      const sections = [
        sectionLine("LEFT SIDE",    leftPins),
        sectionLine("CENTER",       centerPins),
        sectionLine("RIGHT SIDE",   rightPins),
      ].filter(Boolean).join(" | ");

      const checklist = pins.map(p => p.label.toUpperCase()).join(" · ");

      if (body.existing_image_url) {
        // ── Re-synthesis ────────────────────────────────────────────────────
        // Keep existing landmarks in place; integrate any that are missing.
        sceneBody =
          `This is an update to an existing scene. Keep every currently ` +
          `rendered element exactly where it is. Integrate any missing ` +
          `subjects listed below without relocating existing ones.\n\n` +
          `FULL SUBJECT LIST (all must be visible):\n` +
          entries.join("\n") + "\n\n" +
          `Spatial layout: ${sections}.\n` +
          `Required subjects: ${checklist}.`;
      } else {
        // ── First generation ─────────────────────────────────────────────────
        // Pure text-to-image. Use a clear compositional brief so Flux
        // places every subject in the correct region of the frame.
        sceneBody =
          `A single wide-angle ${genreWord} photograph. ` +
          `SPATIAL LAYOUT — ${sections}.\n\n` +
          `Detailed placement:\n` +
          entries.join("\n") + "\n\n" +
          `Every subject listed must be clearly visible and placed as ` +
          `described. Required subjects: ${checklist}. ` +
          `Wide-angle frame wide enough to show all subjects simultaneously. ` +
          `Dramatic ${genreWord} atmosphere, volumetric lighting, no people, no text.`;
      }
    }

    const prompt =
      `${styleClause}. ${sceneBody} ` +
      `Masterpiece-quality environment art, 8K ultra-detailed, rich colour grading.`;

    // ── Determine img2img anchor ─────────────────────────────────────────────
    // Priority order:
    //   1. existing_image_url → re-synthesis (keep existing composition)
    //   2. layout_dataurl    → first-generation sketch-to-scene
    // Abstract colour blobs do NOT work here; the semantic scene sketch
    // (sky/ground + object silhouettes) DOES because Flux was trained on
    // rough sketch → photorealistic conversions.
    let anchorCdnUrl: string | undefined;
    let anchorStrength = 0.82; // sketch-to-scene strength

    if (body.existing_image_url && process.env.FAL_KEY) {
      try {
        const resp = await fetch(body.existing_image_url);
        if (resp.ok) {
          const buffer = await resp.arrayBuffer();
          anchorCdnUrl   = await fal.storage.upload(new Blob([buffer], { type: "image/png" }));
          anchorStrength = 0.55; // keep existing composition, integrate new subjects
        }
      } catch (err) {
        console.warn("Existing image upload failed — falling back to t2i", err);
      }
    } else if (body.layout_dataurl && process.env.FAL_KEY) {
      try {
        const comma  = body.layout_dataurl.indexOf(",");
        const base64 = body.layout_dataurl.slice(comma + 1);
        const buffer = Buffer.from(base64, "base64");
        anchorCdnUrl   = await fal.storage.upload(new Blob([buffer], { type: "image/jpeg" }));
        anchorStrength = 0.82; // transform sketch style; spatial structure must be preserved
      } catch (err) {
        console.warn("Layout sketch upload failed — falling back to t2i", err);
      }
    }

    const imageUrl = await falSubscribeImage({
      prompt,
      model:    anchorCdnUrl ? "fal-ai/flux/dev/image-to-image" : "fal-ai/flux/dev",
      imageUrl: anchorCdnUrl,
      strength: anchorStrength,
      width:    1280,
      height:   720,
    });

    const canvasState = {
      ...(typeof project.canvas_state === "object" && project.canvas_state !== null
        ? project.canvas_state
        : {}),
      scenery_preview_url:  imageUrl ?? null,
      last_synthesis_at:    new Date().toISOString(),
    };

    await updateProject(projectId, { canvas_state: canvasState });

    return NextResponse.json({ image_url: imageUrl ?? null });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Unknown error");
  }
}
