"use client";

import { useMemo } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

import {
  createDefaultProject,
  createEmptyCard,
  type TimelineCard,
  type TimelineProject,
  type WhiteboardData,
} from "@/types/timeline";

const STORAGE_KEY = "sagasandbox-timeline-v1";

function sortCards(cards: TimelineCard[]): TimelineCard[] {
  return [...cards].sort((a, b) => a.order - b.order);
}

function reindex(cards: TimelineCard[]): TimelineCard[] {
  return sortCards(cards).map((card, index) => ({ ...card, order: index }));
}

type TimelineState = {
  project: TimelineProject;
  hydrated: boolean;
  setHydrated: (value: boolean) => void;
  setProjectName: (name: string) => void;
  addCard: () => string;
  updateCard: (id: string, patch: Partial<TimelineCard>) => void;
  deleteCard: (id: string) => void;
  reorderCards: (activeId: string, overId: string) => void;
  setWhiteboard: (id: string, whiteboard: WhiteboardData) => void;
  setCardPrompt: (id: string, prompt: string) => void;
  setCardGeneration: (
    id: string,
    patch: Partial<
      Pick<TimelineCard, "genStatus" | "generatedImageUrl" | "genError">
    >,
  ) => void;
  getCard: (id: string) => TimelineCard | undefined;
  resetProject: () => void;
};

export const useTimelineStore = create<TimelineState>()(
  persist(
    (set, get) => ({
      project: createDefaultProject(),
      hydrated: false,
      setHydrated: (value) => set({ hydrated: value }),

      setProjectName: (name) =>
        set((state) => ({
          project: {
            ...state.project,
            name,
            updatedAt: new Date().toISOString(),
          },
        })),

      addCard: () => {
        const card = createEmptyCard(get().project.cards.length);
        set((state) => ({
          project: {
            ...state.project,
            cards: [...state.project.cards, card],
            updatedAt: new Date().toISOString(),
          },
        }));
        return card.id;
      },

      updateCard: (id, patch) =>
        set((state) => ({
          project: {
            ...state.project,
            cards: state.project.cards.map((c) =>
              c.id === id ? { ...c, ...patch } : c,
            ),
            updatedAt: new Date().toISOString(),
          },
        })),

      deleteCard: (id) =>
        set((state) => {
          const next = reindex(
            state.project.cards.filter((c) => c.id !== id),
          );
          return {
            project: {
              ...state.project,
              cards: next.length > 0 ? next : [createEmptyCard(0)],
              updatedAt: new Date().toISOString(),
            },
          };
        }),

      reorderCards: (activeId, overId) =>
        set((state) => {
          const cards = sortCards(state.project.cards);
          const oldIndex = cards.findIndex((c) => c.id === activeId);
          const newIndex = cards.findIndex((c) => c.id === overId);
          if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) {
            return state;
          }
          const moved = [...cards];
          const [item] = moved.splice(oldIndex, 1);
          moved.splice(newIndex, 0, item);
          return {
            project: {
              ...state.project,
              cards: reindex(moved),
              updatedAt: new Date().toISOString(),
            },
          };
        }),

      setWhiteboard: (id, whiteboard) =>
        get().updateCard(id, { whiteboard }),

      setCardPrompt: (id, prompt) => get().updateCard(id, { prompt }),

      setCardGeneration: (id, patch) => get().updateCard(id, patch),

      getCard: (id) => get().project.cards.find((c) => c.id === id),

      resetProject: () =>
        set({ project: createDefaultProject() }),
    }),
    {
      name: STORAGE_KEY,
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
      },
    },
  ),
);

export function useSortedCards(): TimelineCard[] {
  const cards = useTimelineStore((s) => s.project.cards);
  return useMemo(() => sortCards(cards), [cards]);
}
