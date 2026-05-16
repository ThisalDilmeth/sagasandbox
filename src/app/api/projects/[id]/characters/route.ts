import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-auth";
import {
  getProject,
  listCharacters,
  createCharacter,
  updateCharacter,
} from "@/lib/local-store";
import { falSubscribeImage, buildPrompt, projectStyleConfig } from "@/lib/fal";
import type { VisualTraits } from "@/types/app";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  try {
    const characters = await listCharacters(id);
    return NextResponse.json({ characters });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Unknown error");
  }
}

export async function POST(request: Request, context: RouteContext) {
  const { id: projectId } = await context.params;
  try {
    const body = (await request.json()) as {
      name: string;
      role?: "primary" | "secondary";
      description?: string;
      visual_traits?: VisualTraits;
    };

    if (!body.name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const project = await getProject(projectId);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const character = await createCharacter(projectId, {
      name: body.name,
      role: body.role ?? null,
      description: body.description ?? null,
      visual_traits: body.visual_traits ?? null,
      reference_image_url: null,
      generated_portrait_url: null,
      fal_request_id: null,
      gen_status: "generating",
      voice_id: null,
    });

    void (async () => {
      try {
        const traits = body.visual_traits ?? {};
        const styleConfig = projectStyleConfig(project);
        const prompt = buildPrompt({
          styleConfig,
          description: `character portrait: ${body.description ?? body.name}. Appearance: ${traits.hair ?? ""} hair, ${traits.build ?? ""} build, wearing ${traits.clothing ?? ""}. ${traits.features ?? ""}`,
        });
        const imageUrl = await falSubscribeImage({ prompt, model: "fal-ai/flux/dev" });
        await updateCharacter(projectId, character.id, {
          generated_portrait_url: imageUrl ?? null,
          gen_status: imageUrl ? "done" : "error",
        });
      } catch {
        await updateCharacter(projectId, character.id, { gen_status: "error" });
      }
    })();

    return NextResponse.json({ character }, { status: 201 });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Unknown error");
  }
}
