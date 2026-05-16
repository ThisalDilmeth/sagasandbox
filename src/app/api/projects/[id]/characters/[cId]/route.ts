import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-auth";
import {
  getProject,
  getCharacter,
  updateCharacter,
  deleteCharacter,
} from "@/lib/local-store";
import { falSubscribeImage, buildPrompt, projectStyleConfig } from "@/lib/fal";
import type { VisualTraits } from "@/types/app";

type RouteContext = { params: Promise<{ id: string; cId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const { id: projectId, cId } = await context.params;
  try {
    const body = (await request.json()) as {
      name?: string;
      role?: "primary" | "secondary";
      description?: string;
      visual_traits?: VisualTraits;
      voice_id?: string;
    };

    const existing = await getCharacter(projectId, cId);
    if (!existing) {
      return NextResponse.json({ error: "Character not found" }, { status: 404 });
    }

    const patch: Partial<typeof existing> = {};
    if (body.name !== undefined) patch.name = body.name;
    if (body.role !== undefined) patch.role = body.role;
    if (body.description !== undefined) patch.description = body.description;
    if (body.visual_traits !== undefined) patch.visual_traits = body.visual_traits;
    if (body.voice_id !== undefined) patch.voice_id = body.voice_id;

    const character = await updateCharacter(projectId, cId, patch);
    if (!character) return jsonError("Update failed");

    const visualChanged =
      body.visual_traits !== undefined ||
      (body.description !== undefined && body.description !== existing.description);

    if (visualChanged) {
      void (async () => {
        try {
          const project = await getProject(projectId);
          if (!project) return;
          const traits = (character.visual_traits ?? {}) as VisualTraits;
          const styleConfig = projectStyleConfig(project);
          const prompt = buildPrompt({
            styleConfig,
            description: `character portrait: ${character.description ?? character.name}. Appearance: ${traits.hair ?? ""} hair, ${traits.build ?? ""} build, wearing ${traits.clothing ?? ""}. ${traits.features ?? ""}`,
          });
          const imageUrl = await falSubscribeImage({ prompt, model: "fal-ai/flux/dev" });
          await updateCharacter(projectId, cId, {
            generated_portrait_url: imageUrl ?? null,
            gen_status: imageUrl ? "done" : "error",
          });
        } catch {
          await updateCharacter(projectId, cId, { gen_status: "error" });
        }
      })();
    }

    return NextResponse.json({ character });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Unknown error");
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id: projectId, cId } = await context.params;
  try {
    await deleteCharacter(projectId, cId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Unknown error");
  }
}
