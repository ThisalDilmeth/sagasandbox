import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-auth";
import { getEvent, updateEvent, deleteEvent } from "@/lib/local-store";

type RouteContext = { params: Promise<{ id: string; pendingId: string }> };

export async function POST(request: Request, context: RouteContext) {
  const { id: projectId, pendingId } = await context.params;
  try {
    const body = (await request.json()) as { action: "approve" | "reject" };

    const event = await getEvent(projectId, pendingId);
    if (!event) {
      return NextResponse.json({ error: "Pending event not found" }, { status: 404 });
    }

    if (body.action === "approve") {
      const updated = await updateEvent(projectId, pendingId, { is_ghost: false });
      return NextResponse.json({ event: updated, status: "approved" });
    } else {
      await deleteEvent(projectId, pendingId);
      return NextResponse.json({ event: null, status: "rejected" });
    }
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Unknown error");
  }
}
