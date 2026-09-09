import './style.css';
import type { GraphData } from './types';
import { normalizeGraphData } from './normalize';
import { computeLayout } from './layout';
import { GraphRenderer } from './renderer';
import { Sidebar } from './sidebar';

async function loadGraphData(): Promise<GraphData> {
  const response = await fetch('./out/itsm-graph.json');
  if (!response.ok) {
    throw new Error(`Failed to load graph data: ${response.statusText}`);
  }
  const raw = await response.json();
  return normalizeGraphData(raw);
}

async function init() {
  try {
    const data = await loadGraphData();
    const layout = computeLayout(data);

    const canvas = document.getElementById('graph-canvas') as HTMLCanvasElement;
    const sidebarContainer = document.getElementById('sidebar') as HTMLElement;

    if (!canvas || !sidebarContainer) {
      throw new Error('Required DOM elements not found');
    }

    const renderer = new GraphRenderer(canvas, data, layout);
    const sidebar = new Sidebar(sidebarContainer, data);

    sidebar.setTaskHoverCallback((taskId) => {
      renderer.highlightNode(taskId);
    });

    sidebar.setTaskSelectCallback((taskId) => {
      renderer.selectNode(taskId);
      renderer.panToNode(taskId);
    });

    canvas.addEventListener('nodehover', ((e: CustomEvent) => {
      sidebar.highlightTask(e.detail);
    }) as EventListener);

    canvas.addEventListener('nodeselect', ((e: CustomEvent) => {
      const nodeId = e.detail;
      sidebar.selectTask(nodeId);
    }) as EventListener);

    const fitBtn = document.getElementById('fit-btn');
    const relayoutBtn = document.getElementById('relayout-btn');

    fitBtn?.addEventListener('click', () => {
      renderer.fitView();
    });

    relayoutBtn?.addEventListener('click', () => {
      const newLayout = computeLayout(data);
      renderer.updateLayout(newLayout);
      renderer.fitView();
    });

    setTimeout(() => {
      renderer.fitView();
    }, 100);

  } catch (error) {
    console.error('Error initializing graph:', error);
    const app = document.getElementById('app');
    if (app) {
      app.innerHTML = `
        <div style="padding: 40px; color: #ef4444; font-size: 16px;">
          <h2 style="margin-bottom: 16px;">Error Loading Graph</h2>
          <p>${error instanceof Error ? error.message : 'Unknown error'}</p>
          <p style="margin-top: 16px; color: #94a3b8; font-size: 14px;">
            Make sure out/itsm-graph.json exists and is valid.
          </p>
        </div>
      `;
    }
  }
}

init();
