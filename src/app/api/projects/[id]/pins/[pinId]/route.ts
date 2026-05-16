import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-auth";
import {
  getProject,
  getPin,
  updatePin,
  deletePin,
  listEvents,
  updateEvent,
} from "@/lib/local-store";
import { falSubscribeImage, buildPrompt, projectStyleConfig } from "@/lib/fal";

type RouteContext = { params: Promise<{ id: string; pinId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const { id: projectId, pinId } = await context.params;
  try {
    const body = (await request.json()) as {
      label?: string;
      description?: string;
    };

    const existing = await getPin(projectId, pinId);
    if (!existing) {
      return NextResponse.json({ error: "Pin not found" }, { status: 404 });
    }

    const patch: Partial<typeof existing> = {};
    if (body.label !== undefined) patch.label = body.label;
    if (body.description !== undefined) patch.description = body.description;

    const pin = await updatePin(projectId, pinId, patch);
    if (!pin) return jsonError("Update failed");

    const descriptionChanged =
      body.description !== undefined && body.description !== existing.description;

    if (descriptionChanged) {
      void (async () => {
        try {
          const project = await getProject(projectId);
          if (!project) return;
          const styleConfig = projectStyleConfig(project);
          const prompt = buildPrompt({
            styleConfig,
            description: `location: ${pin.label}. ${pin.description ?? ""}`,
          });
          const imageUrl = await falSubscribeImage({ prompt, model: "fal-ai/flux/dev" });
          await updatePin(projectId, pinId, {
            generated_image_url: imageUrl ?? null,
            gen_status: imageUrl ? "done" : "error",
          });
        } catch {
          await updatePin(projectId, pinId, { gen_status: "error" });
        }
      })();
    }

    return NextResponse.json({ pin });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Unknown error");
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id: projectId, pinId } = await context.params;
  try {
    await deletePin(projectId, pinId);

    // Null out pin reference in events
    const events = await listEvents(projectId);
    await Promise.allSettled(
      events
        .filter((e) => e.pin_id === pinId)
        .map((e) => updateEvent(projectId, e.id, { pin_id: null })),
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Unknown error");
  }
}
