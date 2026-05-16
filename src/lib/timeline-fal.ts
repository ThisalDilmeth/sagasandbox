import { fal } from "@fal-ai/client";

if (process.env.FAL_KEY) {
  fal.config({ credentials: process.env.FAL_KEY });
}

const FLUX_TEXT_MODEL = "fal-ai/flux/dev";
const FLUX_IMAGE_MODEL = "fal-ai/flux/dev/image-to-image";
const VIDEO_MODEL = "fal-ai/kling-video/v2.5-turbo/standard/image-to-video";
/** Luma v1.5 image-to-video is deprecated; MiniMax accepts image_url + prompt. */
const VIDEO_FALLBACK_MODEL = "fal-ai/minimax-video/image-to-video";
/** Kling prompt max length (fal returns 422 string_too_long above this). */
const MAX_VIDEO_PROMPT_LENGTH = 2500;

function isFalHostedUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "fal.media" || host.endsWith(".fal.media");
  } catch {
    return false;
  }
}

type FalValidationItem = {
  msg?: string;
  loc?: (string | number)[];
  type?: string;
};

export type FalErrorInfo = {
  message: string;
  status?: number;
  detail?: FalValidationItem[];
};

export function extractFalError(err: unknown, fallback: string): FalErrorInfo {
  if (err && typeof err === "object") {
    const e = err as {
      message?: string;
      status?: number;
      body?: { detail?: FalValidationItem[] };
    };
    const detail = e.body?.detail;
    if (Array.isArray(detail) && detail.length > 0) {
      const message = detail
        .map((item) => {
          const loc = item.loc?.filter((p) => p !== "body").join(".") ?? "";
          return loc ? `${loc}: ${item.msg ?? "validation error"}` : item.msg;
        })
        .filter(Boolean)
        .join("; ");
      if (message) {
        return { message, status: e.status, detail };
      }
    }
    if (e.message) {
      return { message: e.message, status: e.status, detail };
    }
  }
  if (err instanceof Error && err.message) {
    return { message: err.message };
  }
  return { message: fallback };
}

/** Kling rejects prompts longer than 2500 characters. */
export function truncateVideoPrompt(prompt: string): string {
  const trimmed = prompt.trim();
  if (trimmed.length <= MAX_VIDEO_PROMPT_LENGTH) return trimmed;
  return `${trimmed.slice(0, MAX_VIDEO_PROMPT_LENGTH - 1)}…`;
}

function isImageDownloadError(info: FalErrorInfo): boolean {
  const text = `${info.message} ${info.detail?.map((d) => d.type).join(" ") ?? ""}`;
  return (
    text.includes("download") ||
    text.includes("image_url") ||
    text.includes("file_download_error")
  );
}

/** Re-upload image to fal storage so video models can fetch it reliably. */
async function forceRehostImageUrl(imageUrl: string): Promise<string | null> {
  if (!process.env.FAL_KEY) return null;
  try {
    const res = await fetch(imageUrl);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await fal.storage.upload(blob);
  } catch (err) {
    console.warn("forceRehostImageUrl failed", err);
    return null;
  }
}

/** Ensure Kling/Luma can fetch the seed image (re-host non–fal.media URLs). */
export async function resolveVideoImageUrl(
  imageUrl: string | null | undefined,
): Promise<string | null> {
  if (!imageUrl?.trim()) return null;

  if (imageUrl.startsWith("data:")) {
    return uploadDataUrl(imageUrl);
  }

  if (!imageUrl.startsWith("http://") && !imageUrl.startsWith("https://")) {
    return null;
  }

  if (isFalHostedUrl(imageUrl)) {
    return imageUrl;
  }

  if (!process.env.FAL_KEY) return null;

  try {
    const res = await fetch(imageUrl);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await fal.storage.upload(blob);
  } catch (err) {
    console.warn("video seed image re-host failed", err);
    return null;
  }
}

export function isFalConfigured(): boolean {
  return Boolean(process.env.FAL_KEY);
}

/** Upload sketch PNG to fal storage; falls back to parsing base64 in Node. */
export async function uploadDataUrl(dataUrl: string): Promise<string | null> {
  if (!process.env.FAL_KEY) return null;
  try {
    const match = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl);
    if (match) {
      const [, mime, b64] = match;
      const buffer = Buffer.from(b64, "base64");
      const blob = new Blob([buffer], { type: mime || "image/png" });
      return await fal.storage.upload(blob);
    }
    const res = await fetch(dataUrl);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await fal.storage.upload(blob);
  } catch (err) {
    console.warn("fal storage upload failed", err);
    return null;
  }
}

