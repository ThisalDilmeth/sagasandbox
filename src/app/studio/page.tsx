import { redirect } from "next/navigation";
import { createProject } from "@/lib/local-store";

export const dynamic = "force-dynamic";

export default async function StudioIndexPage() {
  const project = await createProject({
    name: "Untitled scene",
    theme: "photorealistic",
    aesthetic_style: "cinematic, photorealistic",
    style_config: null,
    canvas_state: null,
  });
  console.log(`[studio/index] created project id=${project.id} redirecting`)
  redirect(`/studio/${project.id}`);
}
