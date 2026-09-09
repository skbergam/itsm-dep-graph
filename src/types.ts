export type TaskStatus = 'not_started' | 'in_progress' | 'waiting' | 'blocked' | 'done';
export type ProjectStatus = 'in_progress' | 'done' | 'archived';

export interface Project {
  id: string;
  name: string;
  status: ProjectStatus;
}

export interface Task {
  id: string;
  name: string;
  status: TaskStatus;
  project_id: string;
}

export interface Edge {
  from: string;
  to: string;
}

export interface GraphData {
  projects: Project[];
  tasks: Task[];
  edges: Edge[];
  membership: Record<string, unknown>;
  pulse: Record<string, unknown>;
}

export interface LayoutNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutEdge {
  from: string;
  to: string;
  points: Array<{ x: number; y: number }>;
}

export interface LayoutResult {
  nodes: Map<string, LayoutNode>;
  edges: LayoutEdge[];
  width: number;
  height: number;
}
