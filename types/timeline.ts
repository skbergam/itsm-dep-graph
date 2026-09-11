export interface AgentUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  costUsd?: number;
}

/**
 * Canonical event types for PR status changes:
 * - pr.created: PR opened
 * - pr.merged: PR status changed to merged
 * - pr.closed: PR status changed to closed (without merging)
 * - pr.reopened: PR status changed back to open
 * - pr.set_to_draft: PR draft status set (converted to draft)
 * - pr.ready_for_review: PR draft status removed (marked ready for review)
 */
export interface TaskTimelineEvent {
  id: string;
  type: string;
  t: string;
  source: string;
  source_ref: string;
  summary: string;
  meta: Record<string, unknown> & {
    usage?: AgentUsage;
    agent_id?: string;
  };
}

export interface TaskTimelineSpan {
  kind: 'wall' | 'waiting_human' | 'idle' | 'stuck' | 'ci' | 'agent' | 'subagent';
  start: string;
  end: string;
  seconds: number;
  meta?: {
    usage?: AgentUsage;
    agent_id?: string;
    subagent_id?: string;
    parent_agent_id?: string;
    description?: string;
    open_ended?: boolean;
    [key: string]: unknown;
  };
}

export interface TaskTimelineTotals {
  wall_seconds: number;
  waiting_human_seconds: number;
  idle_seconds: number;
  stuck_seconds: number;
  ci_seconds: number;
}

export interface TaskTimelineTask {
  notion_url: string;
  title: string;
  status: string;
  running: boolean;
}

// Link can be a simple string URL or a rich object with metadata
export type TimelineLink = string | {
  url?: string;
  href?: string;
  title?: string;
  id?: string;
  number?: number;
  [key: string]: unknown;
};

export interface TaskTimelineLinks {
  eng_prs: TimelineLink[];
  prs: TimelineLink[];
  agents: TimelineLink[];
}

export interface TaskTimelineOmission {
  wanted: string;
  reason: string;
}

export interface TaskTimeline {
  schema: 'task-timeline/v1';
  generated_at: string;
  as_of: string;
  task: TaskTimelineTask;
  links: TaskTimelineLinks;
  events: TaskTimelineEvent[];
  spans: TaskTimelineSpan[];
  totals: TaskTimelineTotals;
  omissions: TaskTimelineOmission[];
}
