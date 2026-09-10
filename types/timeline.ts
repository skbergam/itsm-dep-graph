export interface TaskTimelineEvent {
  id: string;
  type: string;
  t: string;
  source: string;
  source_ref: string;
  summary: string;
  meta: Record<string, unknown>;
}

export interface TaskTimelineSpan {
  kind: 'wall' | 'waiting_human' | 'idle' | 'stuck' | 'ci';
  start: string;
  end: string;
  seconds: number;
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

export interface TaskTimelineLinks {
  eng_prs: string[];
  prs: string[];
  agents: string[];
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
