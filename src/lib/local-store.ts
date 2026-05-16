/**
 * Local filesystem store — replaces Supabase for fully offline operation.
 * Data lives in <repo>/.data/ (gitignored). One JSON file per collection per project.
 */
import { promises as fs } from "fs"
import path from "path"
import { randomUUID } from "crypto"
import type {
  Project,
  ProjectInsert,
  LocationPin,
  TimelineEvent,
  Character,
  Export,
} from "@/types/app"

const DATA_DIR = path.join(process.cwd(), ".data")

async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true })
}

async function readJson<T>(file: string): Promise<T> {
  await ensureDir()
  try {
    const raw = await fs.readFile(path.join(DATA_DIR, file), "utf8")
    return JSON.parse(raw) as T
  } catch {
    return [] as unknown as T
  }
}

async function writeJson<T>(file: string, data: T) {
  await ensureDir()
  await fs.writeFile(path.join(DATA_DIR, file), JSON.stringify(data, null, 2), "utf8")
}

// ─── Projects ─────────────────────────────────────────────────────────────────

export async function listProjects(): Promise<Project[]> {
  return readJson<Project[]>("projects.json")
}

export async function getProject(id: string): Promise<Project | null> {
  const projects = await listProjects()
  return projects.find((p) => p.id === id) ?? null
}

export async function createProject(
  data: Omit<ProjectInsert, "owner_id">,
): Promise<Project> {
  const projects = await listProjects()
  const now = new Date().toISOString()
  const project: Project = {
    id: randomUUID(),
    owner_id: "local",
    name: data.name,
    theme: data.theme ?? "High Fantasy",
    aesthetic_style: data.aesthetic_style ?? "Cinematic",
    style_config: data.style_config ?? null,
    canvas_state: data.canvas_state ?? null,
    created_at: now,
    updated_at: now,
  }
  projects.push(project)
  await writeJson("projects.json", projects)
  return project
}

export async function updateProject(
  id: string,
  patch: Partial<Omit<Project, "id" | "created_at">>,
): Promise<Project | null> {
  const projects = await listProjects()
  const idx = projects.findIndex((p) => p.id === id)
  if (idx === -1) return null
  projects[idx] = { ...projects[idx], ...patch, updated_at: new Date().toISOString() }
  await writeJson("projects.json", projects)
  return projects[idx]
}

export async function deleteProject(id: string): Promise<void> {
  const projects = (await listProjects()).filter((p) => p.id !== id)
  await writeJson("projects.json", projects)
  // cascade: remove related collections
  await Promise.allSettled([
    fs.unlink(path.join(DATA_DIR, `pins-${id}.json`)),
    fs.unlink(path.join(DATA_DIR, `events-${id}.json`)),
    fs.unlink(path.join(DATA_DIR, `characters-${id}.json`)),
    fs.unlink(path.join(DATA_DIR, `exports-${id}.json`)),
  ])
}

// ─── Location Pins ─────────────────────────────────────────────────────────────

export async function listPins(projectId: string): Promise<LocationPin[]> {
  return readJson<LocationPin[]>(`pins-${projectId}.json`)
}

export async function getPin(
  projectId: string,
  id: string,
): Promise<LocationPin | null> {
  return (await listPins(projectId)).find((p) => p.id === id) ?? null
}

export async function createPin(
  projectId: string,
  data: Omit<LocationPin, "id" | "project_id" | "created_at">,
): Promise<LocationPin> {
  const pins = await listPins(projectId)
  const pin: LocationPin = {
    id: randomUUID(),
    project_id: projectId,
    created_at: new Date().toISOString(),
    ...data,
  }
  pins.push(pin)
  await writeJson(`pins-${projectId}.json`, pins)
  return pin
}

export async function updatePin(
  projectId: string,
  id: string,
  patch: Partial<Omit<LocationPin, "id" | "project_id" | "created_at">>,
): Promise<LocationPin | null> {
  const pins = await listPins(projectId)
  const idx = pins.findIndex((p) => p.id === id)
  if (idx === -1) return null
  pins[idx] = { ...pins[idx], ...patch }
  await writeJson(`pins-${projectId}.json`, pins)
  return pins[idx]
}

export async function deletePin(projectId: string, id: string): Promise<void> {
  const pins = (await listPins(projectId)).filter((p) => p.id !== id)
  await writeJson(`pins-${projectId}.json`, pins)
}

