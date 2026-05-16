"use client";

import Link from "next/link";
import {
  Download,
  Map,
  Clock,
  Users,
  FileOutput,
  ChevronLeft,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { themeAccent } from "@/lib/constants";

export type SidebarNav = "canvas" | "timeline" | "vault" | "export";

export interface AppShellProps {
  projectName: string;
  theme: string;
  children?: React.ReactNode;
  sidebarContent?: React.ReactNode;
  timelineContent?: React.ReactNode;
  activeNav?: SidebarNav;
  onNavChange?: (nav: SidebarNav) => void;
  onExportClick?: () => void;
  headerActions?: React.ReactNode;
}

const NAV_ITEMS: { id: SidebarNav; label: string; icon: typeof Map }[] = [
  { id: "canvas", label: "Canvas", icon: Map },
  { id: "timeline", label: "Timeline", icon: Clock },
  { id: "vault", label: "Vault", icon: Users },
  { id: "export", label: "Export", icon: FileOutput },
];

export function AppShell({
  projectName,
  theme,
  children,
  sidebarContent,
  timelineContent,
  activeNav = "canvas",
  onNavChange,
  onExportClick,
  headerActions,
}: AppShellProps) {
  const accent = themeAccent(theme);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#0e0e0f] text-[#e5e7eb]">
      <header className="flex h-[52px] shrink-0 items-center justify-between border-b border-[#2a2a2e] px-4">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/projects"
            className="shrink-0 rounded-md p-1.5 text-[#9ca3af] transition hover:bg-[#252528] hover:text-[#e5e7eb]"
            title="Back to projects"
          >
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <h1 className="truncate text-lg font-semibold tracking-tight">
            {projectName}
          </h1>
          <span
            className="shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-medium uppercase tracking-wide"
            style={{
              borderColor: accent,
              color: accent,
            }}
          >
            {theme.replace(/_/g, " ")}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {headerActions}
          <button
            type="button"
            onClick={onExportClick}
            className="inline-flex items-center gap-2 rounded-md border border-[#2a2a2e] bg-[#1a1a1e] px-3 py-1.5 text-sm font-medium transition hover:border-[#7c3aed] hover:text-white"
          >
            <Download className="h-4 w-4" />
            Export
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-[220px] shrink-0 flex-col border-r border-[#2a2a2e] bg-[#1a1a1e] xl:w-[280px]">
          <nav className="flex flex-col gap-1 p-3">
            {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => onNavChange?.(id)}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition",
                  activeNav === id
                    ? "bg-[#2a2a2e] text-white"
                    : "text-[#9ca3af] hover:bg-[#252528] hover:text-[#e5e7eb]",
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </nav>
          <div className="min-h-0 flex-1 overflow-y-auto border-t border-[#2a2a2e] p-3">
            {sidebarContent}
          </div>
        </aside>

        <main className="relative min-w-0 flex-1">{children}</main>
      </div>

      <footer className="h-[100px] shrink-0 overflow-hidden border-t border-[#2a2a2e] bg-[#141416] xl:h-[120px]">
        {timelineContent}
      </footer>
    </div>
  );
}
