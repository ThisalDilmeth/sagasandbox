export type GenStatus = "idle" | "generating" | "done" | "error";

export type WhiteboardStroke = {
  tool: "brush" | "eraser";
  points: number[];
  strokeWidth: number;
  color: string;
};

export type WhiteboardData = {
  strokes: WhiteboardStroke[];
};

export type TimelineCard = {
  id: string;
  order: number;
  title: string;
  description?: string;
  prompt: string;
  whiteboard: WhiteboardData;
  generatedImageUrl: string | null;
  genStatus: GenStatus;
  genError?: string;
};

export type TimelineProject = {
  id: string;
  name: string;
  cards: TimelineCard[];
  updatedAt: string;
};

export function createEmptyCard(order: number): TimelineCard {
  return {
    id: crypto.randomUUID(),
    order,
    title: `Scene ${order + 1}`,
    prompt: "",
    whiteboard: { strokes: [] },
    generatedImageUrl: null,
    genStatus: "idle",
  };
}

export function createDefaultProject(): TimelineProject {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    name: "Untitled story",
    cards: [createEmptyCard(0)],
    updatedAt: now,
  };
}
