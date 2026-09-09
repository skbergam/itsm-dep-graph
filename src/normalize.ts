import type { GraphData, Task, Project, TaskStatus, Edge } from './types';

const STATUS_MAP: Record<string, TaskStatus> = {
  'not started': 'not_started',
  'not_started': 'not_started',
  'in progress': 'in_progress',
  'in_progress': 'in_progress',
  waiting: 'waiting',
  blocked: 'blocked',
  done: 'done',
  archived: 'done',
};

function mapStatus(raw: unknown): TaskStatus {
  const key = String(raw ?? 'not_started').trim().toLowerCase();
  return STATUS_MAP[key] ?? 'not_started';
}

/** Accept live dump_itsm JSON (project_ids[], Status labels) or app-shaped fixture. */
export function normalizeGraphData(raw: any): GraphData {
  const projects: Project[] = (raw.projects || []).map((p: any) => ({
    id: String(p.id),
    name: String(p.name || p.prefix || p.id),
    status: 'in_progress' as const,
  }));

  const tasks: Task[] = (raw.tasks || []).map((t: any) => {
    const project_id =
      t.project_id ||
      (Array.isArray(t.project_ids) && t.project_ids[0]) ||
      '';
    return {
      id: String(t.id),
      name: String(t.name || t.code || t.id),
      status: mapStatus(t.status),
      project_id: String(project_id),
    };
  });

  const edges: Edge[] = (raw.edges || []).map((e: any) => ({
    from: String(e.from),
    to: String(e.to),
  }));

  return {
    projects,
    tasks,
    edges,
    membership: raw.membership || {},
    pulse: raw.pulse || {},
  };
}
