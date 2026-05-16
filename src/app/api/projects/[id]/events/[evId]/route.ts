import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-auth";
import {
  getProject,
  getEvent,
  updateEvent,
  deleteEvent,
  listCharacters,
  getPin,
} from "@/lib/local-store";
import { falSubscribeImage, buildPrompt, projectStyleConfig } from "@/lib/fal";
import type { VisualTraits } from "@/types/app";

type RouteContext = { params: Promise<{ id: string; evId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const { id: projectId, evId } = await context.params;
  try {
    const body = (await request.json()) as {
      title?: string;
      description?: string;
      sequence_order?: number;
      pin_id?: string | null;
      in_world_time?: string;
      is_ghost?: boolean;
      audio_summary?: string;
    };

    const existing = await getEvent(projectId, evId);
    if (!existing) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    const patch: Partial<typeof existing> = {};
    if (body.title !== undefined) patch.title = body.title;
    if (body.description !== undefined) patch.description = body.description;
    if (body.sequence_order !== undefined) patch.sequence_order = body.sequence_order;
    if (body.pin_id !== undefined) patch.pin_id = body.pin_id;
    if (body.in_world_time !== undefined) patch.in_world_time = body.in_world_time;
    if (body.is_ghost !== undefined) patch.is_ghost = body.is_ghost;
    if (body.audio_summary !== undefined) patch.audio_summary = body.audio_summary;

    const event = await updateEvent(projectId, evId, patch);
    if (!event) return jsonError("Update failed");

    const descriptionChanged =
      body.description !== undefined && body.description !== existing.description;

    if (descriptionChanged) {
      void (async () => {
        try {
          const [project, characters] = await Promise.all([
            getProject(projectId),
            listCharacters(projectId),
          ]);
          if (!project) return;

          const description = event.description ?? event.title;
          const matched = characters.filter((c) =>
            description.toLowerCase().includes(c.name.toLowerCase()),
          );
          const characterLines = matched.map((c) => {
            const traits = (c.visual_traits ?? {}) as VisualTraits;
            return [c.name, traits.hair, traits.build, traits.clothing, traits.features]
              .filter(Boolean)
              .join(", ");
          });

          const styleConfig = projectStyleConfig(project);
          let imgUrl: string | undefined;
          if (event.pin_id) {
            const pin = await getPin(projectId, event.pin_id);
            if (pin?.generated_image_url) imgUrl = pin.generated_image_url;
          }
          const refChar = matched.find((c) => c.reference_image_url);
          if (refChar?.reference_image_url) imgUrl = refChar.reference_image_url;

          const prompt = buildPrompt({
            styleConfig,
            description: `scene: ${description}`,
            characters: characterLines.length ? characterLines : undefined,
          });

          const imageUrl = await falSubscribeImage({
            prompt,
            model: "fal-ai/flux/dev",
            imageUrl: imgUrl,
          });
          await updateEvent(projectId, evId, {
            generated_image_url: imageUrl ?? null,
            gen_status: imageUrl ? "done" : "error",
          });
        } catch {
          await updateEvent(projectId, evId, { gen_status: "error" });
        }
      })();
    }

    return NextResponse.json({ event });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Unknown error");
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id: projectId, evId } = await context.params;
  try {
    await deleteEvent(projectId, evId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Unknown error");
  }
}
