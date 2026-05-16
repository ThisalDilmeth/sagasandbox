import { getProject, listPins, listEvents, listCharacters } from "@/lib/local-store"

/** Captures a project snapshot locally — no-op in local mode (returns null). */
export async function captureProjectSnapshot(
  _supabase: unknown,
  _projectId: string,
  _changeDescription?: string,
): Promise<string | null> {
  return null
}

/** Captures a snapshot using local store (without a supabase client). */
export async function captureLocalSnapshot(projectId: string) {
  const [project, pins, events, characters] = await Promise.all([
    getProject(projectId),
    listPins(projectId),
    listEvents(projectId),
    listCharacters(projectId),
  ])
  if (!project) return null
  return { project, pins, events, characters }
}
