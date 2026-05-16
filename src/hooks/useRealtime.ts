"use client";

import type {
  Character,
  Export,
  LocationPin,
  TimelineEvent,
} from "@/types/app";

export type CanvasOpType = "add" | "modify" | "delete" | "cursor";

export interface CanvasOpPayload {
  op: CanvasOpType;
  user_id: string;
  object_id: string;
  payload: Record<string, unknown>;
}

export interface ProjectRealtimeHandlers {
  onCanvasOp: (op: CanvasOpPayload) => void;
  onPinUpdate: (pin: LocationPin) => void;
  onPinInsert?: (pin: LocationPin) => void;
  onPinDelete?: (pinId: string) => void;
  onEventUpdate: (event: TimelineEvent) => void;
  onEventInsert?: (event: TimelineEvent) => void;
  onEventDelete?: (eventId: string) => void;
  onExportUpdate: (exp: Export) => void;
  onCharacterUpdate?: (character: Character) => void;
  onCharacterInsert?: (character: Character) => void;
  onCharacterDelete?: (characterId: string) => void;
}

/** No-op in local-only mode — all state is managed via Zustand and local API routes. */
export function useProjectRealtime(
  _projectId: string,
  _handlers: ProjectRealtimeHandlers,
) {
  // Realtime not needed for single-user local operation.
}

/** No-op in local-only mode. */
export async function broadcastCanvasOp(
  _projectId: string,
  _op: CanvasOpPayload,
) {
  // No realtime broadcast in local mode.
}