/** Resolve sketch input: hosted URL, inline data URI, or upload from data URI. */
export async function resolveSketchUrl(
  sketchDataUrl: string | null | undefined,
): Promise<string | null> {
  if (!sketchDataUrl) return null;
  if (sketchDataUrl.startsWith("http://") || sketchDataUrl.startsWith("https://")) {
    return sketchDataUrl;
  }
  if (sketchDataUrl.startsWith("data:")) {
    const uploaded = await uploadDataUrl(sketchDataUrl);
    return uploaded ?? sketchDataUrl;
  }
  return null;
}

export async function generateSceneImage(options: {
  prompt: string;
  sketchUrl?: string | null;
}): Promise<{ imageUrl: string } | { error: string }> {
  if (!process.env.FAL_KEY) {
    return { error: "FAL_KEY is not configured on the server" };
  }

  const hasSketch = Boolean(options.sketchUrl);
  const model = hasSketch ? FLUX_IMAGE_MODEL : FLUX_TEXT_MODEL;

  const input = hasSketch
    ? {
        prompt: options.prompt,
        image_url: options.sketchUrl as string,
        strength: 0.85,
        num_inference_steps: 40,
        guidance_scale: 3.5,
      }
    : {
        prompt: options.prompt,
        image_size: { width: 1024, height: 576 },
        num_inference_steps: 28,
        guidance_scale: 3.5,
      };

  try {
    const result = await fal.subscribe(model, { input });
    const data = result.data as {
      images?: { url?: string }[];
      image?: { url?: string };
    };
    const url = data.images?.[0]?.url ?? data.image?.url ?? null;
    if (!url) {
      return { error: "No image URL in fal response" };
    }
    return { imageUrl: url };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Generation failed";
    return { error: message };
  }
}

function buildVideoModelInput(
  model: string,
  input: { prompt: string; image_url: string; duration?: "5" | "10" },
): Record<string, unknown> {
  const base = {
    prompt: input.prompt,
    image_url: input.image_url,
  };
  if (model.includes("minimax")) {
    return { ...base, prompt_optimizer: true };
  }
  if (model.includes("kling")) {
    return { ...base, duration: input.duration ?? "5" };
  }
  return base;
}

async function runImageToVideo(
  model: string,
  input: { prompt: string; image_url: string; duration?: "5" | "10" },
): Promise<{ videoUrl: string } | { error: string; fal?: FalErrorInfo }> {
  try {
    const result = await fal.subscribe(model, {
      input: buildVideoModelInput(model, input),
      logs: true,
    });
    const data = result.data as {
      video?: { url?: string };
      url?: string;
    };
    const videoUrl = data.video?.url ?? data.url ?? null;
    if (!videoUrl) {
      return { error: "No video URL in fal response" };
    }
    return { videoUrl };
  } catch (err) {
    const fal = extractFalError(err, "Video export failed");
    return { error: fal.message, fal };
  }
}

export async function exportTimelineVideo(options: {
  prompt: string;
  imageUrl?: string | null;
}): Promise<
  { videoUrl: string } | { error: string; fal?: FalErrorInfo }
> {
  if (!process.env.FAL_KEY) {
    return { error: "FAL_KEY is not configured on the server" };
  }

  if (!options.imageUrl) {
    return { error: "A generated card image URL is required for video export" };
  }

  const sourceImageUrl = options.imageUrl;
  let imageUrl = await resolveVideoImageUrl(sourceImageUrl);
  if (!imageUrl) {
    return {
      error:
        "Could not prepare the card image for export. Re-generate the scene image, then try export again.",
    };
  }

  const defaultPrompt =
    "Cinematic storyboard animatic, smooth camera motion, cohesive visual narrative";
  const prompt = truncateVideoPrompt(options.prompt.trim() || defaultPrompt);

  const input = {
    prompt,
    image_url: imageUrl,
    duration: "5" as const,
  };

  let primary = await runImageToVideo(VIDEO_MODEL, input);

  if ("videoUrl" in primary) {
    return primary;
  }

  if (primary.fal && isImageDownloadError(primary.fal)) {
    const rehosted = await forceRehostImageUrl(sourceImageUrl);
    if (rehosted && rehosted !== imageUrl) {
      imageUrl = rehosted;
      primary = await runImageToVideo(VIDEO_MODEL, {
        ...input,
        image_url: rehosted,
      });
      if ("videoUrl" in primary) {
        return primary;
      }
    }
  }

  const fallback = await runImageToVideo(VIDEO_FALLBACK_MODEL, {
    ...input,
    image_url: imageUrl,
  });

  if ("videoUrl" in fallback) {
    return fallback;
  }

  return {
    error: fallback.error,
    fal: fallback.fal ?? primary.fal,
  };
}
