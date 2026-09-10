import TimelineView from "../../TimelineView";

export function generateStaticParams() {
  // Generate paths for all archived timelines
  const archives = [
    { id: 'example', timestamp: '2026-09-10T18-54-00Z' },
    { id: '3d75dbdd-f0ea-8145-9a95-f418353a05b5', timestamp: '2026-09-10T19-26-57.992Z' },
    { id: '3d65dbdd-f0ea-81f6-880f-e041eda42d5b', timestamp: '2026-09-10T19-26-57.992Z' },
  ];

  return archives;
}

export default async function ArchivedTimelinePage({
  params,
}: {
  params: Promise<{ id: string; timestamp: string }>;
}) {
  const { timestamp } = await params;
  // The TimelineView component will handle loading the archived version
  return <TimelineView isArchive archiveTimestamp={timestamp} />;
}
