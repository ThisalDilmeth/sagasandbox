import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-auth";
import { getProject, updateProject } from "@/lib/local-store";
import { falSubscribeImage, buildPrompt, projectStyleConfig } from "@/lib/fal";
import { falDepthMap } from "@/lib/fal-media";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const { id: projectId } = await context.params;
  try {
    const body = (await request.json()) as {
      sketch_description?: string;
      reference_image_url?: string;
    };

    const project = await getProject(projectId);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const styleConfig = projectStyleConfig(project);
    const prompt = buildPrompt({
      styleConfig,
      description:
        body.sketch_description ??
        "Transform this sketch into a cinematic environment backdrop",
    });

    const [imageUrl, depthPreviewUrl] = await Promise.all([
      falSubscribeImage({
        prompt,
        imageUrl: body.reference_image_url,
        width: 1280,
        height: 720,
      }),
      body.reference_image_url ? falDepthMap(body.reference_image_url) : Promise.resolve(null),
    ]);

    const canvasState = {
      ...(typeof project.canvas_state === "object" && project.canvas_state !== null
        ? project.canvas_state
        : {}),
      scenery_preview_url: imageUrl ?? null,
      depth_preview_url: depthPreviewUrl,
      last_synthesis_at: new Date().toISOString(),
    };

    await updateProject(projectId, { canvas_state: canvasState });

    return NextResponse.json({
      image_url: imageUrl ?? null,
      depth_preview_url: depthPreviewUrl,
    });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Unknown error");
  }
}
