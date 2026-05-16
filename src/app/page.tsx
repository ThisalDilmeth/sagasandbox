import { redirect } from "next/navigation";
import { listProjects } from "@/lib/local-store";

export default async function HomePage() {
  const projects = await listProjects();
  if (projects.length > 0) {
    redirect(`/projects/${projects[0].id}`);
  }
  redirect("/projects");
}
