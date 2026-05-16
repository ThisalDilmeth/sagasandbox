import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-auth";
import { getProject, createPin, updatePin } from "@/lib/local-store";
import { falSubscribeImage, buildPrompt, projectStyleConfig } from "@/lib/fal";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const { id: projectId } = await context.params;
  try {
    const body = (await request.json()) as {
      label: string;
      description?: string;
      canvas_x: number;
      canvas_y: number;
    };

    if (!body.label || body.canvas_x === undefined || body.canvas_y === undefined) {
      return NextResponse.json(
        { error: "label, canvas_x, and canvas_y are required" },
        { status: 400 },
      );
    }

    const project = await getProject(projectId);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const pin = await createPin(projectId, {
      label: body.label,
      description: body.description ?? null,
      canvas_x: body.canvas_x,
      canvas_y: body.canvas_y,
      gen_status: "generating",
      generated_image_url: null,
      fal_request_id: null,
    });

    // Kick off image generation synchronously (non-blocking from client's view — we stream back early)
    void (async () => {
      try {
        const styleConfig = projectStyleConfig(project);
        const prompt = buildPrompt({
          styleConfig,
          description: `location: ${body.label}. ${body.description ?? ""}`,
        });
        const imageUrl = await falSubscribeImage({ prompt, model: "fal-ai/flux/dev" });
        await updatePin(projectId, pin.id, {
          generated_image_url: imageUrl ?? null,
          gen_status: imageUrl ? "done" : "error",
        });
      } catch {
        await updatePin(projectId, pin.id, { gen_status: "error" });
      }
    })();

    return NextResponse.json({ pin }, { status: 201 });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Unknown error");
  }
}
