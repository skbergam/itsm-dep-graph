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
  const [viewMode, setViewMode] = useState<'spans' | 'timeline'>('timeline');
  
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

  // Calculate pie chart data (exclude wall)
  const pieData = [
    { kind: 'waiting_human', seconds: safeTimeline.totals.waiting_human_seconds, color: '#facc15', label: 'Waiting Human' },
    { kind: 'idle', seconds: safeTimeline.totals.idle_seconds, color: '#60a5fa', label: 'Idle' },
    { kind: 'stuck', seconds: safeTimeline.totals.stuck_seconds, color: '#ef4444', label: 'Stuck' },
    { kind: 'ci', seconds: safeTimeline.totals.ci_seconds, color: '#a855f7', label: 'CI' },
  ].filter(d => d.seconds > 0);

  const totalNonWall = pieData.reduce((sum, d) => sum + d.seconds, 0);

  // Generate pie chart SVG paths
  const generatePieChart = () => {
    if (totalNonWall === 0) return null;
    
    const radius = 80;
    const cx = 100;
    const cy = 100;
    let currentAngle = -90; // Start at top
    
    return pieData.map((data, idx) => {
      const percentage = data.seconds / totalNonWall;
      const angle = percentage * 360;
      const startAngle = (currentAngle * Math.PI) / 180;
      const endAngle = ((currentAngle + angle) * Math.PI) / 180;
      
      const x1 = cx + radius * Math.cos(startAngle);
      const y1 = cy + radius * Math.sin(startAngle);
      const x2 = cx + radius * Math.cos(endAngle);
      const y2 = cy + radius * Math.sin(endAngle);
      
      const largeArcFlag = angle > 180 ? 1 : 0;
      
      const pathData = [
        `M ${cx} ${cy}`,
        `L ${x1} ${y1}`,
        `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}`,
        'Z'
      ].join(' ');
      
      currentAngle += angle;
      
      return (
        <path
          key={idx}
          d={pathData}
          fill={data.color}
          stroke="white"
          strokeWidth="2"
        />
      );
    });
  };

  // Calculate timeline scale
  const timelineStart = new Date(safeTimeline.spans.find(s => s.kind === 'wall')?.start || safeTimeline.as_of).getTime();
  const timelineEnd = new Date(safeTimeline.spans.find(s => s.kind === 'wall')?.end || safeTimeline.as_of).getTime();
  const timelineRange = timelineEnd - timelineStart;

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
          
          <div className="flex gap-8 items-start">
            {/* Numeric totals */}
            <div className="flex-1">
              <div className="grid grid-cols-5 gap-4">
                {Object.entries(safeTimeline.totals).map(([key, seconds]) => {
                  const kind = key.replace('_seconds', '');
                  const label = spanKindLabels[kind] || key;
                  const color = spanKindColors[kind] || 'bg-gray-400';
                  const percentage = totalWall > 0 ? ((seconds / totalWall) * 100).toFixed(1) : '0';
                  
                  return (
                    <div key={key} className="text-center">
                      <div className={`${color} w-12 h-12 rounded-lg mx-auto mb-2 flex items-center justify-center text-white font-bold text-sm`}>
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

            {/* Pie chart (non-wall composition) */}
            {totalNonWall > 0 && (
              <div className="flex-shrink-0">
                <div className="text-xs font-medium text-gray-700 mb-2 text-center">Composition</div>
                <svg width="200" height="200" viewBox="0 0 200 200" className="mx-auto">
                  {generatePieChart()}
                </svg>
                <div className="mt-3 space-y-1">
                  {pieData.map((data, idx) => {
                    const percentage = ((data.seconds / totalNonWall) * 100).toFixed(1);
                    return (
                      <div key={idx} className="flex items-center gap-2 text-xs">
                        <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: data.color }} />
                        <span className="text-gray-700">{data.label}: {percentage}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Spans - with toggle */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              {viewMode === 'spans' ? 'Spans by Kind' : 'Timeline View'}
            </h2>
            <div className="flex gap-2 bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setViewMode('timeline')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  viewMode === 'timeline'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Timeline
              </button>
              <button
                onClick={() => setViewMode('spans')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  viewMode === 'spans'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Spans by Kind
              </button>
            </div>
          </div>

          {viewMode === 'timeline' ? (
            <div className="space-y-6">
              {/* Timeline axis header */}
              <div className="border-b border-gray-200 pb-2">
                <div className="flex justify-between text-xs text-gray-500">
                  <span>{formatTimestamp(safeTimeline.spans.find(s => s.kind === 'wall')?.start || safeTimeline.as_of)}</span>
                  <span>Wall: {humanizeDuration(totalWall)}</span>
                  <span>{formatTimestamp(safeTimeline.spans.find(s => s.kind === 'wall')?.end || safeTimeline.as_of)}</span>
                </div>
              </div>

              {/* WATERFALL: Rows for events and spans */}
              <div className="space-y-1">
                {(() => {
                  // Combine events and spans into unified timeline items
                  type TimelineItem = 
                    | { type: 'event'; t: number; data: typeof safeTimeline.events[0] }
                    | { type: 'span'; t: number; data: typeof safeTimeline.spans[0] };
                  
                  const items: TimelineItem[] = [
                    ...safeTimeline.events
                      .filter(e => e.type !== 'agent.slash_command') // Skip noise events
                      .map(e => ({ type: 'event' as const, t: new Date(e.t).getTime(), data: e })),
                    ...safeTimeline.spans
                      .filter(s => s.kind !== 'wall' && s.seconds > 0)
                      .map(s => ({ type: 'span' as const, t: new Date(s.start).getTime(), data: s }))
                  ];
                  
                  items.sort((a, b) => a.t - b.t);
                  
                  return items.map((item, idx) => {
                    if (item.type === 'event') {
                      const event = item.data;
                      const left = ((item.t - timelineStart) / timelineRange) * 100;
                      
                      return (
                        <div key={`evt-${idx}`} className="relative h-6 flex items-center">
                          {/* Dot at time position */}
                          <div 
                            className="absolute w-2 h-2 bg-blue-500 rounded-full hover:ring-2 hover:ring-blue-300 transition-all cursor-pointer group"
                            style={{ left: `${Math.max(0, Math.min(100, left))}%` }}
                            title={`${event.type} at ${formatTimestamp(event.t)}`}
                          >
                            {/* Tooltip on hover */}
                            <div className="absolute left-0 top-6 z-10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap">
                              {event.type}: {event.summary}
                            </div>
                          </div>
                          {/* Label */}
                          <span className="ml-2 text-xs text-gray-600 truncate" style={{ marginLeft: `calc(${Math.max(0, Math.min(100, left))}% + 8px)` }}>
                            {event.type}
                          </span>
                        </div>
                      );
                    } else {
                      const span = item.data;
                      const spanStart = new Date(span.start).getTime();
                      const spanEnd = span.end ? new Date(span.end).getTime() : timelineEnd;
                      const left = ((spanStart - timelineStart) / timelineRange) * 100;
                      const width = ((spanEnd - spanStart) / timelineRange) * 100;
                      const isOpen = !span.end;
                      
                      const colorClass = spanKindColors[span.kind] || 'bg-gray-400';
                      
                      return (
                        <div key={`span-${idx}`} className="relative h-6">
                          <div
                            className={`absolute h-5 ${colorClass} rounded opacity-90 hover:opacity-100 transition-opacity cursor-pointer group`}
                            style={{
                              left: `${Math.max(0, left)}%`,
                              width: `${Math.min(100 - left, width)}%`,
                            }}
                            title={`${spanKindLabels[span.kind]}: ${humanizeDuration(span.seconds)} (${formatTimestamp(span.start)} → ${span.end ? formatTimestamp(span.end) : 'ongoing'})`}
                          >
                            <div className="h-full flex items-center justify-center text-xs text-white font-medium opacity-0 group-hover:opacity-100 transition-opacity px-1">
                              {span.seconds > 60 && humanizeDuration(span.seconds)}
                            </div>
                            {isOpen && (
                              <div className="absolute right-0 top-0 bottom-0 w-1 bg-white opacity-50"></div>
                            )}
                          </div>
                        </div>
                      );
                    }
                  });
                })()}
              </div>

              {/* BOTTOM WALL-ACCOUNTING ROW */}
              <div className="pt-4 border-t border-gray-300">
                <div className="text-xs font-medium text-gray-700 mb-2">Wall Time Coverage</div>
                <svg width="100%" height="32" className="border border-gray-300 rounded">
                  {(() => {
                    // Build second-by-second coverage map
                    const coverage: { [second: number]: Set<string> } = {};
                    
                    for (let s = 0; s < totalWall; s++) {
                      coverage[s] = new Set();
                    }
                    
                    // Fill coverage from spans (excluding wall)
                    safeTimeline.spans
                      .filter(span => span.kind !== 'wall' && span.seconds > 0)
                      .forEach(span => {
                        const spanStart = Math.floor((new Date(span.start).getTime() - timelineStart) / 1000);
                        const spanEnd = span.end 
                          ? Math.floor((new Date(span.end).getTime() - timelineStart) / 1000)
                          : totalWall;
                        
                        for (let s = Math.max(0, spanStart); s < Math.min(totalWall, spanEnd); s++) {
                          coverage[s].add(span.kind);
                        }
                      });
                    
                    // Build segments with consistent kind sets
                    const segments: Array<{ start: number; end: number; kinds: string[] }> = [];
                    let currentKinds: string[] = [];
                    let segmentStart = 0;
                    
                    for (let s = 0; s < totalWall; s++) {
                      const kinds = Array.from(coverage[s]).sort();
                      const kindsKey = kinds.join(',');
                      const currentKey = currentKinds.join(',');
                      
                      if (kindsKey !== currentKey) {
                        if (s > segmentStart) {
                          segments.push({ start: segmentStart, end: s, kinds: currentKinds });
                        }
                        currentKinds = kinds;
                        segmentStart = s;
                      }
                    }
                    
                    // Final segment
                    if (totalWall > segmentStart) {
                      segments.push({ start: segmentStart, end: totalWall, kinds: currentKinds });
                    }
                    
                    // Render segments
                    return segments.map((seg, idx) => {
                      const x = (seg.start / totalWall) * 100;
                      const width = ((seg.end - seg.start) / totalWall) * 100;
                      
                      if (seg.kinds.length === 0) {
                        // Unknown/gray
                        return (
                          <rect
                            key={idx}
                            x={`${x}%`}
                            width={`${width}%`}
                            y="0"
                            height="32"
                            fill="#9ca3af"
                          />
                        );
                      } else if (seg.kinds.length === 1) {
                        // Single kind - solid color
                        const kind = seg.kinds[0];
                        const colorMap: Record<string, string> = {
                          waiting_human: '#facc15',
                          idle: '#60a5fa',
                          stuck: '#ef4444',
                          ci: '#a855f7',
                        };
                        const color = colorMap[kind] || '#9ca3af';
                        
                        return (
                          <rect
                            key={idx}
                            x={`${x}%`}
                            width={`${width}%`}
                            y="0"
                            height="32"
                            fill={color}
                            opacity="0.9"
                          />
                        );
                      } else {
                        // Multiple kinds - checkered pattern
                        const colorMap: Record<string, string> = {
                          waiting_human: '#facc15',
                          idle: '#60a5fa',
                          stuck: '#ef4444',
                          ci: '#a855f7',
                        };
                        
                        const colors = seg.kinds.map(k => colorMap[k] || '#9ca3af');
                        const patternId = `pattern-${idx}-${seg.kinds.join('-')}`;
                        
                        return (
                          <g key={idx}>
                            <defs>
                              <pattern
                                id={patternId}
                                x="0"
                                y="0"
                                width="8"
                                height="8"
                                patternUnits="userSpaceOnUse"
                              >
                                <rect width="8" height="8" fill={colors[0]} />
                                <path
                                  d="M 0 0 L 8 8 M -2 6 L 2 10 M 6 -2 L 10 2"
                                  stroke={colors[1] || colors[0]}
                                  strokeWidth="2"
                                />
                              </pattern>
                            </defs>
                            <rect
                              x={`${x}%`}
                              width={`${width}%`}
                              y="0"
                              height="32"
                              fill={`url(#${patternId})`}
                            />
                          </g>
                        );
                      }
                    });
                  })()}
                </svg>
                <div className="flex gap-4 mt-2 text-xs text-gray-600">
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-yellow-400 rounded" />
                    <span>Waiting Human</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-blue-400 rounded" />
                    <span>Idle</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-red-500 rounded" />
                    <span>Stuck</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-purple-400 rounded" />
                    <span>CI</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-gray-400 rounded" />
                    <span>Unknown</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
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
          )}
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
