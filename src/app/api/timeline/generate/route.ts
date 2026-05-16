import { NextResponse } from "next/server";

import {
  generateSceneImage,
  isFalConfigured,
  resolveSketchUrl,
} from "@/lib/timeline-fal";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      prompt?: string;
      sketchDataUrl?: string | null;
    };

    const prompt = body.prompt?.trim();
    if (!prompt) {
      return NextResponse.json(
        { error: "prompt is required" },
        { status: 400 },
      );
    }

    if (!isFalConfigured()) {
      return NextResponse.json(
        { error: "Set FAL_KEY in .env.local to enable image generation" },
        { status: 503 },
      );
    }

    if (body.sketchDataUrl?.trim() && !body.sketchDataUrl.startsWith("data:") && !body.sketchDataUrl.startsWith("http")) {
      return NextResponse.json(
        { error: "sketchDataUrl must be a data: or http(s) URL" },
        { status: 400 },
      );
    }

    const sketchUrl = await resolveSketchUrl(body.sketchDataUrl);

    const result = await generateSceneImage({ prompt, sketchUrl });
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 502 });
    }

    return NextResponse.json({ imageUrl: result.imageUrl });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
