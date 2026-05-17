import { redirect } from "next/navigation";
import { createProject } from "@/lib/local-store";

/**
 * GET /studio — creates a fresh scene and redirects to its workspace.
 * Users can also share /studio links to start fresh every time.
 */
export default async function StudioIndexPage() {
  const project = await createProject({
    name: "Untitled scene",
    theme: "photorealistic",
    aesthetic_style: "cinematic, photorealistic",
    style_config: null,
    canvas_state: null,
  });
  redirect(`/studio/${project.id}`);
}
