import type { GraphData, LayoutResult, Task, Project, TaskStatus } from './types';

const STATUS_COLORS: Record<TaskStatus, string> = {
  not_started: '#9ca3af',
  in_progress: '#3b82f6',
  waiting: '#eab308',
  blocked: '#ef4444',
  done: '#22c55e'
};

const PROJECT_COLOR = '#a855f7';
const EDGE_COLOR = '#94a3b8';
const TEXT_COLOR = '#ffffff';
const BG_COLOR = '#0f172a';

export class GraphRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private data: GraphData;
  private layout: LayoutResult;
  private scale = 1;
  private offsetX = 0;
  private offsetY = 0;
  private hoveredNode: string | null = null;
  private selectedNode: string | null = null;
  private isDragging = false;
  private dragStartX = 0;
  private dragStartY = 0;

  constructor(canvas: HTMLCanvasElement, data: GraphData, layout: LayoutResult) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get 2D context');
    this.ctx = ctx;
    this.data = data;
    this.layout = layout;

    this.setupCanvas();
    this.setupEventListeners();
  }

  private setupCanvas() {
    this.canvas.width = this.canvas.clientWidth;
    this.canvas.height = this.canvas.clientHeight;
  }

  private setupEventListeners() {
    this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
    this.canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
    this.canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
    this.canvas.addEventListener('wheel', this.handleWheel.bind(this));
    this.canvas.addEventListener('mouseleave', () => {
      this.hoveredNode = null;
      this.isDragging = false;
      this.render();
    });
    window.addEventListener('resize', () => {
      this.setupCanvas();
      this.render();
    });
  }

  private handleMouseMove(e: MouseEvent) {
    const rect = this.canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left - this.offsetX) / this.scale;
    const y = (e.clientY - rect.top - this.offsetY) / this.scale;

    if (this.isDragging) {
      const dx = e.clientX - this.dragStartX;
      const dy = e.clientY - this.dragStartY;
      this.offsetX += dx;
      this.offsetY += dy;
      this.dragStartX = e.clientX;
      this.dragStartY = e.clientY;
      this.render();
      return;
    }

    const hoveredNode = this.getNodeAtPosition(x, y);
    if (hoveredNode !== this.hoveredNode) {
      this.hoveredNode = hoveredNode;
      this.render();
      this.dispatchHoverEvent(hoveredNode);
    }
  }

  private handleMouseDown(e: MouseEvent) {
    const rect = this.canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left - this.offsetX) / this.scale;
    const y = (e.clientY - rect.top - this.offsetY) / this.scale;

    const clickedNode = this.getNodeAtPosition(x, y);
    if (clickedNode) {
      this.selectedNode = clickedNode;
      this.render();
      this.dispatchSelectEvent(clickedNode);
    } else {
      this.isDragging = true;
      this.dragStartX = e.clientX;
      this.dragStartY = e.clientY;
      this.canvas.style.cursor = 'grabbing';
    }
  }

  private handleMouseUp() {
    this.isDragging = false;
    this.canvas.style.cursor = 'default';
  }

  private handleWheel(e: WheelEvent) {
    e.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const oldScale = this.scale;
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    this.scale = Math.max(0.1, Math.min(5, this.scale * delta));

    this.offsetX = mouseX - (mouseX - this.offsetX) * (this.scale / oldScale);
    this.offsetY = mouseY - (mouseY - this.offsetY) * (this.scale / oldScale);

    this.render();
  }

  private getNodeAtPosition(x: number, y: number): string | null {
    for (const [id, node] of this.layout.nodes) {
      const left = node.x - node.width / 2;
      const right = node.x + node.width / 2;
      const top = node.y - node.height / 2;
      const bottom = node.y + node.height / 2;

      if (x >= left && x <= right && y >= top && y <= bottom) {
        return id;
      }
    }
    return null;
  }

  private dispatchHoverEvent(nodeId: string | null) {
    this.canvas.dispatchEvent(new CustomEvent('nodehover', { detail: nodeId }));
  }

  private dispatchSelectEvent(nodeId: string) {
    this.canvas.dispatchEvent(new CustomEvent('nodeselect', { detail: nodeId }));
  }

  public render() {
    this.ctx.fillStyle = BG_COLOR;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    this.ctx.save();
    this.ctx.translate(this.offsetX, this.offsetY);
    this.ctx.scale(this.scale, this.scale);

    this.renderEdges();
    this.renderNodes();

    this.ctx.restore();
  }

  private renderEdges() {
    this.ctx.strokeStyle = EDGE_COLOR;
    this.ctx.lineWidth = 3;
    this.ctx.setLineDash([]);

    for (const edge of this.layout.edges) {
      const fromNode = this.layout.nodes.get(edge.from);
      const toNode = this.layout.nodes.get(edge.to);
      
      if (!fromNode || !toNode) continue;

      const isHighlighted = 
        this.hoveredNode === edge.from || 
        this.hoveredNode === edge.to ||
        this.selectedNode === edge.from ||
        this.selectedNode === edge.to;

      if (isHighlighted) {
        this.ctx.strokeStyle = '#60a5fa';
        this.ctx.lineWidth = 4;
      } else {
        this.ctx.strokeStyle = EDGE_COLOR;
        this.ctx.lineWidth = 3;
      }

      this.ctx.beginPath();
      if (edge.points.length > 0) {
        this.ctx.moveTo(edge.points[0].x, edge.points[0].y);
        for (let i = 1; i < edge.points.length; i++) {
          this.ctx.lineTo(edge.points[i].x, edge.points[i].y);
        }
      }
      this.ctx.stroke();

      if (edge.points.length > 1) {
        const last = edge.points[edge.points.length - 1];
        const secondLast = edge.points[edge.points.length - 2];
        this.drawArrowhead(secondLast.x, secondLast.y, last.x, last.y, isHighlighted);
      }
    }
  }

  private drawArrowhead(x1: number, y1: number, x2: number, y2: number, highlighted: boolean) {
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const arrowSize = 12;

    this.ctx.fillStyle = highlighted ? '#60a5fa' : EDGE_COLOR;
    this.ctx.beginPath();
    this.ctx.moveTo(x2, y2);
    this.ctx.lineTo(
      x2 - arrowSize * Math.cos(angle - Math.PI / 6),
      y2 - arrowSize * Math.sin(angle - Math.PI / 6)
    );
    this.ctx.lineTo(
      x2 - arrowSize * Math.cos(angle + Math.PI / 6),
      y2 - arrowSize * Math.sin(angle + Math.PI / 6)
    );
    this.ctx.closePath();
    this.ctx.fill();
  }

  private renderNodes() {
    for (const project of this.data.projects) {
      const node = this.layout.nodes.get(project.id);
      if (!node) continue;
      this.renderProjectNode(node, project);
    }

    for (const task of this.data.tasks) {
      const node = this.layout.nodes.get(task.id);
      if (!node) continue;
      this.renderTaskNode(node, task);
    }
  }

  private renderProjectNode(node: { x: number; y: number; width: number; height: number }, project: Project) {
    const x = node.x - node.width / 2;
    const y = node.y - node.height / 2;
    const isHovered = this.hoveredNode === project.id;
    const isSelected = this.selectedNode === project.id;

    this.ctx.fillStyle = PROJECT_COLOR;
    if (isHovered || isSelected) {
      this.ctx.shadowColor = 'rgba(168, 85, 247, 0.5)';
      this.ctx.shadowBlur = 15;
    }
    this.roundRect(x, y, node.width, node.height, 8);
    this.ctx.fill();
    this.ctx.shadowBlur = 0;

    this.ctx.strokeStyle = isSelected ? '#ffffff' : 'rgba(255, 255, 255, 0.3)';
    this.ctx.lineWidth = isSelected ? 3 : 1.5;
    this.roundRect(x, y, node.width, node.height, 8);
    this.ctx.stroke();

    this.ctx.fillStyle = TEXT_COLOR;
    this.ctx.font = '12px system-ui, -apple-system, sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'top';
    this.ctx.fillText(project.id, node.x, y + 10);
    
    this.ctx.font = 'bold 14px system-ui, -apple-system, sans-serif';
    this.wrapText(project.name, node.x, y + 28, node.width - 16);
  }

  private renderTaskNode(node: { x: number; y: number; width: number; height: number }, task: Task) {
    const x = node.x - node.width / 2;
    const y = node.y - node.height / 2;
    const isHovered = this.hoveredNode === task.id;
    const isSelected = this.selectedNode === task.id;
    const isBlocked = task.status === 'blocked';

    this.ctx.fillStyle = STATUS_COLORS[task.status];
    if (isBlocked || isHovered || isSelected) {
      this.ctx.shadowColor = isBlocked ? 'rgba(239, 68, 68, 0.6)' : `${STATUS_COLORS[task.status]}80`;
      this.ctx.shadowBlur = isBlocked ? 16 : 12;
    }
    this.roundRect(x, y, node.width, node.height, 6);
    this.ctx.fill();
    this.ctx.shadowBlur = 0;

    this.ctx.strokeStyle = isBlocked ? '#ef4444' : (isSelected ? '#ffffff' : 'rgba(255, 255, 255, 0.2)');
    this.ctx.lineWidth = isBlocked ? 3 : (isSelected ? 2.5 : 1);
    this.roundRect(x, y, node.width, node.height, 6);
    this.ctx.stroke();

    this.ctx.fillStyle = TEXT_COLOR;
    this.ctx.font = 'bold 14px system-ui, -apple-system, sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'top';
    this.wrapText(task.name, node.x, y + 10, node.width - 16);
    
    this.ctx.font = '12px system-ui, -apple-system, sans-serif';
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    const taskIdShort = task.id.length > 12 ? task.id.substring(0, 8) + '…' : task.id;
    this.ctx.fillText(taskIdShort, node.x, y + node.height - 20);
  }

  private roundRect(x: number, y: number, width: number, height: number, radius: number) {
    this.ctx.beginPath();
    this.ctx.moveTo(x + radius, y);
    this.ctx.lineTo(x + width - radius, y);
    this.ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    this.ctx.lineTo(x + width, y + height - radius);
    this.ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    this.ctx.lineTo(x + radius, y + height);
    this.ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    this.ctx.lineTo(x, y + radius);
    this.ctx.quadraticCurveTo(x, y, x + radius, y);
    this.ctx.closePath();
  }

  private wrapText(text: string, x: number, y: number, maxWidth: number) {
    const words = text.split(' ');
    let line = '';
    let lineY = y;

    for (let i = 0; i < words.length; i++) {
      const testLine = line + words[i] + ' ';
      const metrics = this.ctx.measureText(testLine);
      
      if (metrics.width > maxWidth && i > 0) {
        this.ctx.fillText(line.trim(), x, lineY);
        line = words[i] + ' ';
        lineY += 14;
      } else {
        line = testLine;
      }
    }
    this.ctx.fillText(line.trim(), x, lineY);
  }

  private truncateText(text: string, maxWidth: number): string {
    const ellipsis = '…';
    let truncated = text;
    
    while (this.ctx.measureText(truncated + ellipsis).width > maxWidth && truncated.length > 0) {
      truncated = truncated.slice(0, -1);
    }
    
    return truncated === text ? text : truncated + ellipsis;
  }

  public fitView() {
    const padding = 50;
    const availableWidth = this.canvas.width - 2 * padding;
    const availableHeight = this.canvas.height - 2 * padding;
    
    const scaleX = availableWidth / this.layout.width;
    const scaleY = availableHeight / this.layout.height;
    this.scale = Math.max(0.3, Math.min(scaleX, scaleY, 1));
    
    this.offsetX = (this.canvas.width - this.layout.width * this.scale) / 2;
    this.offsetY = (this.canvas.height - this.layout.height * this.scale) / 2;
    
    this.render();
  }

  public updateLayout(layout: LayoutResult) {
    this.layout = layout;
    this.render();
  }

  public highlightNode(nodeId: string | null) {
    this.hoveredNode = nodeId;
    this.render();
  }

  public selectNode(nodeId: string | null) {
    this.selectedNode = nodeId;
    this.render();
    if (nodeId) {
      this.dispatchSelectEvent(nodeId);
    }
  }

  public getSelectedNode(): string | null {
    return this.selectedNode;
  }

  public panToNode(nodeId: string) {
    const node = this.layout.nodes.get(nodeId);
    if (!node) return;

    const centerX = this.canvas.width / 2;
    const centerY = this.canvas.height / 2;
    
    this.offsetX = centerX - node.x * this.scale;
    this.offsetY = centerY - node.y * this.scale;
    
    this.render();
  }
}
