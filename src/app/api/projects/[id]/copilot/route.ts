import { NextResponse } from "next/server";
import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";
import { jsonError } from "@/lib/api-auth";
import {
  getProject,
  listPins,
  listEvents,
  listCharacters,
  createEvent,
  updateEvent,
} from "@/lib/local-store";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const { id: projectId } = await context.params;

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY not configured" },
      { status: 503 },
    );
  }

  try {
    const body = (await request.json()) as {
      message: string;
      propose_changes?: boolean;
    };

    if (!body.message?.trim()) {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }

    const [project, pins, events, characters] = await Promise.all([
      getProject(projectId),
      listPins(projectId),
      listEvents(projectId),
      listCharacters(projectId),
    ]);

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const contextBlock = JSON.stringify(
      {
        theme: project.theme,
        aesthetic: project.aesthetic_style,
        pins: pins.map((p) => ({ id: p.id, label: p.label, description: p.description })),
        events: events.map((e) => ({
          id: e.id,
          title: e.title,
          description: e.description,
          sequence_order: e.sequence_order,
          pin_id: e.pin_id,
          is_ghost: e.is_ghost,
        })),
        characters: characters.map((c) => ({ name: c.name, description: c.description })),
      },
      null,
      2,
    );

    const result = streamText({
      model: openai("gpt-4o-mini"),
      system: `You are the SagaSandbox Creative Copilot. Analyze narrative consistency and plot holes.
When you suggest a new timeline event, append a single line exactly like:
PROPOSE_EVENT: {"title":"...","description":"...","pin_id":null}
Project state JSON:
${contextBlock}`,
      prompt: body.message,
    });

    const text = await result.text;

    let pendingId: string | null = null;
    const proposeMatch = text.match(/PROPOSE_EVENT:\s*(\{[\s\S]*?\})/);
    if (body.propose_changes !== false && proposeMatch) {
      try {
        const payload = JSON.parse(proposeMatch[1]) as {
          title: string;
          description?: string;
          pin_id?: string | null;
        };
        const nextOrder =
          events.length > 0
            ? Math.max(...events.map((e) => e.sequence_order)) + 1
            : 0;

        const ghost = await createEvent(projectId, {
          title: payload.title,
          description: payload.description ?? null,
          pin_id: payload.pin_id ?? null,
          sequence_order: nextOrder,
          scene_keywords: null,
          is_ghost: true,
          gen_status: "pending",
          generated_image_url: null,
          audio_url: null,
          fal_request_id: null,
          audio_summary: null,
          in_world_time: null,
        });
        pendingId = ghost.id;
      } catch {
        // ignore malformed proposal
      }
    }

    return NextResponse.json({
      response: text.replace(/PROPOSE_EVENT:[\s\S]*$/, "").trim(),
      pending_id: pendingId,
    });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Unknown error");
  }
}
