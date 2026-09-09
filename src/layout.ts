import * as dagre from '@dagrejs/dagre';
import type { GraphData, LayoutResult, LayoutNode, LayoutEdge } from './types';

const PROJECT_NODE_WIDTH = 200;
const PROJECT_NODE_HEIGHT = 60;
const TASK_NODE_WIDTH = 220;
const TASK_NODE_HEIGHT = 56;
const RANK_SEP = 80;
const NODE_SEP = 40;

export function computeLayout(data: GraphData): LayoutResult {
  const g = new dagre.graphlib.Graph({ compound: true });
  
  g.setGraph({
    rankdir: 'TB',
    ranksep: RANK_SEP,
    nodesep: NODE_SEP,
    edgesep: 30,
    ranker: 'tight-tree'
  });
  
  g.setDefaultEdgeLabel(() => ({}));

  for (const project of data.projects) {
    g.setNode(project.id, {
      width: PROJECT_NODE_WIDTH,
      height: PROJECT_NODE_HEIGHT,
      type: 'project'
    });
  }

  for (const task of data.tasks) {
    g.setNode(task.id, {
      width: TASK_NODE_WIDTH,
      height: TASK_NODE_HEIGHT,
      type: 'task'
    });
    
    if (task.project_id) {
      g.setParent(task.id, task.project_id);
    }
  }

  for (const edge of data.edges) {
    g.setEdge(edge.from, edge.to);
  }

  dagre.layout(g);

  const nodes = new Map<string, LayoutNode>();
  const layoutEdges: LayoutEdge[] = [];

  g.nodes().forEach((nodeId) => {
    const node = g.node(nodeId);
    if (node) {
      nodes.set(nodeId, {
        id: nodeId,
        x: node.x,
        y: node.y,
        width: node.width,
        height: node.height
      });
    }
  });

  g.edges().forEach((edgeObj) => {
    const edge = g.edge(edgeObj);
    const points = edge.points || [];
    layoutEdges.push({
      from: edgeObj.v,
      to: edgeObj.w,
      points
    });
  });

  const graphAttrs = g.graph();
  
  return {
    nodes,
    edges: layoutEdges,
    width: graphAttrs.width || 800,
    height: graphAttrs.height || 600
  };
}
