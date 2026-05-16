import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-auth";
import { listProjects, createProject } from "@/lib/local-store";

export async function GET() {
  try {
    const projects = await listProjects();
    return NextResponse.json({ projects });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Unknown error");
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      name: string;
      theme: string;
      aesthetic_style: string;
      style_config?: Record<string, unknown>;
    };

    if (!body.name || !body.theme || !body.aesthetic_style) {
      return NextResponse.json(
        { error: "name, theme, and aesthetic_style are required" },
        { status: 400 },
      );
    }

    const project = await createProject({
      name: body.name,
      theme: body.theme,
      aesthetic_style: body.aesthetic_style,
      style_config: (body.style_config ?? {
        theme: body.theme,
        aesthetic_style: body.aesthetic_style,
      }) as Record<string, unknown>,
      canvas_state: null,
    });

    return NextResponse.json({ project }, { status: 201 });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Unknown error");
  }
}
