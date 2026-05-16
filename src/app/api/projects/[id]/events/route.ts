import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-auth";
import {
  getProject,
  listEvents,
  createEvent,
  updateEvent,
  listCharacters,
  getPin,
} from "@/lib/local-store";
import { falSubscribeImage, buildPrompt, projectStyleConfig } from "@/lib/fal";
import type { VisualTraits } from "@/types/app";

type RouteContext = { params: Promise<{ id: string }> };

async function generateEventImage(
  projectId: string,
  event: { id: string; description: string | null; title: string; pin_id: string | null },
) {
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
  let imageUrl: string | undefined;

  if (event.pin_id) {
    const pin = await getPin(projectId, event.pin_id);
    if (pin?.generated_image_url) imageUrl = pin.generated_image_url;
  }

  const refChar = matched.find((c) => c.reference_image_url);
  if (refChar?.reference_image_url) imageUrl = refChar.reference_image_url;

  const prompt = buildPrompt({
    styleConfig,
    description: `scene: ${description}`,
    characters: characterLines.length ? characterLines : undefined,
  });

  const resultUrl = await falSubscribeImage({ prompt, model: "fal-ai/flux/dev", imageUrl });
  await updateEvent(projectId, event.id, {
    generated_image_url: resultUrl ?? null,
    gen_status: resultUrl ? "done" : "error",
  });
}

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  try {
    const events = await listEvents(id);
    return NextResponse.json({ events });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Unknown error");
  }
}

export async function POST(request: Request, context: RouteContext) {
  const { id: projectId } = await context.params;
  try {
    const body = (await request.json()) as {
      title: string;
      description?: string;
      sequence_order: number;
      pin_id?: string;
      in_world_time?: string;
      is_ghost?: boolean;
    };

    if (!body.title || body.sequence_order === undefined) {
      return NextResponse.json(
        { error: "title and sequence_order are required" },
        { status: 400 },
      );
    }

    const event = await createEvent(projectId, {
      pin_id: body.pin_id ?? null,
      title: body.title,
      description: body.description ?? null,
      scene_keywords: null,
      sequence_order: body.sequence_order,
      in_world_time: body.in_world_time ?? null,
      is_ghost: body.is_ghost ?? false,
      gen_status: "generating",
      generated_image_url: null,
      audio_url: null,
      fal_request_id: null,
      audio_summary: null,
    });

    // Generate image in background
    void generateEventImage(projectId, event).catch(() => {
      void updateEvent(projectId, event.id, { gen_status: "error" });
    });

    return NextResponse.json({ event }, { status: 201 });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Unknown error");
  }
}
