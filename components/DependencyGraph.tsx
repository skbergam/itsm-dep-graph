"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import {
  ReactFlow,
  Node,
  Edge,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Panel,
  useReactFlow,
  ReactFlowProvider,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "dagre";
import type { GraphData, Task, Project } from "@/types/graph";
import TaskNode from "./TaskNode";
import ProjectNode from "./ProjectNode";
import Sidebar from "./Sidebar";

const STATUS_COLORS = {
  "Not started": "#9CA3AF",
  "In progress": "#3B82F6",
  "Waiting": "#EAB308",
  "Blocked": "#EF4444",
  "Done": "#22C55E",
};

const nodeTypes = {
  task: TaskNode,
  project: ProjectNode,
};

function getLayoutedElements(
  graphData: GraphData
): { nodes: Node[]; edges: Edge[] } {
  const dagreGraph = new dagre.graphlib.Graph({ compound: true });
  dagreGraph.setDefaultEdgeLabel(() => ({}));

  dagreGraph.setGraph({
    rankdir: "TB",
    ranksep: 80,
    nodesep: 40,
    edgesep: 20,
  });

  const projectMap = new Map<string, Project>();
  graphData.projects.forEach((p) => projectMap.set(p.id, p));

  const tasksByProject = new Map<string, Task[]>();
  graphData.tasks.forEach((task) => {
    const projectId = task.project_ids[0] || "unknown";
    if (!tasksByProject.has(projectId)) {
      tasksByProject.set(projectId, []);
    }
    tasksByProject.get(projectId)!.push(task);
  });

  graphData.projects.forEach((project) => {
    dagreGraph.setNode(project.id, {
      width: 300,
      height: 120,
      type: "project",
    });
  });

  graphData.tasks.forEach((task) => {
    dagreGraph.setNode(task.id, {
      width: 280,
      height: 85,
      type: "task",
    });

    const projectId = task.project_ids[0];
    if (projectId) {
      dagreGraph.setParent(task.id, projectId);
    }
  });

  graphData.edges.forEach((edge) => {
    dagreGraph.setEdge(edge.from, edge.to);
  });

  dagre.layout(dagreGraph);

  const nodes: Node[] = [];
  const projectChildBounds = new Map<string, { minY: number; maxY: number }>();

  graphData.tasks.forEach((task) => {
    const nodeData = dagreGraph.node(task.id);
    const projectId = task.project_ids[0];
    const projectNode = projectId ? dagreGraph.node(projectId) : null;

    if (nodeData && projectNode) {
      const relativeY = nodeData.y - projectNode.y;
      const taskHeight = nodeData.height;
      const taskTop = relativeY - taskHeight / 2;
      const taskBottom = relativeY + taskHeight / 2;

      if (!projectChildBounds.has(projectId)) {
        projectChildBounds.set(projectId, { minY: taskTop, maxY: taskBottom });
      } else {
        const bounds = projectChildBounds.get(projectId)!;
        bounds.minY = Math.min(bounds.minY, taskTop);
        bounds.maxY = Math.max(bounds.maxY, taskBottom);
      }
    }
  });

  graphData.projects.forEach((project) => {
    const nodeData = dagreGraph.node(project.id);
    if (nodeData) {
      const bounds = projectChildBounds.get(project.id);
      const projectHeight = bounds 
        ? Math.max(80, bounds.maxY - bounds.minY + 40)
        : 80;

      nodes.push({
        id: project.id,
        type: "project",
        position: { x: nodeData.x - nodeData.width / 2, y: nodeData.y - projectHeight / 2 },
        data: { project },
        style: {
          width: nodeData.width,
          height: projectHeight,
        },
      });
    }
  });

  graphData.tasks.forEach((task) => {
    const nodeData = dagreGraph.node(task.id);
    const projectId = task.project_ids[0];
    const projectNode = projectId ? dagreGraph.node(projectId) : null;

    if (nodeData && projectNode) {
      const relativeX = nodeData.x - projectNode.x;
      const relativeY = nodeData.y - projectNode.y;

      nodes.push({
        id: task.id,
        type: "task",
        position: { x: relativeX, y: relativeY },
        parentId: projectId,
        extent: "parent",
        data: { task },
        style: {
          width: nodeData.width,
          height: nodeData.height,
        },
      });
    }
  });

  const edges: Edge[] = graphData.edges.map((edge) => {
    const sourceTask = graphData.tasks.find((t) => t.id === edge.from);
    const targetTask = graphData.tasks.find((t) => t.id === edge.to);
    const isBlockedTarget = targetTask?.status === "Blocked";
    const isBlockedSource = sourceTask?.status === "Blocked";

    return {
      id: `${edge.from}-${edge.to}`,
      source: edge.from,
      target: edge.to,
      animated: isBlockedTarget || isBlockedSource,
      style: {
        stroke: isBlockedTarget || isBlockedSource ? "#EF4444" : "#94A3B8",
        strokeWidth: isBlockedTarget || isBlockedSource ? 4 : 3,
        opacity: 0.9,
      },
      markerEnd: {
        type: "arrowclosed" as const,
        color: isBlockedTarget || isBlockedSource ? "#EF4444" : "#94A3B8",
        width: 24,
        height: 24,
      },
    };
  });

  return { nodes, edges };
}

