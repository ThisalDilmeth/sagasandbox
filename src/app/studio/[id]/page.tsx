import { notFound } from "next/navigation";
import { getProject, listPins } from "@/lib/local-store";
import { StudioWorkspace } from "@/components/studio/StudioWorkspace";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

export default async function StudioPage({ params }: PageProps) {
  const { id } = await params;
  console.log(`[studio/id] loading id=${id}`)
  const [project, pins] = await Promise.all([getProject(id), listPins(id)]);
  console.log(`[studio/id] project=${project ? 'FOUND' : 'NULL'} pins=${pins.length}`)
  if (!project) notFound();
  return <StudioWorkspace project={project} initialPins={pins} />;
}
