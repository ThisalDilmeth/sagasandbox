import { NextResponse } from "next/server"

/** Local-only context — no auth required. */
export type LocalContext = { projectId?: string }

/** Always resolves; provided so API routes don't need to change their call sites. */
export async function requireAuth(): Promise<LocalContext> {
  return {}
}

export function isAuthError(_result: LocalContext | NextResponse): _result is NextResponse {
  return false
}

export function jsonError(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status })
}
