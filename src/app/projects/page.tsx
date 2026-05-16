import Link from "next/link"
import { ProjectsHeader } from "@/app/projects/projects-header"
import { listProjects } from "@/lib/local-store"

export default async function ProjectsPage() {
  const projects = await listProjects()

  return (
    <div className="min-h-screen bg-[#0e0e0f] px-6 py-10 text-[#e5e7eb]">
      <div className="mx-auto max-w-3xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-[#7c3aed]">
              SagaSandbox
            </p>
            <h1 className="mt-2 text-2xl font-semibold">Your universes</h1>
            <p className="mt-1 text-sm text-[#9ca3af]">
              Create and open collaborative story sandboxes.
            </p>
          </div>
          <ProjectsHeader />
        </div>
        <ul className="mt-8 space-y-3">
          {projects.length === 0 ? (
            <li className="rounded-lg border border-[#2a2a2e] bg-[#1a1a1e] p-4 text-sm text-[#9ca3af]">
              No universes yet. Create your first sandbox above to get started.
            </li>
          ) : (
            projects.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/projects/${p.id}`}
                  className="block rounded-lg border border-[#2a2a2e] bg-[#1a1a1e] p-4 transition hover:border-[#7c3aed]/50"
                >
                  <span className="font-medium">{p.name}</span>
                  <span className="ml-2 text-xs text-[#9ca3af]">
                    {p.theme} · {p.aesthetic_style}
                  </span>
                </Link>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  )
}
