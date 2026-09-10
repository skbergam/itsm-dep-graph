"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { TaskTimeline } from "@/types/timeline";
import { humanizeDuration, formatTimestamp } from "@/lib/timeline-utils";

export default function TimelineView() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  
  const [timeline, setTimeline] = useState<TaskTimeline | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Guard against missing/invalid timeline data
  const safeTimeline = timeline && {
    ...timeline,
    links: {
      eng_prs: Array.isArray(timeline.links?.eng_prs) ? timeline.links.eng_prs : [],
      prs: Array.isArray(timeline.links?.prs) ? timeline.links.prs : [],
      agents: Array.isArray(timeline.links?.agents) ? timeline.links.agents : [],
    },
    events: Array.isArray(timeline.events) ? timeline.events : [],
    spans: Array.isArray(timeline.spans) ? timeline.spans : [],
    omissions: Array.isArray(timeline.omissions) ? timeline.omissions : [],
  };

  useEffect(() => {
    async function loadTimeline() {
      try {
        const response = await fetch(`/timelines/${id}.json`);
        if (!response.ok) {
          throw new Error(`Failed to load timeline: ${response.statusText}`);
        }
        const data = await response.json();
        setTimeline(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }

    loadTimeline();
  }, [id]);

  if (loading) {
    return (
      <div className="bg-gray-50 p-8">
        <div className="max-w-6xl mx-auto">
          <p className="text-gray-600">Loading timeline...</p>
        </div>
      </div>
    );
  }

  if (error || !safeTimeline) {
    return (
      <div className="bg-gray-50 p-8">
        <div className="max-w-6xl mx-auto">
          <div className="mb-4">
            <button
              onClick={() => router.push('/')}
              className="text-blue-600 hover:text-blue-800 text-sm"
            >
              ← Back to Home
            </button>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <h2 className="text-red-800 font-semibold mb-2">Error Loading Timeline</h2>
            <p className="text-red-700">{error || 'Timeline not found'}</p>
          </div>
        </div>
      </div>
    );
  }

  const spanKindColors: Record<string, string> = {
    wall: 'bg-gray-400',
    waiting_human: 'bg-yellow-400',
    idle: 'bg-blue-400',
    stuck: 'bg-red-500',
    ci: 'bg-purple-400',
  };

  const spanKindLabels: Record<string, string> = {
    wall: 'Wall Time',
    waiting_human: 'Waiting Human',
    idle: 'Idle',
    stuck: 'Stuck',
    ci: 'CI',
  };

  const totalWall = safeTimeline.totals.wall_seconds;

  return (
    <div className="bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        {/* Navigation */}
        <div className="mb-6">
          <button
            onClick={() => router.push('/')}
            className="text-blue-600 hover:text-blue-800 text-sm font-medium"
          >
            ← Back to Home
          </button>
        </div>

        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">
                {safeTimeline.task.title}
              </h1>
              <div className="flex items-center gap-4 text-sm text-gray-600">
                <span className="inline-flex items-center gap-1.5">
                  <span className={`inline-block w-2 h-2 rounded-full ${safeTimeline.task.running ? 'bg-green-500' : 'bg-gray-400'}`} />
                  {safeTimeline.task.status}
                </span>
                <a
                  href={safeTimeline.task.notion_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800"
                >
                  View in Notion →
                </a>
              </div>
            </div>
            <div className="text-right text-sm text-gray-500">
              <div>Generated: {formatTimestamp(safeTimeline.generated_at)}</div>
              <div>As of: {formatTimestamp(safeTimeline.as_of)}</div>
            </div>
          </div>

          {/* Links */}
          {(safeTimeline.links.eng_prs.length > 0 || safeTimeline.links.prs.length > 0 || safeTimeline.links.agents.length > 0) && (
            <div className="border-t border-gray-200 pt-4 mt-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                {safeTimeline.links.eng_prs.length > 0 && (
                  <div>
                    <h3 className="font-medium text-gray-700 mb-2">Engineering PRs</h3>
                    <ul className="space-y-1">
                      {safeTimeline.links.eng_prs.map((pr, idx) => {
                        const url = typeof pr === 'string' ? pr : (pr.url || pr.href || '');
                        const label = typeof pr === 'string' 
                          ? pr.split('/').slice(-2).join('/')
                          : (pr.title || url.split('/').slice(-2).join('/') || `PR ${idx + 1}`);
                        
                        return url ? (
                          <li key={idx}>
                            <a
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-800 break-all"
                            >
                              {label}
                            </a>
                          </li>
                        ) : null;
                      })}
                    </ul>
                  </div>
                )}
                {safeTimeline.links.prs.length > 0 && (
                  <div>
                    <h3 className="font-medium text-gray-700 mb-2">Pull Requests</h3>
                    <ul className="space-y-1">
                      {safeTimeline.links.prs.map((pr, idx) => {
                        const url = typeof pr === 'string' ? pr : (pr.url || pr.href || '');
                        const label = typeof pr === 'string'
                          ? pr.split('/').slice(-2).join('/')
                          : (pr.title || `#${pr.number}` || url.split('/').slice(-2).join('/') || `PR ${idx + 1}`);
                        
                        return url ? (
                          <li key={idx}>
                            <a
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-800 break-all"
                            >
                              {label}
                            </a>
                          </li>
                        ) : null;
                      })}
                    </ul>
                  </div>
                )}
                {safeTimeline.links.agents.length > 0 && (
                  <div>
                    <h3 className="font-medium text-gray-700 mb-2">Agents</h3>
                    <ul className="space-y-1">
                      {safeTimeline.links.agents.map((agent, idx) => {
                        const url = typeof agent === 'string' ? agent : (agent.url || agent.href || '');
                        const label = typeof agent === 'string'
                          ? agent.split('/').pop()
                          : (agent.title || agent.id || url.split('/').pop() || `Agent ${idx + 1}`);
                        
                        return url ? (
                          <li key={idx}>
                            <a
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-800 break-all"
                            >
                              {label}
                            </a>
                          </li>
                        ) : null;
                      })}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Totals */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Time Totals</h2>
          <div className="grid grid-cols-5 gap-4">
            {Object.entries(safeTimeline.totals).map(([key, seconds]) => {
              const label = spanKindLabels[key.replace('_seconds', '')] || key;
              const color = spanKindColors[key.replace('_seconds', '')] || 'bg-gray-400';
              const percentage = totalWall > 0 ? ((seconds / totalWall) * 100).toFixed(1) : '0';
              
              return (
                <div key={key} className="text-center">
                  <div className={`${color} w-12 h-12 rounded-lg mx-auto mb-2 flex items-center justify-center text-white font-bold`}>
                    {percentage}%
                  </div>
                  <div className="text-xs font-medium text-gray-700 mb-1">{label}</div>
                  <div className="text-sm font-semibold text-gray-900">{humanizeDuration(seconds)}</div>
                  <div className="text-xs text-gray-500">{seconds.toLocaleString()}s</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Spans */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Spans by Kind</h2>
          <div className="space-y-3">
            {safeTimeline.spans.map((span, idx) => (
              <div key={idx} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className={`${spanKindColors[span.kind]} w-3 h-3 rounded`} />
                    <span className="font-medium text-gray-900">{spanKindLabels[span.kind]}</span>
                  </div>
                  <span className="text-sm font-semibold text-gray-700">
                    {humanizeDuration(span.seconds)}
                  </span>
                </div>
                <div className="text-xs text-gray-600 flex gap-4">
                  <span>Start: {formatTimestamp(span.start)}</span>
                  <span>End: {formatTimestamp(span.end)}</span>
                  <span className="text-gray-500">{span.seconds}s</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Events */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Event Timeline</h2>
          <div className="space-y-2">
            {safeTimeline.events.map((event) => (
              <div key={event.id} className="border-l-4 border-blue-500 pl-4 py-2">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-mono bg-gray-100 px-2 py-0.5 rounded text-gray-700">
                        {event.type}
                      </span>
                      <span className="text-xs text-gray-500">{event.source}</span>
                    </div>
                    <p className="text-sm text-gray-900 mb-1">{event.summary}</p>
                    {event.source_ref && (
                      <a
                        href={event.source_ref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:text-blue-800 break-all"
                      >
                        {event.source_ref}
                      </a>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 whitespace-nowrap">
                    {formatTimestamp(event.t)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Omissions */}
        {safeTimeline.omissions.length > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mt-6">
            <h2 className="text-lg font-semibold text-yellow-900 mb-4">Omissions</h2>
            <ul className="space-y-2">
              {safeTimeline.omissions.map((omission, idx) => (
                <li key={idx} className="text-sm">
                  <span className="font-medium text-yellow-900">{omission.wanted}:</span>{' '}
                  <span className="text-yellow-800">{omission.reason}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
