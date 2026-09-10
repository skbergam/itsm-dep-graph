import TimelineView from "./TimelineView";

export function generateStaticParams() {
  return [
    { id: 'example' },
    { id: '3d75dbdd-f0ea-8145-9a95-f418353a05b5' },
    { id: '3d65dbdd-f0ea-81f6-880f-e041eda42d5b' },
  ];
}

export default function TimelinePage() {
  return <TimelineView />;
}
