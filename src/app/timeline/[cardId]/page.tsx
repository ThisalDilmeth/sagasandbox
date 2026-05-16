import { CardEditorClient } from "./CardEditorClient";

type PageProps = { params: Promise<{ cardId: string }> };

export default async function CardEditorPage({ params }: PageProps) {
  const { cardId } = await params;
  return <CardEditorClient cardId={cardId} />;
}
