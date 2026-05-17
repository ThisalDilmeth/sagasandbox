import { notFound } from "next/navigation";
import { getProject, listPins } from "@/lib/local-store";
import { StudioWorkspace } from "@/components/studio/StudioWorkspace";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

export default async function StudioPage({ params }: PageProps) {
  const { id } = await params;
  const [project, pins] = await Promise.all([getProject(id), listPins(id)]);
  if (!project) notFound();
  return <StudioWorkspace project={project} initialPins={pins} />;
}
