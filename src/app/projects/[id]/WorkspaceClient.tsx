"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { AppShell, type SidebarNav } from "@/components/layout/AppShell";
import { ProjectSettingsModal } from "@/components/layout/ProjectSettingsModal";
import { HistorySidebar } from "@/components/history/HistorySidebar";
import { CopilotPanel } from "@/components/copilot/CopilotPanel";
import { CharacterVault } from "@/components/vault/CharacterVault";
import { PinSidebar } from "@/components/canvas/PinSidebar";
import { ExportTerminal } from "@/components/export/ExportTerminal";
import { TimelineStrip } from "@/components/timeline/TimelineStrip";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { ToastHost } from "@/components/shared/ToastHost";
import {
  PanelSkeleton,
  TimelineSkeleton,
} from "@/components/shared/PanelSkeleton";
import type { GeographyCanvasHandle } from "@/components/canvas/GeographyCanvas";
import { useProjectRealtime } from "@/hooks/useRealtime";
import type { CanvasOpPayload } from "@/hooks/useRealtime";
import { useUIStore } from "@/store/ui-store";
import { toastError } from "@/store/toast-store";
import { History, Settings, Sparkles } from "lucide-react";
import { themeAccent } from "@/lib/constants";
import {
  isProjectApiAvailable,
  PROJECT_API_UNAVAILABLE_MESSAGE,
  readApiError,
} from "@/lib/project-api";
import type {
  Character,
  Export,
  LocationPin,
  Project,
  TimelineEvent,
} from "@/types/app";

const GeographyCanvas = dynamic(
  () =>
    import("@/components/canvas/GeographyCanvas").then(
      (m) => m.GeographyCanvas,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center">
        <div className="h-48 w-full max-w-md animate-pulse rounded-lg bg-[#1a1a1e]" />
      </div>
    ),
  },
);


export interface WorkspaceClientProps {
  project: Project;
  initialPins: LocationPin[];
  initialEvents: TimelineEvent[];
  initialCharacters: Character[];
  initialCanvasState?: Record<string, unknown> | null;
  userId?: string;
  /** When false, mutation UIs stay disabled (e.g. mock demo workspace). */
  apiAvailable?: boolean;
}

const CANVAS_PERSIST_MS = 800;

