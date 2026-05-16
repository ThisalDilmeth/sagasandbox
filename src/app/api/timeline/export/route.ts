import { NextResponse } from "next/server";

import { exportTimelineVideo, isFalConfigured } from "@/lib/timeline-fal";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      prompt?: string;
      imageUrls?: string[];
    };

    const imageUrls = (body.imageUrls ?? []).filter(Boolean);
    if (imageUrls.length === 0) {
      return NextResponse.json(
        { error: "At least one generated card image is required" },
        { status: 400 },
      );
    }

    if (!isFalConfigured()) {
      return NextResponse.json(
        { error: "Set FAL_KEY in .env.local to enable video export" },
        { status: 503 },
      );
    }

    const sceneTitles = body.prompt?.trim();
    const defaultPrompt =
      "Cinematic storyboard animatic, smooth camera motion, cohesive visual narrative";
    const prompt = sceneTitles || defaultPrompt;

    const result = await exportTimelineVideo({
      prompt,
      imageUrl: imageUrls[0],
    });

    if ("error" in result) {
      console.error("timeline export fal error", {
        message: result.error,
        status: result.fal?.status,
        detail: result.fal?.detail,
      });
      return NextResponse.json(
        {
          error: result.error,
          fal: result.fal
            ? {
                status: result.fal.status,
                detail: result.fal.detail,
              }
            : undefined,
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      videoUrl: result.videoUrl,
      note:
        imageUrls.length > 1
          ? "Video seeded from the first card image; full multi-panel stitching is a follow-up."
          : undefined,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
