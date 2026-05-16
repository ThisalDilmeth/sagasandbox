import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-auth";
import { getEvent, updateEvent } from "@/lib/local-store";
import { falWhisperTranscribe } from "@/lib/fal-media";
import { fal } from "@fal-ai/client";
import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";

if (process.env.FAL_KEY) {
  fal.config({ credentials: process.env.FAL_KEY });
}

type RouteContext = { params: Promise<{ id: string; evId: string }> };

export async function POST(request: Request, context: RouteContext) {
  const { id: projectId, evId } = await context.params;
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }

    const event = await getEvent(projectId, evId);
    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const filename = `${randomUUID()}.webm`;
    const audioDir = path.join(process.cwd(), ".data", "audio");
    await fs.mkdir(audioDir, { recursive: true });
    await fs.writeFile(path.join(audioDir, filename), buffer);

    // Upload audio to fal storage for Whisper access
    let audioSummary: string | null = null;
    try {
      const blob = new Blob([buffer], { type: file.type || "audio/webm" });
      const falUrl = await fal.storage.upload(blob);
      audioSummary = await falWhisperTranscribe(falUrl);
    } catch (err) {
      console.warn("Whisper transcription failed", err);
    }

    const updated = await updateEvent(projectId, evId, {
      audio_summary: audioSummary ?? undefined,
      ...(audioSummary ? { description: audioSummary } : {}),
    });

    return NextResponse.json({ event: updated ?? event, audio_summary: audioSummary });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Unknown error");
  }
}
