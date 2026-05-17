/**
 * Dual-mode store:
 *   – Local dev  (no BLOB_READ_WRITE_TOKEN): reads/writes JSON files in .data/
 *   – Production (BLOB_READ_WRITE_TOKEN set): reads/writes JSON blobs via @vercel/blob
 *
 * The public API is identical in both modes, so no call-site changes are needed.
 */
import { randomUUID } from "crypto"
import type {
  Project,
  ProjectInsert,
  LocationPin,
  TimelineEvent,
  Character,
  Export,
} from "@/types/app"

// ─── Storage backend ──────────────────────────────────────────────────────────

const USE_BLOB = !!process.env.BLOB_READ_WRITE_TOKEN

// ── Blob mode (Vercel production) ─────────────────────────────────────────────

async function blobRead<T>(key: string): Promise<T> {
  const { list } = await import("@vercel/blob")
  try {
    const { blobs } = await list({ prefix: `sagasandbox/${key}`, limit: 1 })
    if (!blobs.length) return [] as unknown as T
    const res = await fetch(blobs[0].downloadUrl, { cache: "no-store" })
    if (!res.ok) return [] as unknown as T
    return (await res.json()) as T
  } catch {
    return [] as unknown as T
  }
}

async function blobWrite<T>(key: string, data: T): Promise<void> {
  const { put } = await import("@vercel/blob")
  await put(`sagasandbox/${key}`, JSON.stringify(data, null, 2), {
    access: "private",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
  })
}

async function blobDelete(key: string): Promise<void> {
  const { list, del } = await import("@vercel/blob")
  try {
    const { blobs } = await list({ prefix: `sagasandbox/${key}` })
    if (blobs.length > 0) {
      await del(blobs.map((b) => b.url))
    }
  } catch {
    // already gone
  }
}

// ── Filesystem mode (local dev) ───────────────────────────────────────────────

import { promises as fs } from "fs"
import path from "path"

const DATA_DIR = path.join(process.cwd(), ".data")

async function fsRead<T>(file: string): Promise<T> {
  await fs.mkdir(DATA_DIR, { recursive: true })
  try {
    const raw = await fs.readFile(path.join(DATA_DIR, file), "utf8")
    return JSON.parse(raw) as T
  } catch {
    return [] as unknown as T
  }
}

async function fsWrite<T>(file: string, data: T): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true })
  await fs.writeFile(
    path.join(DATA_DIR, file),
    JSON.stringify(data, null, 2),
    "utf8",
  )
}

async function fsDelete(file: string): Promise<void> {
  try {
    await fs.unlink(path.join(DATA_DIR, file))
  } catch {
    // already gone
  }
}

// ── Unified helpers ───────────────────────────────────────────────────────────

function readJson<T>(key: string): Promise<T> {
  return USE_BLOB ? blobRead<T>(key) : fsRead<T>(key)
}
function writeJson<T>(key: string, data: T): Promise<void> {
  return USE_BLOB ? blobWrite(key, data) : fsWrite(key, data)
}
function deleteJson(key: string): Promise<void> {
  return USE_BLOB ? blobDelete(key) : fsDelete(key)
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
  await Promise.allSettled([
    deleteJson(`pins-${id}.json`),
    deleteJson(`events-${id}.json`),
    deleteJson(`characters-${id}.json`),
    deleteJson(`exports-${id}.json`),
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
