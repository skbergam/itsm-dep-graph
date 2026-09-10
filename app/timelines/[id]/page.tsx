import TimelineView from "./TimelineView";

export function generateStaticParams() {
  return [
    { id: 'example' },
  ];
}

export default function TimelinePage() {
  return <TimelineView />;
}
