"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import type { TaskTimeline } from "@/types/timeline";
import { humanizeDuration, formatTimestamp, formatAgentUsage, type AgentUsage } from "@/lib/timeline-utils";

// Timeline item types
type TimelineItem = 
  | { type: 'event'; t: number; data: { id: string; type: string; t: string; source: string; summary: string; source_ref?: string; meta?: Record<string, unknown> & { usage?: AgentUsage; agent_id?: string } } }
  | { type: 'span'; t: number; data: { kind: string; start: string; end: string | null; seconds: number; meta?: { usage?: AgentUsage; agent_id?: string; [key: string]: unknown } } };

type SpanGroup = {
  type: 'span-group';
  kind: string;
  spans: Array<{ type: 'span'; t: number; data: { kind: string; start: string; end: string | null; seconds: number; meta?: { usage?: AgentUsage; agent_id?: string; [key: string]: unknown } } }>;
  startIdx: number;
};

type EventGroup = {
  type: 'event-group';
  eventType: string;
  events: Array<{ type: 'event'; t: number; data: { id: string; type: string; t: string; source: string; summary: string; source_ref?: string; meta?: Record<string, unknown> & { usage?: AgentUsage; agent_id?: string } } }>;
  startIdx: number;
};

// Event type color mapping - single source of truth for hues
// Each event type gets a unique hue for consistent coloring across dots, bars, and hover highlights
const eventTypeColors: Record<string, string> = {
  'git.commit': '#10b981',      // green-500
  'git.push': '#3b82f6',        // blue-500
  'git.branch': '#8b5cf6',      // violet-500
  'pr.created': '#f59e0b',      // amber-500
  'pr.updated': '#f97316',      // orange-500
  'pr.merged': '#22c55e',       // green-500
  'pr.closed': '#ef4444',       // red-500
  'pr.set_to_draft': '#ec4899', // pink-500
  'pr.ready_for_review': '#a78bfa', // violet-400 (different from git.branch)
  'pr.draft_changed': '#ec4899', // pink-500
  'pr.status_changed': '#f59e0b', // amber-500
  'ci.started': '#a855f7',      // purple-500
  'ci.ended': '#7c3aed',        // purple-600
  'agent.started': '#06b6d4',   // cyan-500
  'agent.ended': '#0891b2',     // cyan-600
  'deploy.completed': '#14b8a6', // teal-500 (unique hue for deploy events)
  'deploy.started': '#0d9488',   // teal-600
  'default': '#6366f1',         // indigo-500
};

function getEventColor(eventType: string, event?: { summary: string; meta?: Record<string, unknown> }): string {
  // Handle PR events with state-specific colors
  if (eventType === 'pr.draft_changed' && event) {
    const to = event.meta?.to as string;
    if (to === 'draft') {
      return eventTypeColors['pr.set_to_draft'];
    } else if (to === 'ready_for_review' || to === 'ready') {
      return eventTypeColors['pr.ready_for_review'];
    }
  }
  
  if (eventType === 'pr.status_changed' && event) {
    const to = event.meta?.to as string;
    if (to === 'merged') {
      return eventTypeColors['pr.merged'];
    } else if (to === 'closed') {
      return eventTypeColors['pr.closed'];
    }
  }
  
  return eventTypeColors[eventType] || eventTypeColors.default;
}

