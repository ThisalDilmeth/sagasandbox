import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-auth";
import { getProject, getEvent, updateEvent } from "@/lib/local-store";
import { falSubscribeImage, projectStyleConfig } from "@/lib/fal";

type RouteContext = { params: Promise<{ id: string; evId: string }> };

/**
 * POST /api/projects/:id/events/:evId/scene
 *
 * Generates a scene image for a single timeline card.
 * Unlike the shared geography canvas synthesis, this generates a fully
 * self-contained cinematic frame for a specific narrative moment.
 *
 * Body: { scene_keywords: string }
 *   scene_keywords — comma-separated or freeform description of what should
 *   appear in this scene, e.g. "erupting volcano, hero running, dark cave".
 */
export async function POST(request: Request, context: RouteContext) {
  const { id: projectId, evId } = await context.params;
  try {
    const body = (await request.json()) as { scene_keywords?: string };
    const scene_keywords = (body.scene_keywords ?? "").trim();

    const [project, event] = await Promise.all([
      getProject(projectId),
      getEvent(projectId, evId),
    ]);
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    if (!event)   return NextResponse.json({ error: "Event not found" },   { status: 404 });

    const styleConfig = projectStyleConfig(project);

    // ── Build style clause ────────────────────────────────────────────────────
    const styleParts: string[] = [];
    if (styleConfig.aesthetic_style) styleParts.push(styleConfig.aesthetic_style);
    if (styleConfig.aesthetic && styleConfig.aesthetic !== styleConfig.aesthetic_style)
      styleParts.push(styleConfig.aesthetic);
    if (styleConfig.theme) styleParts.push(styleConfig.theme.replace(/_/g, " "));
    if (styleConfig.tone)  styleParts.push(styleConfig.tone);
    const styleClause = styleParts.length ? styleParts.join(", ") : "cinematic fantasy";

    // ── Build scene description ───────────────────────────────────────────────
    // Combine the event title/description with the user's scene keywords so the
    // image reflects both the narrative context and the specific visual content.
    const narrative = [event.title, event.description]
      .filter(Boolean)
      .join(" — ");

    const visualContent = scene_keywords.length
      ? scene_keywords
      : narrative;   // fall back to event text if no keywords given

    const sceneBody =
      `A single cinematic scene: ${visualContent}. ` +
      `The scene captures a key narrative moment from "${event.title}". ` +
      `Dramatic composition, atmospheric lighting, highly detailed environment, ` +
      `wide-angle establishing shot or close-up as appropriate for the action described.`;

    const prompt =
      `${styleClause}. ${sceneBody} ` +
      `Masterpiece-quality concept art, 8K render, rich colour grading, ` +
      `cinematic depth-of-field — no text overlays, no UI elements.`;

    // Mark as generating before the (slow) fal call so the UI can show a spinner
    await updateEvent(projectId, evId, {
      scene_keywords: scene_keywords || null,
      gen_status: "generating",
    });

    const imageUrl = await falSubscribeImage({
      prompt,
      model: "fal-ai/flux/dev",
      width: 1280,
      height: 720,
    });

    const updated = await updateEvent(projectId, evId, {
      generated_image_url: imageUrl ?? null,
      gen_status: imageUrl ? "done" : "error",
    });

    return NextResponse.json({ event: updated, image_url: imageUrl ?? null });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Unknown error");
  }
}
