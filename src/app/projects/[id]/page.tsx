import { notFound } from "next/navigation"
import { WorkspaceClient } from "./WorkspaceClient"
import {
  getProject,
  listPins,
  listEvents,
  listCharacters,
} from "@/lib/local-store"

interface ProjectPageProps {
  params: Promise<{ id: string }>
}

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { id } = await params

  const [project, pins, events, characters] = await Promise.all([
    getProject(id),
    listPins(id),
    listEvents(id),
    listCharacters(id),
  ])

  if (!project) {
    notFound()
  }

  return (
    <WorkspaceClient
      project={project}
      initialPins={pins}
      initialEvents={events}
      initialCharacters={characters}
      initialCanvasState={project.canvas_state as Record<string, unknown>}
      apiAvailable={true}
    />
  )
}
