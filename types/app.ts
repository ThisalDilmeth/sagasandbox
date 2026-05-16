export type GenStatus = "pending" | "generating" | "done" | "error"
export type ExportType = "storyboard_pdf" | "audio_script" | "animatic_video"
export type ExportStatus = "queued" | "processing" | "done" | "error"
export type CharacterRole = "primary" | "secondary"

export type VisualTraits = {
  hair?: string
  build?: string
  clothing?: string
  features?: string
}

export type StyleConfig = {
  aesthetic?: string
  aesthetic_style?: string
  theme?: string
  tone?: string
}

export interface Project {
  id: string
  owner_id: string
  name: string
  theme: string
  aesthetic_style: string
  style_config: StyleConfig | null
  canvas_state: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export type ProjectInsert = Omit<Project, "id" | "created_at" | "updated_at">

export interface LocationPin {
  id: string
  project_id: string
  label: string
  canvas_x: number
  canvas_y: number
  description: string | null
  generated_image_url: string | null
  fal_request_id: string | null
  gen_status: string
  created_at: string
}

export interface TimelineEvent {
  id: string
  project_id: string
  pin_id: string | null
  title: string
  description: string | null
  sequence_order: number
  in_world_time: string | null
  generated_image_url: string | null
  audio_url: string | null
  fal_request_id: string | null
  gen_status: string
  is_ghost: boolean
  audio_summary: string | null
  created_at: string
}

export interface Character {
  id: string
  project_id: string
  name: string
  role: CharacterRole | null
  description: string | null
  visual_traits: VisualTraits | null
  reference_image_url: string | null
  generated_portrait_url: string | null
  fal_request_id: string | null
  gen_status: string
  voice_id: string | null
  created_at: string
}

export interface Export {
  id: string
  project_id: string
  type: ExportType
  event_ids: string[]
  status: ExportStatus
  output_url: string | null
  created_at: string
}

export type ProjectMember = {
  project_id: string
  user_id: string
  role: string
}

const GEN_STATUSES: GenStatus[] = ["pending", "generating", "done", "error"]

export function asGenStatus(value: string | null | undefined): GenStatus {
  if (value && GEN_STATUSES.includes(value as GenStatus)) {
    return value as GenStatus
  }
  return "pending"
}

export function getVisualTraits(
  traits: Character["visual_traits"],
): VisualTraits {
  if (!traits || typeof traits !== "object" || Array.isArray(traits)) {
    return {}
  }
  const t = traits as Record<string, unknown>
  return {
    hair: typeof t.hair === "string" ? t.hair : undefined,
    build: typeof t.build === "string" ? t.build : undefined,
    clothing: typeof t.clothing === "string" ? t.clothing : undefined,
    features: typeof t.features === "string" ? t.features : undefined,
  }
}