// ─── Timeline Events ──────────────────────────────────────────────────────────

export async function listEvents(projectId: string): Promise<TimelineEvent[]> {
  const events = await readJson<TimelineEvent[]>(`events-${projectId}.json`)
  return events.sort((a, b) => a.sequence_order - b.sequence_order)
}

export async function getEvent(
  projectId: string,
  id: string,
): Promise<TimelineEvent | null> {
  return (await listEvents(projectId)).find((e) => e.id === id) ?? null
}

export async function createEvent(
  projectId: string,
  data: Omit<TimelineEvent, "id" | "project_id" | "created_at">,
): Promise<TimelineEvent> {
  const events = await listEvents(projectId)
  const event: TimelineEvent = {
    id: randomUUID(),
    project_id: projectId,
    created_at: new Date().toISOString(),
    ...data,
  }
  events.push(event)
  await writeJson(`events-${projectId}.json`, events)
  return event
}

export async function updateEvent(
  projectId: string,
  id: string,
  patch: Partial<Omit<TimelineEvent, "id" | "project_id" | "created_at">>,
): Promise<TimelineEvent | null> {
  const events = await listEvents(projectId)
  const idx = events.findIndex((e) => e.id === id)
  if (idx === -1) return null
  events[idx] = { ...events[idx], ...patch }
  await writeJson(`events-${projectId}.json`, events)
  return events[idx]
}

export async function deleteEvent(projectId: string, id: string): Promise<void> {
  const events = (await listEvents(projectId)).filter((e) => e.id !== id)
  await writeJson(`events-${projectId}.json`, events)
}

// ─── Characters ────────────────────────────────────────────────────────────────

export async function listCharacters(projectId: string): Promise<Character[]> {
  return readJson<Character[]>(`characters-${projectId}.json`)
}

export async function getCharacter(
  projectId: string,
  id: string,
): Promise<Character | null> {
  return (await listCharacters(projectId)).find((c) => c.id === id) ?? null
}

export async function createCharacter(
  projectId: string,
  data: Omit<Character, "id" | "project_id" | "created_at">,
): Promise<Character> {
  const characters = await listCharacters(projectId)
  const character: Character = {
    id: randomUUID(),
    project_id: projectId,
    created_at: new Date().toISOString(),
    ...data,
  }
  characters.push(character)
  await writeJson(`characters-${projectId}.json`, characters)
  return character
}

export async function updateCharacter(
  projectId: string,
  id: string,
  patch: Partial<Omit<Character, "id" | "project_id" | "created_at">>,
): Promise<Character | null> {
  const characters = await listCharacters(projectId)
  const idx = characters.findIndex((c) => c.id === id)
  if (idx === -1) return null
  characters[idx] = { ...characters[idx], ...patch }
  await writeJson(`characters-${projectId}.json`, characters)
  return characters[idx]
}

export async function deleteCharacter(
  projectId: string,
  id: string,
): Promise<void> {
  const characters = (await listCharacters(projectId)).filter((c) => c.id !== id)
  await writeJson(`characters-${projectId}.json`, characters)
}

// ─── Exports ───────────────────────────────────────────────────────────────────

export async function listExports(projectId: string): Promise<Export[]> {
  return readJson<Export[]>(`exports-${projectId}.json`)
}

export async function getExport(
  projectId: string,
  id: string,
): Promise<Export | null> {
  return (await listExports(projectId)).find((e) => e.id === id) ?? null
}

export async function createExport(
  projectId: string,
  data: Omit<Export, "id" | "project_id" | "created_at">,
): Promise<Export> {
  const exports = await listExports(projectId)
  const exp: Export = {
    id: randomUUID(),
    project_id: projectId,
    created_at: new Date().toISOString(),
    ...data,
  }
  exports.push(exp)
  await writeJson(`exports-${projectId}.json`, exports)
  return exp
}

export async function updateExport(
  projectId: string,
  id: string,
  patch: Partial<Omit<Export, "id" | "project_id" | "created_at">>,
): Promise<Export | null> {
  const exports = await listExports(projectId)
  const idx = exports.findIndex((e) => e.id === id)
  if (idx === -1) return null
  exports[idx] = { ...exports[idx], ...patch }
  await writeJson(`exports-${projectId}.json`, exports)
  return exports[idx]
}
