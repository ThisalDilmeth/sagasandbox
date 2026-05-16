import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-auth";
import { updateProject } from "@/lib/local-store";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  try {
    const body = (await request.json()) as { canvas_state: Record<string, unknown> };

    if (!body.canvas_state) {
      return NextResponse.json({ error: "canvas_state is required" }, { status: 400 });
    }

    await updateProject(id, { canvas_state: body.canvas_state });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Unknown error");
  }
}
