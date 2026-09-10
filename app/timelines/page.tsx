import Link from "next/link";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Task Timelines - ITSM Dependency Graph",
  description: "Browse available task timelines",
};

interface TimelineData {
  task?: {
    notion_id?: string;
    title?: string;
    status?: string;
    note?: string;
  };
}

export function generateStaticParams() {
  return [
    { id: 'example' },
    { id: '3d75dbdd-f0ea-8145-9a95-f418353a05b5' },
    { id: '3d65dbdd-f0ea-81f6-880f-e041eda42d5b' },
  ].map(({ id }) => ({ id }));
}

async function getTimelines(): Promise<Array<{ id: string; data: TimelineData }>> {
  const timelineIds = [
    'example',
    '3d75dbdd-f0ea-8145-9a95-f418353a05b5',
    '3d65dbdd-f0ea-81f6-880f-e041eda42d5b',
  ];

  const timelines = await Promise.all(
    timelineIds.map(async (id) => {
      try {
        const fs = await import('fs/promises');
        const path = await import('path');
        const filePath = path.join(process.cwd(), 'public', 'timelines', `${id}.json`);
        const content = await fs.readFile(filePath, 'utf-8');
        const data = JSON.parse(content) as TimelineData;
        return { id, data };
      } catch (error) {
        console.error(`Failed to load timeline ${id}:`, error);
        return { id, data: {} };
      }
    })
  );

  return timelines;
}

export default async function TimelinesPage() {
  const timelines = await getTimelines();

  const realTimelines = timelines.filter(t => t.id !== 'example');
  const exampleTimeline = timelines.find(t => t.id === 'example');

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <header className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Task Timelines</h1>
          <p className="text-slate-400">
            Browse timeline visualizations for completed and in-progress tasks
          </p>
        </header>

        <div className="mb-8">
          <Link 
            href="/" 
            className="inline-flex items-center text-purple-400 hover:text-purple-300 transition-colors"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Dependency Graph
          </Link>
        </div>

        {realTimelines.length > 0 && (
          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4 text-slate-200">Active Timelines</h2>
            <div className="space-y-3">
              {realTimelines.map(({ id, data }) => (
                <Link
                  key={id}
                  href={`/timelines/${id}`}
                  className="block p-4 bg-slate-800 hover:bg-slate-750 border border-slate-700 hover:border-slate-600 rounded-lg transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-slate-100 mb-1">
                        {data.task?.title || `Timeline ${id.slice(0, 8)}`}
                      </h3>
                      {data.task?.status && (
                        <div className="flex items-center gap-2 mb-1">
                          <span 
                            className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded ${
                              data.task.status === 'Done' 
                                ? 'bg-green-900/50 text-green-300 border border-green-700/50'
                                : 'bg-blue-900/50 text-blue-300 border border-blue-700/50'
                            }`}
                          >
                            {data.task.status}
                          </span>
                          {data.task.notion_id && (
                            <span className="text-xs text-slate-500">
                              {id.slice(0, 8)}
                            </span>
                          )}
                        </div>
                      )}
                      {data.task?.note && (
                        <p className="text-sm text-slate-400 line-clamp-2">
                          {data.task.note}
                        </p>
                      )}
                    </div>
                    <svg 
                      className="w-5 h-5 text-slate-500 flex-shrink-0 mt-1" 
                      fill="none" 
                      stroke="currentColor" 
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {exampleTimeline && (
          <section>
            <h2 className="text-xl font-semibold mb-4 text-slate-400">Example Timeline</h2>
            <Link
              href={`/timelines/${exampleTimeline.id}`}
              className="block p-4 bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 hover:border-slate-600 rounded-lg transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-slate-300 mb-1">
                    {exampleTimeline.data.task?.title || 'Example Timeline'}
                  </h3>
                  <p className="text-sm text-slate-500">
                    Sample timeline for reference and testing
                  </p>
                </div>
                <svg 
                  className="w-5 h-5 text-slate-600 flex-shrink-0 mt-1" 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </Link>
          </section>
        )}
      </div>
    </div>
  );
}
