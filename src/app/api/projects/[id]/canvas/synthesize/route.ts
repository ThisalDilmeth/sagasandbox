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

  // Horizontal thirds
  const h =
    xPct < 0.20 ? "the far-left edge" :
    xPct < 0.40 ? "the left third" :
    xPct < 0.60 ? "the horizontal center" :
    xPct < 0.80 ? "the right third" :
                  "the far-right edge";

  // Vertical thirds
  const v =
    yPct < 0.20 ? "the top edge" :
    yPct < 0.40 ? "the upper third" :
    yPct < 0.60 ? "the vertical middle" :
    yPct < 0.80 ? "the lower third" :
                  "the bottom foreground";

  const hCenter = h === "the horizontal center";
  const vCenter = v === "the vertical middle";
  if (hCenter && vCenter) return "the center of the image";
  if (hCenter) return v;
  if (vCenter) return h;
  return `${v}, ${h}`;
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
      // Multiple pins — give each landmark a numbered "inventory" entry.
      // Flux respects numbered lists far better than bullet blobs and is less
      // likely to skip a subject when the count and a closing checklist agree.
      const count = pins.length;
      const ordinals = ["ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT"];
      const countWord = ordinals[count - 1] ?? String(count);

      const entries = pins.map((pin, i) => {
        const subject = locationSubject(pin.label, pin.description);
        const pos = spatialPhrase(pin.canvas_x, pin.canvas_y, cw, ch);
        // Give each landmark a clean visual description and explicit placement
        return `Landmark ${i + 1}: ${subject.toUpperCase()} — ${pos}.`;
      });

      // Short closing checklist repeats subjects so the model "confirms" each
      const checklist = pins
        .map((pin, i) => `${i + 1}) ${pin.label.toUpperCase()} ✓`)
        .join("  ");

      sceneBody =
        `A single ultra-wide panoramic ${genreWord} establishing shot containing ` +
        `EXACTLY ${countWord} (${count}) clearly distinct landmarks. ` +
        `Every landmark listed below MUST appear in the final image — do not omit any:\n` +
        entries.join("\n") + "\n" +
        `All ${count} landmarks occupy their stated positions and are simultaneously ` +
        `visible in one wide frame. Each landmark has a completely unique silhouette, ` +
        `material palette, and lighting so none can be confused with another. ` +
        `Composition checklist — all must be present: ${checklist}. ` +
        `Dramatic ${genreWord} sky, volumetric atmosphere, matte-painting quality.`;
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
