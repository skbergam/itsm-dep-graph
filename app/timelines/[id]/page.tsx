import TimelineView from "./TimelineView";
import fs from "fs";
import path from "path";

export function generateStaticParams() {
  // Dynamically discover all timeline JSON files in public/timelines/
  const timelinesDir = path.join(process.cwd(), "public", "timelines");
  
  try {
    const files = fs.readdirSync(timelinesDir);
    const timelineIds = files
      .filter((file) => file.endsWith(".json") && !file.startsWith("."))
      .map((file) => ({ id: file.replace(/\.json$/, "") }));
    
    return timelineIds;
  } catch (error) {
    // Fallback if directory doesn't exist or can't be read
    console.warn("Could not read timelines directory:", error);
    return [
      { id: 'example' },
      { id: '3d75dbdd-f0ea-8145-9a95-f418353a05b5' },
      { id: '3d65dbdd-f0ea-81f6-880f-e041eda42d5b' },
      { id: '3d75dbdd-f0ea-8127-ab07-d6423df3e06b' },
      { id: 'subagent-demo' },
    ];
  }
}

export default function TimelinePage() {
  return <TimelineView />;
}
