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
  redirect(`/studio/${project.id}`);
}