// Convert hex color to rgba with specified opacity for hover highlights
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getFriendlyEventTypeName(eventType: string, event?: { summary: string; meta?: Record<string, unknown> }): string {
  // Extract PR number from event if available
  const getPRNumber = (): string | null => {
    if (!event) return null;
    
    // Try meta.number first
    if (event.meta?.number) {
      return `#${event.meta.number}`;
    }
    
    // Try meta.pr (for deploy events)
    if (event.meta?.pr) {
      return `#${event.meta.pr}`;
    }
    
    // Try to extract from summary (e.g., "PR #178 opened")
    const match = event.summary?.match(/#(\d+)/);
    if (match) {
      return `#${match[1]}`;
    }
    
    return null;
  };
  
  // Handle deploy events with PR numbers
  if (eventType === 'deploy.completed') {
    const prNumber = getPRNumber() || '#???';
    return `PR ${prNumber} Deployed`;
  }
  
  if (eventType === 'deploy.started') {
    const prNumber = getPRNumber() || '#???';
    return `PR ${prNumber} Deploy Started`;
  }
  
  // Handle PR events with specific states and numbers
  if (eventType.startsWith('pr.')) {
    const prNumber = getPRNumber() || '#???';
    
    if (eventType === 'pr.created') {
      return `PR ${prNumber} Created`;
    }
    
    if (eventType === 'pr.draft_changed') {
      const to = event?.meta?.to as string;
      if (to === 'draft') {
        return `PR ${prNumber} Set to Draft`;
      } else if (to === 'ready_for_review' || to === 'ready') {
        return `PR ${prNumber} Ready for Review`;
      }
      return `PR ${prNumber} Draft Status Changed`;
    }
    
    if (eventType === 'pr.status_changed') {
      const to = event?.meta?.to as string;
      if (to === 'merged') {
        return `PR ${prNumber} Merged`;
      } else if (to === 'closed') {
        return `PR ${prNumber} Closed`;
      } else if (to === 'open') {
        return `PR ${prNumber} Reopened`;
      }
      return `PR ${prNumber} Status Changed`;
    }
    
    if (eventType === 'pr.updated') {
      return `PR ${prNumber} Updated`;
    }
  }
  
  const friendlyNames: Record<string, string> = {
    // Git events
    'git.commit': 'Commit',
    'git.push': 'Push',
    'git.branch': 'Branch',
    
    // CI events
    'ci.started': 'CI Started',
    'ci.ended': 'CI Ended',
    
    // Agent events
    'agent.started': 'Agent Started',
    'agent.ended': 'Agent Ended',
    'agent.slash_command': 'Agent Command',
    
    // Subagent events
    'subagent.started': 'Subagent Started',
    'subagent.ended': 'Subagent Ended',
    
    // Task events
    'task.created': 'Task Created',
    'task.status_changed': 'Task Status Changed',
    'task.bot_changed': 'Task Bot Changed',
    
    // Human interaction events
    'human.approval_requested': 'Approval Requested',
    'human.approval_received': 'Approval Received',
    
    // Board events
    'board.stage_changed': 'Board Stage Changed',
    
    // Todo events
    'todo.created': 'Todo Created',
    'todo.completed': 'Todo Completed',
    'todo.updated': 'Todo Updated',
    
    // Note events
    'note': 'Note',
    'note.created': 'Note Created',
    'note.updated': 'Note Updated',
  };
  
  // If we have a friendly name, use it
  if (friendlyNames[eventType]) {
    return friendlyNames[eventType];
  }
  
  // Fallback: title-case the last segment after the dot
  // e.g., "foo.bar_baz" → "Bar Baz"
  const lastSegment = eventType.split('.').pop() || eventType;
  return lastSegment
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

// Event group row component
interface EventGroupRowProps {
  group: EventGroup;
  timelineStart: number;
  timelineEnd: number;
  timelineRange: number;
  highlightedRowIndex: number | null;
  setHighlightedRowIndex: (idx: number | null) => void;
  waterFallContainerRef: React.RefObject<HTMLDivElement | null>;
}

function EventGroupRow({
  group,
  timelineStart,
  timelineEnd,
  timelineRange,
  highlightedRowIndex,
  setHighlightedRowIndex,
  waterFallContainerRef
}: EventGroupRowProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [chevronHovered, setChevronHovered] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = rowRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setHighlightedRowIndex(group.startIdx);
          }
        });
      },
      {
        root: waterFallContainerRef.current,
        threshold: 0.5,
      }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [group.startIdx, waterFallContainerRef, setHighlightedRowIndex]);

  const isHighlighted = highlightedRowIndex === group.startIdx;
  const eventColor = getEventColor(group.eventType, group.events[0]?.data);
  const friendlyTypeName = getFriendlyEventTypeName(group.eventType, group.events[0]?.data);
  
  // Derive light hover tint from the event's hue
  const hoverBgColor = hexToRgba(eventColor, 0.05);
  
  if (isExpanded) {
    return (
      <>
        {group.events.map((event, idx) => (
          <WaterfallRow
            key={`event-${group.startIdx}-${idx}`}
            item={event}
            idx={group.startIdx + idx}
            timelineStart={timelineStart}
            timelineEnd={timelineEnd}
            timelineRange={timelineRange}
            spanKindColors={{}}
            spanKindLabels={{}}
            highlightedRowIndex={highlightedRowIndex}
            setHighlightedRowIndex={setHighlightedRowIndex}
            waterFallContainerRef={waterFallContainerRef}
            showChevron={idx === 0}
            onChevronClick={idx === 0 ? () => setIsExpanded(false) : undefined}
            isChevronExpanded={true}
          />
        ))}
      </>
    );
  }

  return (
    <div
      ref={rowRef}
      className={`relative h-6 transition-colors ${
        isHighlighted ? 'border-l-2' : isHovered ? 'border-l-2' : ''
      }`}
      style={{ 
        backgroundColor: isHovered ? hoverBgColor : 'transparent',
        borderLeftColor: isHighlighted || isHovered ? eventColor : 'transparent'
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="absolute top-0 h-full flex items-center px-2 z-10" style={{ left: '-192px', width: '168px' }}>
        <span className="text-xs text-gray-600 truncate">
          {friendlyTypeName}
        </span>
      </div>
      
      <div 
        className="absolute w-6 top-0 h-full flex items-center justify-center z-20 cursor-pointer"
        style={{ left: '-24px' }}
        onClick={(e) => {
          e.stopPropagation();
          setIsExpanded(true);
        }}
        onMouseEnter={() => setChevronHovered(true)}
        onMouseLeave={() => setChevronHovered(false)}
      >
        <svg 
          width="12" 
          height="12" 
          viewBox="0 0 12 12" 
          fill="none" 
          className="transition-transform"
        >
          <path 
            d="M4 3 L7 6 L4 9" 
            stroke={chevronHovered ? '#3b82f6' : '#9ca3af'} 
            strokeWidth="1.5" 
            strokeLinecap="round" 
            strokeLinejoin="round"
          />
        </svg>
      </div>
      
      {group.events.map((event, idx) => {
        const left = ((event.t - timelineStart) / timelineRange) * 100;
        return (
          <div
            key={idx}
            className="absolute w-2 h-2 rounded-full z-10"
            style={{
              left: `calc(${Math.max(0, Math.min(100, left))}%)`,
              backgroundColor: eventColor,
              top: '50%',
              transform: 'translateY(-50%)'
            }}
          />
        );
      })}
      
      {isHovered && (
        <div className="absolute left-0 top-0 h-full flex items-center z-20 pointer-events-none ml-2">
          <span className="text-xs font-medium text-gray-900 bg-white px-2 py-1 rounded shadow-sm">
            {group.events.length}× events
          </span>
        </div>
      )}
      
      <div className="absolute right-2 top-0 h-full flex items-center z-20 pointer-events-none">
        <span className="text-xs text-gray-500 bg-white px-1 rounded">
          {group.events.length}×
        </span>
      </div>
    </div>
  );
}

// Collapsible span group component
interface SpanGroupRowProps {
  group: SpanGroup;
  timelineStart: number;
  timelineEnd: number;
  timelineRange: number;
  spanKindColors: Record<string, string>;
  spanKindLabels: Record<string, string>;
  highlightedRowIndex: number | null;
  setHighlightedRowIndex: (idx: number | null) => void;
  waterFallContainerRef: React.RefObject<HTMLDivElement | null>;
}

function SpanGroupRow({
  group,
  timelineStart,
  timelineEnd,
  timelineRange,
  spanKindColors,
  spanKindLabels,
  highlightedRowIndex,
  setHighlightedRowIndex,
  waterFallContainerRef
}: SpanGroupRowProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [chevronHovered, setChevronHovered] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = rowRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setHighlightedRowIndex(group.startIdx);
          }
        });
      },
      {
        root: waterFallContainerRef.current,
        threshold: 0.5,
      }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [group.startIdx, waterFallContainerRef, setHighlightedRowIndex]);

  const isHighlighted = highlightedRowIndex === group.startIdx;
  const colorClass = spanKindColors[group.kind] || 'bg-gray-400';
  const totalSeconds = group.spans.reduce((sum, span) => sum + span.data.seconds, 0);
  
  const baseColorMap: Record<string, string> = {
    'bg-yellow-400': 'rgba(250, 204, 21, 0.1)',
    'bg-blue-400': 'rgba(96, 165, 250, 0.1)',
    'bg-red-500': 'rgba(239, 68, 68, 0.1)',
    'bg-purple-400': 'rgba(168, 85, 247, 0.1)',
    'bg-gray-400': 'rgba(156, 163, 175, 0.1)',
    'bg-cyan-400': 'rgba(34, 211, 238, 0.1)',
  };
  const hoverTint = baseColorMap[colorClass] || 'rgba(156, 163, 175, 0.1)';
  
  // Get solid color for border from colorClass
  const borderColorMap: Record<string, string> = {
    'bg-yellow-400': '#facc15',
    'bg-blue-400': '#60a5fa',
    'bg-red-500': '#ef4444',
    'bg-purple-400': '#a855f7',
    'bg-gray-400': '#9ca3af',
    'bg-cyan-400': '#22d3ee',
  };
  const borderColor = borderColorMap[colorClass] || '#9ca3af';

  if (isExpanded) {
    return (
      <>
        {group.spans.map((span, idx) => (
          <WaterfallRow
            key={`span-${group.startIdx}-${idx}`}
            item={span}
            idx={group.startIdx + idx}
            timelineStart={timelineStart}
            timelineEnd={timelineEnd}
            timelineRange={timelineRange}
            spanKindColors={spanKindColors}
            spanKindLabels={spanKindLabels}
            highlightedRowIndex={highlightedRowIndex}
            setHighlightedRowIndex={setHighlightedRowIndex}
            waterFallContainerRef={waterFallContainerRef}
            groupColorClass={colorClass}
            showChevron={idx === 0}
            onChevronClick={idx === 0 ? () => setIsExpanded(false) : undefined}
            isChevronExpanded={true}
          />
        ))}
      </>
    );
  }

  return (
    <div
      ref={rowRef}
      className={`relative h-6 transition-colors ${
        isHighlighted ? 'border-l-2' : isHovered ? 'border-l-2' : ''
      }`}
      style={{ 
        backgroundColor: isHovered ? hoverTint : 'transparent',
        borderLeftColor: isHighlighted || isHovered ? borderColor : 'transparent'
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="absolute top-0 h-full flex items-center px-2 z-10" style={{ left: '-192px', width: '168px' }}>
        <span className="text-xs text-gray-600 truncate">
          {spanKindLabels[group.kind] || group.kind}
        </span>
      </div>
      
      <div 
        className="absolute w-6 top-0 h-full flex items-center justify-center z-20 cursor-pointer"
        style={{ left: '-24px' }}
        onClick={(e) => {
          e.stopPropagation();
          setIsExpanded(true);
        }}
        onMouseEnter={() => setChevronHovered(true)}
        onMouseLeave={() => setChevronHovered(false)}
      >
        <svg 
          width="12" 
          height="12" 
          viewBox="0 0 12 12" 
          fill="none" 
          className="transition-transform"
        >
          <path 
            d="M4 3 L7 6 L4 9" 
            stroke={chevronHovered ? '#3b82f6' : '#9ca3af'} 
            strokeWidth="1.5" 
            strokeLinecap="round" 
            strokeLinejoin="round"
          />
        </svg>
      </div>
      
      {group.spans.map((span, idx) => {
        const spanStart = new Date(span.data.start).getTime();
        const spanEnd = span.data.end ? new Date(span.data.end).getTime() : timelineEnd;
        const left = ((spanStart - timelineStart) / timelineRange) * 100;
        const width = ((spanEnd - spanStart) / timelineRange) * 100;
        const isOpen = !span.data.end;

        return (
          <div
            key={idx}
            className={`absolute h-5 ${colorClass} rounded opacity-90 z-10`}
            style={{
              left: `${Math.max(0, left)}%`,
              width: `${Math.min(100 - left, width)}%`,
            }}
          >
            {isOpen && (
              <div className="absolute right-0 top-0 bottom-0 w-1 bg-white opacity-50"></div>
            )}
          </div>
        );
      })}
      
      {isHovered && (
        <div className="absolute left-0 top-0 h-full flex items-center z-20 pointer-events-none ml-2">
          <span className="text-xs font-medium text-gray-900 bg-white px-2 py-1 rounded shadow-sm">
            {group.spans.length}× spans: {humanizeDuration(totalSeconds)} total
          </span>
        </div>
      )}
      
      <div className="absolute right-2 top-0 h-full flex items-center z-20 pointer-events-none">
        <span className="text-xs text-gray-500 bg-white px-1 rounded">
          {group.spans.length}×
        </span>
      </div>
    </div>
  );
}

// WaterfallRow component extracted to module scope to avoid hooks violations
interface WaterfallRowProps {
  item: TimelineItem;
  idx: number;
  timelineStart: number;
  timelineEnd: number;
  timelineRange: number;
  spanKindColors: Record<string, string>;
  spanKindLabels: Record<string, string>;
  highlightedRowIndex: number | null;
  setHighlightedRowIndex: (idx: number | null) => void;
  waterFallContainerRef: React.RefObject<HTMLDivElement | null>;
  groupColorClass?: string;
  showChevron?: boolean;
  onChevronClick?: () => void;
  isChevronExpanded?: boolean;
}

function WaterfallRow({ 
  item, 
  idx, 
  timelineStart, 
  timelineEnd, 
  timelineRange, 
  spanKindColors, 
  spanKindLabels,
  highlightedRowIndex,
  setHighlightedRowIndex,
  waterFallContainerRef,
  groupColorClass,
  showChevron = false,
  onChevronClick,
  isChevronExpanded = false
}: WaterfallRowProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [chevronHovered, setChevronHovered] = useState(false);

  useEffect(() => {
    const element = rowRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setHighlightedRowIndex(idx);
          }
        });
      },
      {
        root: waterFallContainerRef.current,
        threshold: 0.5,
      }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [idx, waterFallContainerRef, setHighlightedRowIndex]);

  const isHighlighted = highlightedRowIndex === idx;

  if (item.type === 'event') {
    const event = item.data;
    const left = ((item.t - timelineStart) / timelineRange) * 100;
    const eventColor = getEventColor(event.type, event);
    const friendlyTypeName = getFriendlyEventTypeName(event.type, event);
    
    // Extract usage data for agent events
    const usage = (event.type === 'agent.started' || event.type === 'agent.ended') 
      ? (event.meta?.usage as AgentUsage | undefined)
      : undefined;
    const usageText = formatAgentUsage(usage);
    
    // Derive light hover tint from the event's hue
    const hoverBgColor = hexToRgba(eventColor, 0.05);
    
    return (
      <div 
        ref={rowRef}
        className={`relative h-6 flex items-center transition-colors ${
          isHighlighted ? 'bg-blue-50 border-l-2' : isHovered ? 'border-l-2' : ''
        }`}
        style={{ 
          backgroundColor: !isHighlighted && isHovered ? hoverBgColor : undefined,
          borderLeftColor: isHighlighted ? '#3b82f6' : isHovered ? eventColor : 'transparent'
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div className="absolute top-0 h-full flex items-center px-2 z-10" style={{ left: '-192px', width: '168px' }}>
          <span className="text-xs text-gray-600 truncate">
            {friendlyTypeName}
          </span>
        </div>
        
        {showChevron && onChevronClick && (
          <div 
            className="absolute w-6 top-0 h-full flex items-center justify-center z-20 cursor-pointer"
            style={{ left: '-24px' }}
            onClick={(e) => {
              e.stopPropagation();
              onChevronClick();
            }}
            onMouseEnter={() => setChevronHovered(true)}
            onMouseLeave={() => setChevronHovered(false)}
          >
            <svg 
              width="12" 
              height="12" 
              viewBox="0 0 12 12" 
              fill="none" 
              className="transition-transform"
              style={{ transform: isChevronExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
            >
              <path 
                d="M4 3 L7 6 L4 9" 
                stroke={chevronHovered ? '#3b82f6' : '#9ca3af'} 
                strokeWidth="1.5" 
                strokeLinecap="round" 
                strokeLinejoin="round"
              />
            </svg>
          </div>
        )}
        
        <div 
          className="absolute w-2 h-2 rounded-full hover:ring-2 hover:ring-opacity-50 transition-all cursor-pointer group z-10"
          style={{ 
            left: `${Math.max(0, Math.min(100, left))}%`,
            backgroundColor: eventColor,
            boxShadow: `0 0 0 2px ${eventColor}40`,
            top: '50%',
            transform: 'translateY(-50%)'
          }}
          title={`${friendlyTypeName} at ${formatTimestamp(event.t)}`}
        >
          <div className="absolute left-0 top-6 z-20 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap">
            {event.summary}
            {usageText && (
              <div className="text-xs text-gray-300 mt-1 border-t border-gray-700 pt-1">
                {usageText}
              </div>
            )}
          </div>
        </div>
        
        {(isHighlighted || isHovered) && (
          <div className="absolute left-0 top-0 h-full flex items-center z-20 pointer-events-none ml-2">
            <span className="text-xs font-medium text-gray-900 bg-white px-2 py-1 rounded shadow-sm">
              {friendlyTypeName} @ {formatTimestamp(event.t)}
              {event.source && ` (${event.source})`}
              {usageText && (
                <span className="block text-xs text-gray-600 mt-1">
                  {usageText}
                </span>
              )}
            </span>
          </div>
        )}
      </div>
    );
  } else {
    const span = item.data;
    const spanStart = new Date(span.start).getTime();
    const spanEnd = span.end ? new Date(span.end).getTime() : timelineEnd;
    const left = ((spanStart - timelineStart) / timelineRange) * 100;
    const width = ((spanEnd - spanStart) / timelineRange) * 100;
    const isOpen = !span.end;
    
    const colorClass = groupColorClass || spanKindColors[span.kind] || 'bg-gray-400';
    
    // Extract usage data for agent spans
    const usage = span.kind === 'agent' 
      ? (span.meta?.usage as AgentUsage | undefined)
      : undefined;
    const usageText = formatAgentUsage(usage);
    
    const baseColorMap: Record<string, string> = {
      'bg-yellow-400': 'rgba(250, 204, 21, 0.1)',
      'bg-blue-400': 'rgba(96, 165, 250, 0.1)',
      'bg-red-500': 'rgba(239, 68, 68, 0.1)',
      'bg-purple-400': 'rgba(168, 85, 247, 0.1)',
      'bg-gray-400': 'rgba(156, 163, 175, 0.1)',
      'bg-cyan-400': 'rgba(34, 211, 238, 0.1)',
    };
    const hoverTint = baseColorMap[colorClass] || 'rgba(156, 163, 175, 0.1)';
    
    // Get solid color for border from colorClass
    const borderColorMap: Record<string, string> = {
      'bg-yellow-400': '#facc15',
      'bg-blue-400': '#60a5fa',
      'bg-red-500': '#ef4444',
      'bg-purple-400': '#a855f7',
      'bg-gray-400': '#9ca3af',
      'bg-cyan-400': '#22d3ee',
    };
    const borderColor = borderColorMap[colorClass] || '#9ca3af';
    
    return (
      <div 
        ref={rowRef}
        className={`relative h-6 transition-colors ${
          isHighlighted ? 'border-l-2' : isHovered ? 'border-l-2' : ''
        }`}
        style={{ 
          backgroundColor: isHovered && !isHighlighted ? hoverTint : (isHighlighted ? 'rgb(239, 246, 255)' : 'transparent'),
          borderLeftColor: isHighlighted || isHovered ? borderColor : 'transparent'
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div className="absolute top-0 h-full flex items-center px-2 z-10" style={{ left: '-192px', width: '168px' }}>
          <span className="text-xs text-gray-600 truncate">
            {spanKindLabels[span.kind] || span.kind}
          </span>
        </div>
        
        {showChevron && onChevronClick && (
          <div 
            className="absolute w-6 top-0 h-full flex items-center justify-center z-20 cursor-pointer"
            style={{ left: '-24px' }}
            onClick={(e) => {
              e.stopPropagation();
              onChevronClick();
            }}
            onMouseEnter={() => setChevronHovered(true)}
            onMouseLeave={() => setChevronHovered(false)}
          >
            <svg 
              width="12" 
              height="12" 
              viewBox="0 0 12 12" 
              fill="none" 
              className="transition-transform"
              style={{ transform: isChevronExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
            >
              <path 
                d="M4 3 L7 6 L4 9" 
                stroke={chevronHovered ? '#3b82f6' : '#9ca3af'} 
                strokeWidth="1.5" 
                strokeLinecap="round" 
                strokeLinejoin="round"
              />
            </svg>
          </div>
        )}
        
        <div
          className={`absolute h-5 ${colorClass} rounded opacity-90 hover:opacity-100 transition-opacity cursor-pointer group z-10`}
          style={{
            left: `${Math.max(0, left)}%`,
            width: `${Math.min(100 - left, width)}%`,
          }}
          title={`${spanKindLabels[span.kind] || span.kind}: ${humanizeDuration(span.seconds)} (${formatTimestamp(span.start)} → ${span.end ? formatTimestamp(span.end) : 'ongoing'})`}
        >
          <div className="h-full flex items-center justify-center text-xs text-white font-medium opacity-0 group-hover:opacity-100 transition-opacity px-1">
            {span.seconds > 60 && humanizeDuration(span.seconds)}
          </div>
          {isOpen && (
            <div className="absolute right-0 top-0 bottom-0 w-1 bg-white opacity-50"></div>
          )}
          {usageText && (
            <div className="absolute left-0 top-6 z-20 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap">
              {usageText}
            </div>
          )}
        </div>
        
        {(isHighlighted || isHovered) && (
          <div className="absolute left-0 top-0 h-full flex items-center z-20 pointer-events-none ml-2">
            <span className="text-xs font-medium text-gray-900 bg-white px-2 py-1 rounded shadow-sm">
              {humanizeDuration(span.seconds)} ({formatTimestamp(span.start)} → {span.end ? formatTimestamp(span.end) : 'ongoing'})
              {usageText && (
                <span className="block text-xs text-gray-600 mt-1">
                  {usageText}
                </span>
              )}
            </span>
          </div>
        )}
      </div>
    );
  }
}

interface TimelineViewProps {
  isArchive?: boolean;
  archiveTimestamp?: string;
}

export default function TimelineView({ isArchive = false, archiveTimestamp }: TimelineViewProps = {}) {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  
  const [timeline, setTimeline] = useState<TaskTimeline | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'spans' | 'timeline' | 'events'>('timeline');
  const [highlightedRowIndex, setHighlightedRowIndex] = useState<number | null>(null);
  const waterFallContainerRef = useRef<HTMLDivElement>(null);
  
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

  // Calculate timeline scale (needed for generateTimeAxisTicks)
  const wallSpan = safeTimeline?.spans.find(s => s.kind === 'wall');
  const timelineStart = wallSpan ? new Date(wallSpan.start).getTime() : (safeTimeline ? new Date(safeTimeline.as_of).getTime() : 0);
  const timelineEnd = wallSpan ? (wallSpan.end ? new Date(wallSpan.end).getTime() : (safeTimeline ? new Date(safeTimeline.as_of).getTime() : 0)) : (safeTimeline ? new Date(safeTimeline.as_of).getTime() : 0);
  const timelineRange = timelineEnd - timelineStart;
  const isRunning = safeTimeline?.task.running || false;
  const totalWall = safeTimeline?.totals.wall_seconds || 0;

  // Generate adaptive time axis ticks - moved BEFORE early returns to satisfy Rules of Hooks
  const generateTimeAxisTicks = useCallback(() => {
    if (!safeTimeline || !wallSpan) return [];
    
    const durationSeconds = totalWall;
    let tickInterval: number;
    let formatTick: (ms: number) => string;

    if (durationSeconds < 60 * 5) {
      tickInterval = 30;
      formatTick = (ms: number) => {
        const date = new Date(ms);
        return `${date.getSeconds()}s`;
      };
    } else if (durationSeconds < 60 * 60) {
      tickInterval = 5 * 60;
      formatTick = (ms: number) => {
        const date = new Date(ms);
        return `${date.getMinutes()}m`;
      };
    } else if (durationSeconds < 60 * 60 * 24) {
      tickInterval = 60 * 60;
      formatTick = (ms: number) => {
        const date = new Date(ms);
        return `${date.getHours()}:00`;
      };
    } else {
      tickInterval = 6 * 60 * 60;
      formatTick = (ms: number) => {
        const date = new Date(ms);
        const hours = date.getHours();
        const day = date.getDate();
        return hours === 0 ? `Day ${day}` : `${hours}:00`;
      };
    }

    const ticks: Array<{ position: number; label: string; ms: number }> = [];
    
    ticks.push({
      position: 0,
      label: formatTimestamp(wallSpan.start || safeTimeline.as_of),
      ms: timelineStart
    });

    const tickCount = Math.floor(durationSeconds / tickInterval);
    for (let i = 1; i <= tickCount; i++) {
      const tickMs = timelineStart + (i * tickInterval * 1000);
      if (tickMs < timelineEnd) {
        ticks.push({
          position: ((tickMs - timelineStart) / timelineRange) * 100,
          label: formatTick(tickMs),
          ms: tickMs
        });
      }
    }

    ticks.push({
      position: 100,
      label: isRunning ? 'NOW' : formatTimestamp(wallSpan.end || safeTimeline.as_of),
      ms: timelineEnd
    });

    return ticks;
  }, [totalWall, timelineStart, timelineEnd, timelineRange, isRunning, wallSpan, safeTimeline]);

  useEffect(() => {
    async function loadTimeline() {
      try {
        let url: string;
        if (isArchive && archiveTimestamp) {
          // Load archived version
          url = `/timelines/${id}/archive/${archiveTimestamp}.json`;
        } else {
          // Load current version
          url = `/timelines/${id}.json`;
        }
        
        const response = await fetch(url);
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
  }, [id, isArchive, archiveTimestamp]);

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
              onClick={() => router.push('/timelines')}
              className="text-blue-600 hover:text-blue-800 text-sm"
            >
              ← Back to Timelines
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
    agent: 'bg-cyan-400',
  };

  const spanKindLabels: Record<string, string> = {
    wall: 'Wall Time',
    waiting_human: 'Waiting Human',
    idle: 'Idle',
    stuck: 'Stuck',
    ci: 'CI',
    agent: 'Agent',
  };
  
  // Fallback function for unknown span kinds
  const getSpanKindLabel = (kind: string): string => {
    if (spanKindLabels[kind]) {
      return spanKindLabels[kind];
    }
    // Title-case the kind with underscores converted to spaces
    return kind
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());
  };

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

  return (
    <div className="bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        {/* Navigation */}
        <div className="mb-6 flex gap-4">
          <button
            onClick={() => router.push('/timelines')}
            className="text-blue-600 hover:text-blue-800 text-sm font-medium"
          >
            ← Back to Timelines
          </button>
          {isArchive && (
            <button
              onClick={() => router.push(`/timelines/${id}`)}
              className="text-purple-600 hover:text-purple-800 text-sm font-medium"
            >
              View Current Version →
            </button>
          )}
        </div>

        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          {isArchive && (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2 text-sm text-amber-800">
              <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
              </svg>
              <span className="font-medium">Archived Timeline</span>
              <span className="text-amber-700">— Generated: {formatTimestamp(safeTimeline.generated_at)}</span>
            </div>
          )}
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
              {viewMode === 'spans' ? 'Spans by Kind' : viewMode === 'events' ? 'Event Timeline' : 'Timeline View'}
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
              <button
                onClick={() => setViewMode('events')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  viewMode === 'events'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Event Timeline
              </button>
            </div>
          </div>

          {viewMode === 'timeline' ? (
            <div className="space-y-6">
              {/* Timeline axis header with adaptive ticks */}
              <div className="border-b border-gray-200 pb-2 relative">
                <div className="relative h-12">
                  {generateTimeAxisTicks().map((tick, idx) => (
                    <div
                      key={idx}
                      className="absolute flex flex-col items-center"
                      style={{ left: `${tick.position}%`, transform: 'translateX(-50%)' }}
                    >
                      <div className="w-px h-2 bg-gray-400 mb-1" />
                      <span className={`text-xs whitespace-nowrap ${
                        isRunning && tick.position === 100 
                          ? 'font-bold text-green-600' 
                          : 'text-gray-500'
                      }`}>
                        {tick.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Wall time strip - continuous visible colored strip */}
              <div className="border-t border-gray-300 pt-2">
                <div className="text-xs font-medium text-gray-700 mb-2">Wall: {humanizeDuration(totalWall)}</div>
                <div className="relative" style={{ marginLeft: '192px' }}>
                  <svg width="100%" height="20" className="border border-gray-300 rounded" viewBox="0 0 1000 20" preserveAspectRatio="none">
                    {(() => {
                      // Build coverage segments using interval merge algorithm
                      type Event = { time: number; kind: string; isStart: boolean };
                      const events: Event[] = [];
                      
                      // Correlate agent.started/agent.ended into agent spans for wall strip
                      const agentStartEvents = safeTimeline.events.filter(e => e.type === 'agent.started');
                      const agentEndEvents = safeTimeline.events.filter(e => e.type === 'agent.ended');
                      const agentSpans: Array<{ start: string; end: string | null }> = [];
                      
                      for (const startEvent of agentStartEvents) {
                        const startTime = new Date(startEvent.t).getTime();
                        const endEvent = agentEndEvents.find(e => new Date(e.t).getTime() > startTime);
                        agentSpans.push({
                          start: startEvent.t,
                          end: endEvent ? endEvent.t : null
                        });
                      }
                      
                      // Collect all span start/end events (including agent spans)
                      safeTimeline.spans
                        .filter(span => span.kind !== 'wall' && span.seconds > 0)
                        .forEach(span => {
                          const spanStart = (new Date(span.start).getTime() - timelineStart) / 1000;
                          const spanEnd = span.end 
                            ? (new Date(span.end).getTime() - timelineStart) / 1000
                            : totalWall;
                          
                          events.push({ time: Math.max(0, spanStart), kind: span.kind, isStart: true });
                          events.push({ time: Math.min(totalWall, spanEnd), kind: span.kind, isStart: false });
                        });
                      
                      // Add agent spans
                      agentSpans.forEach(span => {
                        const spanStart = (new Date(span.start).getTime() - timelineStart) / 1000;
                        const spanEnd = span.end 
                          ? (new Date(span.end).getTime() - timelineStart) / 1000
                          : totalWall;
                        
                        events.push({ time: Math.max(0, spanStart), kind: 'agent', isStart: true });
                        events.push({ time: Math.min(totalWall, spanEnd), kind: 'agent', isStart: false });
                      });
                    
                    // Sort events by time (start before end at same time)
                    events.sort((a, b) => {
                      if (a.time !== b.time) return a.time - b.time;
                      return a.isStart ? -1 : 1;
                    });
                    
                    // Sweep through events to build segments
                    const segments: Array<{ start: number; end: number; kinds: string[] }> = [];
                    const activeKinds = new Set<string>();
                    let segmentStart = 0;
                    
                    for (const event of events) {
                      const currentKinds = Array.from(activeKinds).sort();
                      
                      if (event.isStart) {
                        activeKinds.add(event.kind);
                      } else {
                        activeKinds.delete(event.kind);
                      }
                      
                      const newKinds = Array.from(activeKinds).sort();
                      
                      if (currentKinds.join(',') !== newKinds.join(',')) {
                        if (event.time > segmentStart) {
                          segments.push({ 
                            start: segmentStart, 
                            end: event.time, 
                            kinds: currentKinds 
                          });
                        }
                        segmentStart = event.time;
                      }
                    }
                    
                    if (segmentStart < totalWall) {
                      segments.push({ 
                        start: segmentStart, 
                        end: totalWall, 
                        kinds: Array.from(activeKinds).sort() 
                      });
                    }
                    
                    // Render segments
                    return segments.map((seg, idx) => {
                      const x = (seg.start / totalWall) * 1000;
                      const width = ((seg.end - seg.start) / totalWall) * 1000;
                      
                      if (seg.kinds.length === 0) {
                        return (
                          <rect
                            key={idx}
                            x={x}
                            width={width}
                            y="0"
                            height="20"
                            fill="#9ca3af"
                          />
                        );
                      } else if (seg.kinds.length === 1) {
                        const kind = seg.kinds[0];
                        const colorMap: Record<string, string> = {
                          waiting_human: '#facc15',
                          idle: '#60a5fa',
                          stuck: '#ef4444',
                          ci: '#a855f7',
                          agent: '#22d3ee',
                        };
                        const color = colorMap[kind] || '#9ca3af';
                        
                        return (
                          <rect
                            key={idx}
                            x={x}
                            width={width}
                            y="0"
                            height="20"
                            fill={color}
                            opacity="0.9"
                          />
                        );
                      } else {
                        const colorMap: Record<string, string> = {
                          waiting_human: '#facc15',
                          idle: '#60a5fa',
                          stuck: '#ef4444',
                          ci: '#a855f7',
                          agent: '#22d3ee',
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
                              x={x}
                              width={width}
                              y="0"
                              height="20"
                              fill={`url(#${patternId})`}
                            />
                          </g>
                        );
                      }
                    });
                  })()}
                  
                  {/* Event blips on wall bar */}
                  {safeTimeline.events
                    .filter(e => e.type !== 'agent.started' && e.type !== 'agent.ended' && e.type !== 'ci.started' && e.type !== 'ci.ended')
                    .map((event, idx) => {
                      const eventTime = (new Date(event.t).getTime() - timelineStart) / 1000;
                      const x = (eventTime / totalWall) * 1000;
                      const eventColor = getEventColor(event.type, event);
                      
                      return (
                        <circle
                          key={`event-${idx}`}
                          cx={x}
                          cy="10"
                          r="3"
                          fill={eventColor}
                          stroke="white"
                          strokeWidth="1"
                          opacity="0.9"
                        />
                      );
                    })}
                </svg>
                </div>
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
                    <div className="w-3 h-3 bg-cyan-400 rounded" />
                    <span>Agent</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-gray-400 rounded" />
                    <span>Unknown</span>
                  </div>
                </div>
              </div>

              {/* WATERFALL: Rows for events and spans */}
              <div className="relative overflow-hidden">
                <div className="space-y-1 relative" style={{ marginLeft: '192px' }} ref={waterFallContainerRef}>
                  {/* Vertical grid lines */}
                  <div className="absolute inset-0 pointer-events-none">
                    {generateTimeAxisTicks().map((tick, idx) => (
                      <div
                        key={`grid-${idx}`}
                        className="absolute top-0 bottom-0 w-px bg-gray-200"
                        style={{ left: `${tick.position}%` }}
                      />
                    ))}
                    {isRunning && (
                      <div
                        className="absolute top-0 bottom-0 w-0.5 bg-green-500 opacity-50"
                        style={{ left: '100%' }}
                      />
                    )}
                  </div>

                  {(() => {
                    // Event types that are represented as spans and should not appear as point events
                    const spanEventTypes = new Set([
                      'ci.started',
                      'ci.ended',
                      'ci_started',
                      'ci_completed',
                    ]);

                    // Correlate agent.started/agent.ended into agent spans
                    const agentStartEvents = safeTimeline.events.filter(e => e.type === 'agent.started');
                    const agentEndEvents = safeTimeline.events.filter(e => e.type === 'agent.ended');
                    const agentSpans: Array<{ kind: string; start: string; end: string | null; seconds: number }> = [];
                    
                    for (const startEvent of agentStartEvents) {
                      spanEventTypes.add('agent.started');
                      const startTime = new Date(startEvent.t).getTime();
                      const endEvent = agentEndEvents.find(e => new Date(e.t).getTime() > startTime);
                      const endTime = endEvent ? new Date(endEvent.t).getTime() : timelineEnd;
                      const seconds = (endTime - startTime) / 1000;
                      
                      agentSpans.push({
                        kind: 'agent',
                        start: startEvent.t,
                        end: endEvent ? endEvent.t : null,
                        seconds
                      });
                      
                      if (endEvent) {
                        spanEventTypes.add('agent.ended');
                      }
                    }

                    // Collect zero-second CI spans for note
                    const zeroSecondCISpans = safeTimeline.spans.filter(s => s.kind === 'ci' && s.seconds === 0);
                    
                    const items: TimelineItem[] = [
                      ...safeTimeline.events
                        .filter(e => 
                          e.type !== 'agent.slash_command' && 
                          !spanEventTypes.has(e.type)
                        )
                        .map(e => ({ type: 'event' as const, t: new Date(e.t).getTime(), data: e })),
                      ...safeTimeline.spans
                        .filter(s => s.kind !== 'wall' && s.seconds > 0)
                        .map(s => ({ type: 'span' as const, t: new Date(s.start).getTime(), data: s })),
                      ...agentSpans.map(s => ({ type: 'span' as const, t: new Date(s.start).getTime(), data: s }))
                    ];
                    
                    items.sort((a, b) => a.t - b.t);
                    
                    // Group consecutive items of the same kind (spans) or type (events)
                    const groupedItems: Array<TimelineItem | SpanGroup | EventGroup> = [];
                    let i = 0;
                    
                    while (i < items.length) {
                      const item = items[i];
                      
                      if (item.type === 'event') {
                        const eventType = item.data.type;
                        const consecutiveEvents: Array<typeof item> = [item];
                        let j = i + 1;
                        
                        while (j < items.length) {
                          const nextItem = items[j];
                          if (nextItem.type === 'event' && nextItem.data.type === eventType) {
                            consecutiveEvents.push(nextItem);
                            j++;
                          } else {
                            break;
                          }
                        }
                        
                        if (consecutiveEvents.length > 1) {
                          groupedItems.push({
                            type: 'event-group',
                            eventType,
                            events: consecutiveEvents as Array<{ type: 'event'; t: number; data: { id: string; type: string; t: string; source: string; summary: string; source_ref?: string } }>,
                            startIdx: groupedItems.length,
                          });
                        } else {
                          groupedItems.push(item);
                        }
                        
                        i = j;
                      } else {
                        const spanKind = item.data.kind;
                        const consecutiveSpans: Array<typeof item> = [item];
                        let j = i + 1;
                        
                        while (j < items.length) {
                          const nextItem = items[j];
                          if (nextItem.type === 'span' && nextItem.data.kind === spanKind) {
                            consecutiveSpans.push(nextItem);
                            j++;
                          } else {
                            break;
                          }
                        }
                        
                        if (consecutiveSpans.length > 1) {
                          groupedItems.push({
                            type: 'span-group',
                            kind: spanKind,
                            spans: consecutiveSpans as Array<{ type: 'span'; t: number; data: { kind: string; start: string; end: string | null; seconds: number } }>,
                            startIdx: groupedItems.length,
                          });
                        } else {
                          groupedItems.push(item);
                        }
                        
                        i = j;
                      }
                    }
                    
                    return (
                      <>
                        {groupedItems.map((item, idx) => {
                          if ('type' in item && item.type === 'span-group') {
                            return (
                              <SpanGroupRow
                                key={`group-${idx}`}
                                group={item}
                                timelineStart={timelineStart}
                                timelineEnd={timelineEnd}
                                timelineRange={timelineRange}
                                spanKindColors={spanKindColors}
                                spanKindLabels={spanKindLabels}
                                highlightedRowIndex={highlightedRowIndex}
                                setHighlightedRowIndex={setHighlightedRowIndex}
                                waterFallContainerRef={waterFallContainerRef}
                              />
                            );
                          } else if ('type' in item && item.type === 'event-group') {
                            return (
                              <EventGroupRow
                                key={`event-group-${idx}`}
                                group={item}
                                timelineStart={timelineStart}
                                timelineEnd={timelineEnd}
                                timelineRange={timelineRange}
                                highlightedRowIndex={highlightedRowIndex}
                                setHighlightedRowIndex={setHighlightedRowIndex}
                                waterFallContainerRef={waterFallContainerRef}
                              />
                            );
                          } else {
                            return (
                              <WaterfallRow 
                                key={`row-${idx}`} 
                                item={item as TimelineItem}
                                idx={idx}
                                timelineStart={timelineStart}
                                timelineEnd={timelineEnd}
                                timelineRange={timelineRange}
                                spanKindColors={spanKindColors}
                                spanKindLabels={spanKindLabels}
                                highlightedRowIndex={highlightedRowIndex}
                                setHighlightedRowIndex={setHighlightedRowIndex}
                                waterFallContainerRef={waterFallContainerRef}
                              />
                            );
                          }
                        })}
                        
                        {zeroSecondCISpans.length > 0 && (
                          <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800">
                            <strong>Note:</strong> {zeroSecondCISpans.length} CI span{zeroSecondCISpans.length > 1 ? 's' : ''} with zero duration omitted from waterfall (start === end).
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>
          ) : viewMode === 'events' ? (
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
