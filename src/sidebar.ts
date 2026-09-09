import type { GraphData, Task, TaskStatus } from './types';

const STATUS_COLORS: Record<TaskStatus, string> = {
  not_started: '#9ca3af',
  in_progress: '#3b82f6',
  waiting: '#eab308',
  blocked: '#ef4444',
  done: '#22c55e'
};

const STATUS_LABELS: Record<TaskStatus, string> = {
  not_started: 'Not Started',
  in_progress: 'In Progress',
  waiting: 'Waiting',
  blocked: 'Blocked',
  done: 'Done'
};

export class Sidebar {
  private container: HTMLElement;
  private data: GraphData;
  private onTaskHover: ((taskId: string | null) => void) | null = null;
  private onTaskSelect: ((taskId: string) => void) | null = null;
  private hoveredTaskId: string | null = null;

  constructor(container: HTMLElement, data: GraphData) {
    this.container = container;
    this.data = data;
    this.render();
  }

  public setTaskHoverCallback(callback: (taskId: string | null) => void) {
    this.onTaskHover = callback;
  }

  public setTaskSelectCallback(callback: (taskId: string) => void) {
    this.onTaskSelect = callback;
  }

  public highlightTask(taskId: string | null) {
    this.hoveredTaskId = taskId;
    this.render();
  }

  private render() {
    const projectGroups = new Map<string, Task[]>();
    
    for (const task of this.data.tasks) {
      if (!projectGroups.has(task.project_id)) {
        projectGroups.set(task.project_id, []);
      }
      projectGroups.get(task.project_id)!.push(task);
    }

    let html = '<div class="sidebar-header">ITSM Tasks</div>';

    for (const project of this.data.projects) {
      const tasks = projectGroups.get(project.id) || [];
      
      html += `
        <div class="project-group">
          <div class="project-header">
            <div class="project-indicator"></div>
            <div class="project-title">
              <div class="project-id">${this.escapeHtml(project.id)}</div>
              <div class="project-name">${this.escapeHtml(project.name)}</div>
            </div>
          </div>
          <div class="task-list">
      `;

      for (const task of tasks) {
        const isHovered = this.hoveredTaskId === task.id;
        const statusColor = STATUS_COLORS[task.status];
        const statusLabel = STATUS_LABELS[task.status];
        
        html += `
          <div class="task-item ${isHovered ? 'hovered' : ''}" 
               data-task-id="${this.escapeHtml(task.id)}">
            <div class="task-indicator" style="background-color: ${statusColor}"></div>
            <div class="task-content">
              <div class="task-id">${this.escapeHtml(task.id)}</div>
              <div class="task-name">${this.escapeHtml(task.name)}</div>
              <div class="task-status" style="color: ${statusColor}">${statusLabel}</div>
            </div>
          </div>
        `;
      }

      html += `
          </div>
        </div>
      `;
    }

    this.container.innerHTML = html;
    this.attachEventListeners();
  }

  private attachEventListeners() {
    const taskItems = this.container.querySelectorAll('.task-item');
    
    taskItems.forEach((item) => {
      const taskId = item.getAttribute('data-task-id');
      if (!taskId) return;

      item.addEventListener('mouseenter', () => {
        this.onTaskHover?.(taskId);
      });

      item.addEventListener('mouseleave', () => {
        this.onTaskHover?.(null);
      });

      item.addEventListener('click', () => {
        this.onTaskSelect?.(taskId);
      });
    });

    this.container.addEventListener('mouseleave', () => {
      this.onTaskHover?.(null);
    });
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