export function WorkspaceClient({
  project,
  initialPins,
  initialEvents,
  initialCharacters,
  initialCanvasState = null,
  userId: initialUserId,
  apiAvailable: apiAvailableProp,
}: WorkspaceClientProps) {
  const [pins, setPins] = useState(initialPins);
  const [events, setEvents] = useState(initialEvents);
  const [characters, setCharacters] = useState(initialCharacters);
  const [activeNav, setActiveNav] = useState<SidebarNav>("canvas");
  const [userId, setUserId] = useState(initialUserId ?? "local");
  const [canvasHydrating, setCanvasHydrating] = useState(true);
  const [panelsBooting, setPanelsBooting] = useState(true);
  const [liveExport, setLiveExport] = useState<Export | null>(null);
  const [projectState, setProjectState] = useState(project);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [copilotOpen, setCopilotOpen] = useState(false);

  const canvasRef = useRef<GeographyCanvasHandle>(null);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const apiAvailable =
    apiAvailableProp ?? isProjectApiAvailable(project.id);
  const isDemo = false;

  const {
    selectedPin,
    setSelectedPin,
    sidebarMode,
    setSidebarMode,
    setActiveEvent,
  } = useUIStore();

  const highlightedPinId = useUIStore((s) => s.highlightedPinId);
  const accent = themeAccent(projectState.theme);

  useEffect(() => {
    const id = requestAnimationFrame(() => setPanelsBooting(false));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    return () => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    };
  }, []);

  const handlePinUpdate = useCallback(
    (pin: LocationPin) => {
      setPins((prev) => prev.map((p) => (p.id === pin.id ? pin : p)));
      if (useUIStore.getState().selectedPin?.id === pin.id) {
        setSelectedPin(pin);
      }
    },
    [setSelectedPin],
  );

  const handleEventUpdate = useCallback(
    (event: TimelineEvent) => {
      setEvents((prev) => prev.map((e) => (e.id === event.id ? event : e)));
      if (useUIStore.getState().activeEvent?.id === event.id) {
        setActiveEvent(event);
      }
    },
    [setActiveEvent],
  );

  const handleCharacterUpdate = useCallback((character: Character) => {
    setCharacters((prev) =>
      prev.map((c) => (c.id === character.id ? character : c)),
    );
  }, []);

  const handleHydrated = useCallback(() => setCanvasHydrating(false), []);

  const handleCanvasOp = useCallback((op: CanvasOpPayload) => {
    canvasRef.current?.applyCanvasOp(op);
  }, []);

  const handleExportUpdate = useCallback((exp: Export) => {
    setLiveExport(exp);
  }, []);

  const handleCanvasChange = useCallback(
    (konvaJson: object) => {
      if (!apiAvailable) return;

      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
      persistTimerRef.current = setTimeout(() => {
        void (async () => {
          try {
            const res = await fetch(`/api/projects/${project.id}/canvas`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ canvas_state: konvaJson }),
            });
            if (!res.ok) {
              throw new Error(await readApiError(res, "Failed to save canvas"));
            }
          } catch (err) {
            const message =
              err instanceof Error ? err.message : "Failed to save canvas";
            toastError(message);
          }
        })();
      }, CANVAS_PERSIST_MS);
    },
    [apiAvailable, project.id],
  );

  const realtimeHandlers = useMemo(
    () => ({
      onCanvasOp: handleCanvasOp,
      onPinUpdate: handlePinUpdate,
      onPinInsert: (pin: LocationPin) =>
        setPins((prev) => (prev.some((p) => p.id === pin.id) ? prev : [...prev, pin])),
      onPinDelete: (pinId: string) =>
        setPins((prev) => prev.filter((p) => p.id !== pinId)),
      onEventUpdate: handleEventUpdate,
      onEventInsert: (event: TimelineEvent) =>
        setEvents((prev) =>
          prev.some((e) => e.id === event.id)
            ? prev
            : [...prev, event].sort((a, b) => a.sequence_order - b.sequence_order),
        ),
      onEventDelete: (eventId: string) =>
        setEvents((prev) => prev.filter((e) => e.id !== eventId)),
      onExportUpdate: handleExportUpdate,
      onCharacterUpdate: handleCharacterUpdate,
      onCharacterInsert: (character: Character) =>
        setCharacters((prev) =>
          prev.some((c) => c.id === character.id) ? prev : [...prev, character],
        ),
      onCharacterDelete: (characterId: string) =>
        setCharacters((prev) => prev.filter((c) => c.id !== characterId)),
    }),
    [
      handleCanvasOp,
      handlePinUpdate,
      handleEventUpdate,
      handleExportUpdate,
      handleCharacterUpdate,
    ],
  );

  useProjectRealtime(project.id, realtimeHandlers);

  const sidebarContent = useMemo(() => {
    if (panelsBooting) {
      if (sidebarMode === "vault" || activeNav === "vault") {
        return <PanelSkeleton rows={4} />;
      }
      if (sidebarMode === "export" || activeNav === "export") {
        return <PanelSkeleton rows={3} />;
      }
    }
    if (sidebarMode === "vault") {
      return (
        <CharacterVault
          projectId={project.id}
          characters={characters}
          apiAvailable={apiAvailable}
          onCharactersChange={setCharacters}
        />
      );
    }
    if (sidebarMode === "export") {
      return (
        <ExportTerminal
          projectId={project.id}
          events={events}
          apiAvailable={apiAvailable}
          liveExport={liveExport}
          realtimeActive={true}
        />
      );
    }
    return (
      <p className="text-xs text-[#9ca3af]">
        Use the nav to open Character Vault or Export — or click a pin on the
        canvas.
      </p>
    );
  }, [
    panelsBooting,
    sidebarMode,
    activeNav,
    project.id,
    characters,
    events,
    apiAvailable,
    liveExport,
  ]);

  return (
    <div
      className="h-screen"
      style={{ ["--accent" as string]: accent }}
    >
      <ToastHost />
      <AppShell
        projectName={projectState.name}
        theme={projectState.theme}
        activeNav={activeNav}
        headerActions={
          apiAvailable && !isDemo ? (
            <>
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-md border border-[#2a2a2e] bg-[#1a1a1e] px-2.5 py-1.5 text-xs font-medium text-[#9ca3af] hover:text-white"
              >
                <Settings className="h-3.5 w-3.5" />
                Settings
              </button>
              <button
                type="button"
                onClick={() => setHistoryOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-md border border-[#2a2a2e] bg-[#1a1a1e] px-2.5 py-1.5 text-xs font-medium text-[#9ca3af] hover:text-white"
              >
                <History className="h-3.5 w-3.5" />
                History
              </button>
              <button
                type="button"
                onClick={() => setCopilotOpen((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-md border border-[#7c3aed]/50 bg-[#7c3aed]/10 px-2.5 py-1.5 text-xs font-medium text-[#a78bfa] hover:text-white"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Copilot
              </button>
            </>
          ) : null
        }
        onNavChange={(nav) => {
          setActiveNav(nav);
          if (nav === "vault") setSidebarMode("vault");
          else if (nav === "export") setSidebarMode("export");
          else setSidebarMode(null);
        }}
        onExportClick={() => setSidebarMode("export")}
        sidebarContent={sidebarContent}
        timelineContent={
          panelsBooting ? (
            <TimelineSkeleton />
          ) : (
            <TimelineStrip
              projectId={projectState.id}
              events={events}
              pins={pins}
              characters={characters}
              apiAvailable={apiAvailable}
              onEventsChange={setEvents}
              onPinSelect={(pin) => setSelectedPin(pin)}
            />
          )
        }
      >
        <ErrorBoundary>
          {isDemo ? (
            <p className="border-b border-[#7c3aed]/40 bg-[#7c3aed]/10 px-4 py-2 text-center text-xs text-[#e5e7eb]">
              Demo workspace (read-only).{" "}
              <Link
                href="/projects"
                className="font-medium text-[#a78bfa] underline-offset-2 hover:underline"
              >
                Open or create a project
              </Link>{" "}
              to save canvas, timeline, and vault changes.
            </p>
          ) : !apiAvailable ? (
            <p className="border-b border-[#2a2a2e] bg-[#1a1a1e] px-4 py-2 text-center text-xs text-[#9ca3af]">
              {PROJECT_API_UNAVAILABLE_MESSAGE}
            </p>
          ) : null}
          <GeographyCanvas
            ref={canvasRef}
            projectId={projectState.id}
            pins={pins}
            userId={userId}
            apiAvailable={apiAvailable}
            highlightedPinId={highlightedPinId}
            initialCanvasState={initialCanvasState}
            loading={canvasHydrating}
            onHydrated={handleHydrated}
            onPinsChange={setPins}
            onPinSelect={(pin) => {
              setSelectedPin(pin);
              setSidebarMode("pin");
            }}
            onCanvasChange={handleCanvasChange}
          />
        </ErrorBoundary>
      </AppShell>

      {sidebarMode === "pin" && selectedPin ? (
        <PinSidebar
          key={selectedPin.id}
          pin={selectedPin}
          projectId={project.id}
          apiAvailable={apiAvailable}
          onClose={() => {
            setSelectedPin(null);
            setSidebarMode(null);
          }}
          onPinUpdated={handlePinUpdate}
          onPinDeleted={(pinId) => {
            setPins((prev) => prev.filter((p) => p.id !== pinId));
            setSelectedPin(null);
          }}
        />
      ) : null}

      <ProjectSettingsModal
        project={projectState}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onProjectUpdated={setProjectState}
      />
      <HistorySidebar
        projectId={projectState.id}
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onReverted={() => window.location.reload()}
      />
      <CopilotPanel
        projectId={projectState.id}
        open={copilotOpen}
        onClose={() => setCopilotOpen(false)}
        events={events}
        onEventsChange={setEvents}
      />
    </div>
  );
}
