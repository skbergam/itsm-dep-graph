export type TaskStatus = 'Not started' | 'In progress' | 'Waiting' | 'Blocked' | 'Done';
export type ProjectStatus = 'in_progress' | 'done' | 'archived';

export interface Project {
  id: string;
  name: string;
  url?: string;
  url_alt?: string;
  prefix?: string;
}

export interface Task {
  id: string;
  name: string;
  code?: string;
  status: TaskStatus;
  note?: string;
  bot?: string | null;
  url?: string;
  project_ids: string[];
  icon?: string;
  body?: string | null;
  color?: string;
  depends_tokens?: string[];
  depends_on: string[];
}

export interface Edge {
  from: string;
  to: string;
  kind?: string;
  token?: string;
  via?: string;
}

export interface GraphData {
  generated_at?: string;
  projects: Project[];
  tasks: Task[];
  edges: Edge[];
  membership: Array<{
    from: string;
    to: string;
    kind: string;
    token: string;
    via: string;
  }>;
  parse_issues?: Array<unknown>;
  pulse?: Record<string, number>;
  meta?: Record<string, unknown>;
}
