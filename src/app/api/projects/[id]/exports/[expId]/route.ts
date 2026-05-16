import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-auth";
import { getExport } from "@/lib/local-store";

type RouteContext = { params: Promise<{ id: string; expId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { id: projectId, expId } = await context.params;
  try {
    const exportRow = await getExport(projectId, expId);
    if (!exportRow) {
      return NextResponse.json({ error: "Export not found" }, { status: 404 });
    }
    return NextResponse.json({
      export: exportRow,
      signed_url: exportRow.output_url ?? undefined,
    });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Unknown error");
  }
}
