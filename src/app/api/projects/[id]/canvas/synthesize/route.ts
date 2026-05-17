import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-auth";
import { getProject, updateProject } from "@/lib/local-store";
import { falSubscribeImage, projectStyleConfig } from "@/lib/fal";
import { fal } from "@fal-ai/client";

if (process.env.FAL_KEY) {
  fal.config({ credentials: process.env.FAL_KEY });
}

type RouteContext = { params: Promise<{ id: string }> };

interface PinRef {
  label: string;
  description?: string | null;
  canvas_x: number;
  canvas_y: number;
}

function subject(label: string, description?: string | null): string {
  const base   = label.trim();
  const detail = description?.trim();
  if (!detail) return base;
  if (detail.toLowerCase().startsWith(base.toLowerCase())) return detail;
  return `${base} (${detail})`;
}

/**
 * Returns a vivid spatial phrase matching how real photography captions
 * describe object placement — the language Flux was trained on.
 */
function spatialDesc(xPct: number, yPct: number): string {
  const hParts: string[] = [];
  if (xPct < 0.18)       hParts.push("anchored at the far-left edge");
  else if (xPct < 0.38)  hParts.push("positioned in the left third");
  else if (xPct < 0.62)  hParts.push("placed in the center of the frame");
  else if (xPct < 0.82)  hParts.push("occupying the right third");
  else                   hParts.push("at the far-right edge");

  if (yPct < 0.22)       hParts.push("high in the sky");
  else if (yPct < 0.42)  hParts.push("in the upper background");
  else if (yPct < 0.62)  hParts.push("at mid-distance");
  else if (yPct < 0.78)  hParts.push("in the lower midground");
  else                   hParts.push("in the immediate foreground");

  return hParts.join(", ");
}

export async function POST(request: Request, context: RouteContext) {
  const { id: projectId } = await context.params;
  try {
    const body = (await request.json()) as {
      pins?: PinRef[];
      canvas_width?: number;
      canvas_height?: number;
      existing_image_url?: string;
    };

    const project = await getProject(projectId);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const styleConfig = projectStyleConfig(project);
    const cw = body.canvas_width  ?? 1280;
    const ch = body.canvas_height ?? 720;

    // ── Style clause ──────────────────────────────────────────────────────────
    // Prefer the rich prompt_descriptor stored by the Studio style picker.
    // Fall back to assembling from aesthetic_style + theme for legacy projects.
    const rawCfg = typeof project.style_config === "object" && project.style_config !== null
      ? (project.style_config as Record<string, unknown>)
      : {};
    const promptDescriptor = typeof rawCfg.prompt_descriptor === "string"
      ? rawCfg.prompt_descriptor
      : null;

    const styleClause = promptDescriptor ?? (() => {
      const parts: string[] = [];
      if (styleConfig.aesthetic_style) parts.push(styleConfig.aesthetic_style);
      if (styleConfig.aesthetic && styleConfig.aesthetic !== styleConfig.aesthetic_style)
        parts.push(styleConfig.aesthetic);
      if (styleConfig.theme) parts.push(styleConfig.theme.replace(/_/g, " "));
      if (styleConfig.tone)  parts.push(styleConfig.tone);
      return parts.length ? parts.join(", ") : "cinematic photorealistic";
    })();

    // Short genre word for inline references inside sentence fragments
    const genreWord = styleConfig.theme?.replace(/_/g, " ") ?? "realistic";

    // ── Prompt ────────────────────────────────────────────────────────────────
    const pins   = body.pins ?? [];
    const sorted = [...pins].sort((a, b) => a.canvas_x - b.canvas_x); // left → right

    let prompt: string;

    if (pins.length === 0) {
      prompt =
        `${styleClause}. ` +
        `Wide-angle landscape, dramatic atmospheric lighting, volumetric fog, ` +
        `matte-painting quality. ${styleClause}. 8K ultra-detailed.`;
    } else if (body.existing_image_url) {
      // ── Re-synthesis ─────────────────────────────────────────────────────
      const entries = sorted.map((p) => {
        const subj = subject(p.label, p.description);
        const pos  = spatialDesc(p.canvas_x / cw, p.canvas_y / ch);
        return `${subj} (${pos})`;
      });
      const checklist = pins.map(p => p.label.toUpperCase()).join(", ");
      prompt =
        `${styleClause}. ` +
        `Keep all existing scene elements exactly where they are and integrate ` +
        `any newly added subjects. ` +
        `Scene subjects from left to right: ${entries.join("; ")}. ` +
        `Every subject — ${checklist} — must be clearly visible. ` +
        `${styleClause}. No text overlays. 8K ultra-detailed.`;
    } else {
      // ── First generation — pure text-to-image ────────────────────────────
      const entries = sorted.map((p) => {
        const subj = subject(p.label, p.description);
        const pos  = spatialDesc(p.canvas_x / cw, p.canvas_y / ch);
        return `A ${subj} is ${pos}.`;
      });
      const checklist = pins.map(p => p.label.toUpperCase()).join(", ");

      const left   = sorted.filter(p => p.canvas_x / cw < 0.38).map(p => p.label).join(", ");
      const center = sorted.filter(p => { const x = p.canvas_x / cw; return x >= 0.38 && x < 0.62; }).map(p => p.label).join(", ");
      const right  = sorted.filter(p => p.canvas_x / cw >= 0.62).map(p => p.label).join(", ");

      const sections = [
        left   && `${left} on the left`,
        center && `${center} in the center`,
        right  && `${right} on the right`,
      ].filter(Boolean).join(", ");

      prompt =
        `${styleClause}. ` +
        `Wide-angle landscape: ${sections}. ` +
        `${entries.join(" ")} ` +
        `Every single subject — ${checklist} — is prominently visible in the ` +
        `same frame simultaneously. Wide field of view so no element is cropped. ` +
        `No people, no text, no watermarks. ${styleClause}.`;
    }

    // ── img2img anchor (re-synthesis only) ───────────────────────────────────
    // Sketch-based img2img approaches are NOT used: Flux img2img treats any
    // coloured or illustrated input as visual content to enhance rather than
    // a spatial map to follow, always producing stylised/cartoon output.
    // Re-synthesis uses the previously rendered photo as anchor at 0.55
    // strength so existing elements stay put while new ones are integrated.
    let anchorCdnUrl: string | undefined;

    if (body.existing_image_url && process.env.FAL_KEY) {
      try {
        const resp = await fetch(body.existing_image_url);
        if (resp.ok) {
          const buffer = await resp.arrayBuffer();
          anchorCdnUrl = await fal.storage.upload(
            new Blob([buffer], { type: "image/png" }),
          );
        }
      } catch (err) {
        console.warn("Existing image upload failed — falling back to t2i", err);
      }
    }

    const imageUrl = await falSubscribeImage({
      prompt,
      model:    anchorCdnUrl ? "fal-ai/flux/dev/image-to-image" : "fal-ai/flux/dev",
      imageUrl: anchorCdnUrl,
      strength: 0.55,
      width:    1280,
      height:   720,
    });

    const canvasState = {
      ...(typeof project.canvas_state === "object" && project.canvas_state !== null
        ? project.canvas_state
        : {}),
      scenery_preview_url: imageUrl ?? null,
      last_synthesis_at:   new Date().toISOString(),
    };
    await updateProject(projectId, { canvas_state: canvasState });

    return NextResponse.json({ image_url: imageUrl ?? null });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Unknown error");
  }
}