function DependencyGraphInner() {
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [initialFitDone, setInitialFitDone] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const reactFlowInstance = useReactFlow();

  useEffect(() => {
    fetch("/out/itsm-graph.json")
      .then((res) => res.json())
      .then((data: GraphData) => {
        setGraphData(data);
        const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(data);
        setNodes(layoutedNodes);
        setEdges(layoutedEdges);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load graph data:", err);
        setLoading(false);
      });
  }, [setNodes, setEdges]);

  useEffect(() => {
    if (!graphData) return;

    setEdges((eds) =>
      eds.map((edge) => {
        if (!selectedProjectId) {
          return edge;
        }

        const sourceNode = nodes.find((n) => n.id === edge.source);
        const targetNode = nodes.find((n) => n.id === edge.target);
        
        const sourceProjectId = sourceNode?.parentId || sourceNode?.id;
        const targetProjectId = targetNode?.parentId || targetNode?.id;
        
        const isCrossProject = sourceProjectId !== targetProjectId;
        const shouldDim = isCrossProject && 
          sourceProjectId !== selectedProjectId && 
          targetProjectId !== selectedProjectId;

        const sourceTask = graphData.tasks.find((t) => t.id === edge.source);
        const targetTask = graphData.tasks.find((t) => t.id === edge.target);
        const isBlockedTarget = targetTask?.status === "Blocked";
        const isBlockedSource = sourceTask?.status === "Blocked";

        return {
          ...edge,
          style: {
            ...edge.style,
            opacity: shouldDim ? 0.15 : (isBlockedTarget || isBlockedSource ? 0.9 : 0.9),
          },
        };
      })
    );
  }, [selectedProjectId, nodes, graphData, setEdges]);

  useEffect(() => {
    if (!loading && nodes.length > 0 && !initialFitDone) {
      setTimeout(() => {
        const firstProject = nodes.find((n) => n.type === "project");
        if (firstProject) {
          reactFlowInstance.fitView({
            padding: 0.3,
            duration: 0,
            nodes: [firstProject],
            minZoom: 0.5,
            maxZoom: 2,
          });
        }
        setInitialFitDone(true);
      }, 50);
    }
  }, [loading, nodes, initialFitDone, reactFlowInstance]);

  const handleNodeSelect = useCallback((nodeId: string | null) => {
    setSelectedNodeId(nodeId);
    
    let projectId: string | null = null;
    if (nodeId) {
      const node = nodes.find((n) => n.id === nodeId);
      if (node) {
        projectId = node.type === "project" ? node.id : node.parentId || null;
      }
    }
    setSelectedProjectId(projectId);
    
    setNodes((nds) =>
      nds.map((node) => ({
        ...node,
        data: {
          ...node.data,
          selected: node.id === nodeId,
        },
      }))
    );

    if (nodeId) {
      const node = nodes.find((n) => n.id === nodeId);
      if (node) {
        const targetProjectId = node.type === "project" ? node.id : node.parentId;
        const projectNode = targetProjectId ? nodes.find((n) => n.id === targetProjectId) : null;
        
        if (projectNode) {
          reactFlowInstance.fitView({
            padding: 0.3,
            duration: 800,
            nodes: [projectNode],
            minZoom: 0.5,
            maxZoom: 2,
          });
        }
      }
    }
  }, [setNodes, nodes, reactFlowInstance]);

  const handleNodeHover = useCallback((nodeId: string | null) => {
    setHoveredNodeId(nodeId);
    setNodes((nds) =>
      nds.map((node) => ({
        ...node,
        data: {
          ...node.data,
          hovered: node.id === nodeId,
        },
      }))
    );
  }, [setNodes]);

  const miniMapNodeColor = useCallback((node: Node) => {
    if (node.type === "project") return "#A855F7";
    const task = node.data.task as Task | undefined;
    return task ? STATUS_COLORS[task.status] : "#9CA3AF";
  }, []);

  const handleFitAll = useCallback(() => {
    reactFlowInstance.fitView({
      padding: 0.2,
      duration: 800,
      minZoom: 0.5,
      maxZoom: 2,
    });
  }, [reactFlowInstance]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-900 text-white">
        <div className="text-xl">Loading dependency graph...</div>
      </div>
    );
  }

  if (!graphData) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-900 text-white">
        <div className="text-xl text-red-400">Failed to load graph data</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen bg-slate-900">
      <Sidebar
        graphData={graphData}
        selectedNodeId={selectedNodeId}
        hoveredNodeId={hoveredNodeId}
        onNodeSelect={handleNodeSelect}
        onNodeHover={handleNodeHover}
      />
      <div className="flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          minZoom={0.5}
          maxZoom={2}
          defaultViewport={{ x: 0, y: 0, zoom: 1.0 }}
          onNodeClick={(_, node) => handleNodeSelect(node.id)}
          onNodeMouseEnter={(_, node) => handleNodeHover(node.id)}
          onNodeMouseLeave={() => handleNodeHover(null)}
        >
          <Background color="#334155" gap={16} />
          <Controls showInteractive={false} />
          <Panel position="top-right" className="flex gap-2 m-2">
            <a
              href="/timelines/example"
              className="px-3 py-1.5 bg-purple-700 hover:bg-purple-600 text-white text-sm font-medium rounded border border-purple-500 transition-colors"
              title="View task timelines"
            >
              Timelines
            </a>
            <button
              onClick={handleFitAll}
              className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium rounded border border-slate-500 transition-colors"
              title="Fit all projects"
            >
              Fit All
            </button>
          </Panel>
          <MiniMap
            nodeColor={miniMapNodeColor}
            pannable
            zoomable
            style={{
              backgroundColor: "#1e293b",
              border: "1px solid #475569",
            }}
          />
        </ReactFlow>
      </div>
    </div>
  );
}

export default function DependencyGraph() {
  return (
    <ReactFlowProvider>
      <DependencyGraphInner />
    </ReactFlowProvider>
  );
}
