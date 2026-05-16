import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-auth";
import { getCharacter, updateCharacter } from "@/lib/local-store";
import { promises as fs } from "fs";
import path from "path";

type RouteContext = { params: Promise<{ id: string; cId: string }> };

export async function POST(request: Request, context: RouteContext) {
  const { id: projectId, cId } = await context.params;
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }

    const character = await getCharacter(projectId, cId);
    if (!character) {
      return NextResponse.json({ error: "Character not found" }, { status: 404 });
    }

    const ext = file.type.includes("png") ? "png" : "jpg";
    const filename = `${cId}-reference.${ext}`;
    const uploadDir = path.join(process.cwd(), "public", "uploads", "characters");
    await fs.mkdir(uploadDir, { recursive: true });
    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(path.join(uploadDir, filename), buffer);

    const publicUrl = `/uploads/characters/${filename}`;

    const updated = await updateCharacter(projectId, cId, {
      reference_image_url: publicUrl,
    });

    return NextResponse.json({
      reference_image_url: publicUrl,
      character: updated ?? character,
    });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Unknown error");
  }
}
