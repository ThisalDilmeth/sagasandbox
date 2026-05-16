import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-auth";
import {
  getProject,
  updateProject,
  deleteProject,
  listPins,
  updatePin,
  listEvents,
  updateEvent,
} from "@/lib/local-store";
import { falSubscribeImage, buildPrompt, projectStyleConfig } from "@/lib/fal";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  try {
    const project = await getProject(id);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    return NextResponse.json({ project });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Unknown error");
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  try {
    const body = (await request.json()) as {
      name?: string;
      theme?: string;
      aesthetic_style?: string;
      style_config?: Record<string, unknown>;
      canvas_state?: Record<string, unknown>;
      cascade?: boolean;
    };

    const project = await updateProject(id, {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.theme !== undefined ? { theme: body.theme } : {}),
      ...(body.aesthetic_style !== undefined ? { aesthetic_style: body.aesthetic_style } : {}),
      ...(body.style_config !== undefined ? { style_config: body.style_config } : {}),
      ...(body.canvas_state !== undefined ? { canvas_state: body.canvas_state } : {}),
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    let queued = 0;

    if (body.cascade) {
      const styleConfig = projectStyleConfig(project);
      const [pins, events] = await Promise.all([
        listPins(id),
        listEvents(id),
      ]);

      await Promise.allSettled([
        ...pins.map(async (pin) => {
          try {
            await updatePin(id, pin.id, { gen_status: "generating" });
            const prompt = buildPrompt({
              styleConfig,
              description: `location: ${pin.label}. ${pin.description ?? ""}`,
            });
            const imageUrl = await falSubscribeImage({ prompt });
            if (imageUrl) {
              await updatePin(id, pin.id, {
                generated_image_url: imageUrl,
                gen_status: "done",
              });
              queued++;
            }
          } catch {
            await updatePin(id, pin.id, { gen_status: "error" });
          }
        }),
        ...events.map(async (event) => {
          try {
            await updateEvent(id, event.id, { gen_status: "generating" });
            const prompt = buildPrompt({
              styleConfig,
              description: `scene: ${event.description ?? event.title}`,
            });
            const imageUrl = await falSubscribeImage({ prompt });
            if (imageUrl) {
              await updateEvent(id, event.id, {
                generated_image_url: imageUrl,
                gen_status: "done",
              });
              queued++;
            }
          } catch {
            await updateEvent(id, event.id, { gen_status: "error" });
          }
        }),
      ]);
    }

    return NextResponse.json({ project, queued: body.cascade ? queued : undefined });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Unknown error");
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  try {
    await deleteProject(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Unknown error");
  }
}
