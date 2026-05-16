import { fal } from "@fal-ai/client";

if (process.env.FAL_KEY) {
  fal.config({ credentials: process.env.FAL_KEY });
}

export async function falWhisperTranscribe(audioUrl: string): Promise<string | null> {
  if (!process.env.FAL_KEY) return null;
  try {
    const result = await fal.subscribe("fal-ai/whisper", {
      input: { audio_url: audioUrl },
    });
    const data = result.data as { text?: string };
    return data.text ?? null;
  } catch (err) {
    console.warn("Whisper failed", err);
    return null;
  }
}

export async function falDepthMap(imageUrl: string): Promise<string | null> {
  if (!process.env.FAL_KEY) return null;
  try {
    const result = await fal.subscribe("fal-ai/depth-anything", {
      input: { image_url: imageUrl },
    });
    const data = result.data as { depth_map?: { url?: string }; image?: { url?: string } };
    return data.depth_map?.url ?? data.image?.url ?? null;
  } catch (err) {
    console.warn("Depth map failed", err);
    return null;
  }
}

/** Synchronous video generation via fal-ai/luma-dream-machine. Returns video URL or null. */
export async function falSubscribeVideo(options: {
  prompt: string;
  imageUrl?: string;
}): Promise<string | null> {
  if (!process.env.FAL_KEY) return null;
  const model = "fal-ai/luma-dream-machine";
  const input: Record<string, unknown> = { prompt: options.prompt };
  if (options.imageUrl) input.image_url = options.imageUrl;

  const result = await fal.subscribe(model, { input });
  const data = result.data as {
    video?: { url?: string };
    videos?: Array<{ url?: string }>;
  };
  return data.video?.url ?? data.videos?.[0]?.url ?? null;
}

export async function falVideoQueue(options: {
  prompt: string;
  imageUrl?: string;
}): Promise<{ requestId: string } | null> {
  if (!process.env.FAL_KEY) return null;
  const model = "fal-ai/luma-dream-machine";
  const input: Record<string, unknown> = { prompt: options.prompt };
  if (options.imageUrl) input.image_url = options.imageUrl;

  const { request_id } = await fal.queue.submit(model, { input });
  return { requestId: request_id };
}
