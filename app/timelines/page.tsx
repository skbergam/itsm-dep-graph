"use client";

import Link from "next/link";
import { useState, useEffect } from "react";

interface TimelineData {
  generated_at: string;
  task?: {
    notion_id?: string;
    title?: string;
    status?: string;
    note?: string;
  };
}

interface TimelineWithArchives {
  id: string;
  data: TimelineData;
  archives: Array<{ timestamp: string; data: TimelineData }>;
}

const TIMELINE_IDS = [
  'example',
  'subagent-demo',
  '3d75dbdd-f0ea-8145-9a95-f418353a05b5',
  '3d65dbdd-f0ea-81f6-880f-e041eda42d5b',
  '3d75dbdd-f0ea-8127-ab07-d6423df3e06b',
];

export default function TimelinesPage() {
  const [timelines, setTimelines] = useState<TimelineWithArchives[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadTimelines() {
      const loaded = await Promise.all(
        TIMELINE_IDS.map(async (id) => {
          try {
            // Load current version
            const currentRes = await fetch(`/timelines/${id}.json`);
            const currentData: TimelineData = currentRes.ok ? await currentRes.json() : {};

            // Load archives
            const archives: Array<{ timestamp: string; data: TimelineData }> = [];
            try {
              // Try to list archive files by attempting to fetch known timestamps
              // In production, this would need a manifest or directory listing
              const archiveDir = `/timelines/${id}/archive/`;
              
              // For now, we'll try to fetch a manifest file if it exists
              // Or we can generate one during build
              const archiveManifestRes = await fetch(`${archiveDir}manifest.json`);
              if (archiveManifestRes.ok) {
                const manifest: string[] = await archiveManifestRes.json();
                for (const timestamp of manifest) {
                  const archiveRes = await fetch(`${archiveDir}${timestamp}.json`);
                  if (archiveRes.ok) {
                    archives.push({
                      timestamp,
                      data: await archiveRes.json(),
                    });
                  }
                }
              }
            } catch (error) {
              console.warn(`No archives found for ${id}`);
            }

            return { id, data: currentData, archives };
          } catch (error) {
            console.error(`Failed to load timeline ${id}:`, error);
            return { id, data: {} as TimelineData, archives: [] };
          }
        })
      );
      setTimelines(loaded);
      setLoading(false);
    }

    loadTimelines();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 text-slate-100">
        <div className="container mx-auto px-4 py-8 max-w-4xl">
          <p className="text-slate-400">Loading timelines...</p>
        </div>
      </div>
    );
  }

  const realTimelines = timelines.filter(t => t.id !== 'example' && t.id !== 'subagent-demo');
  const exampleTimeline = timelines.find(t => t.id === 'example');
  const demoTimeline = timelines.find(t => t.id === 'subagent-demo');

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <header className="mb-8">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold mb-2">Task Timelines</h1>
              <p className="text-slate-400">
                Browse timeline visualizations for completed and in-progress tasks
              </p>
            </div>
            <button
              onClick={() => setShowArchived(!showArchived)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                showArchived
                  ? 'bg-purple-600 text-white hover:bg-purple-700'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {showArchived ? '✓ ' : ''}Include archived
            </button>
          </div>
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
              {realTimelines.map(({ id, data, archives }) => (
                <div key={id}>
                  <Link
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
                            {data.generated_at && (
                              <span className="text-xs text-slate-500">
                                Current: {new Date(data.generated_at).toLocaleString()}
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
                  
                  {showArchived && archives.length > 0 && (
                    <div className="ml-8 mt-2 space-y-2">
                      {archives.map((archive) => (
                        <Link
                          key={archive.timestamp}
                          href={`/timelines/${id}/archive/${archive.timestamp.replace(/:/g, '-')}`}
                          className="block p-3 bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 hover:border-slate-600 rounded-lg transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <svg className="w-4 h-4 text-slate-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                            </svg>
                            <div className="flex-1 text-sm">
                              <span className="text-slate-400">Archived: </span>
                              <span className="text-slate-300">{new Date(archive.timestamp).toLocaleString()}</span>
                            </div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {(demoTimeline || exampleTimeline) && (
          <section>
            <h2 className="text-xl font-semibold mb-4 text-slate-400">Demo & Example Timelines</h2>
            <div className="space-y-3">
              {demoTimeline && (
                <Link
                  href={`/timelines/${demoTimeline.id}`}
                  className="block p-4 bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 hover:border-slate-600 rounded-lg transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-slate-300 mb-1">
                        {demoTimeline.data.task?.title || 'Subagent Recovery Demo'}
                      </h3>
                      <p className="text-sm text-slate-500">
                        Demonstration of nested subagent span recovery (PJM-11)
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
              )}
              
              {exampleTimeline && (
                <>
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
                  
                  {showArchived && exampleTimeline.archives.length > 0 && (
                    <div className="ml-8 mt-2 space-y-2">
                      {exampleTimeline.archives.map((archive) => (
                        <Link
                          key={archive.timestamp}
                          href={`/timelines/${exampleTimeline.id}/archive/${archive.timestamp.replace(/:/g, '-')}`}
                          className="block p-3 bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 hover:border-slate-600 rounded-lg transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <svg className="w-4 h-4 text-slate-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                            </svg>
                            <div className="flex-1 text-sm">
                              <span className="text-slate-400">Archived: </span>
                              <span className="text-slate-300">{new Date(archive.timestamp).toLocaleString()}</span>
                            </div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
