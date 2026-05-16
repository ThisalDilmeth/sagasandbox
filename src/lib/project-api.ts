export const PROJECT_API_UNAVAILABLE_MESSAGE =
  "Connect Supabase and sign in to save changes to this project.";

/** Always true in local-only mode. */
export function isProjectApiAvailable(_projectId?: string): boolean {
  return true;
}

export async function readApiError(
  res: Response,
  fallback: string,
): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    if (body.error) return body.error;
  } catch {
    // ignore parse errors
  }
  return fallback;
}
