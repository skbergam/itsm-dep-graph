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
    const tasks = tasksByProject.get(project.id) || [];
    const projectHeight = Math.max(140, tasks.length * 95 + 50);
    
    dagreGraph.setNode(project.id, {
      width: 300,
      height: projectHeight,
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

  graphData.projects.forEach((project) => {
    const nodeData = dagreGraph.node(project.id);
    if (nodeData) {
      nodes.push({
        id: project.id,
        type: "project",
        position: { x: nodeData.x - nodeData.width / 2, y: nodeData.y - nodeData.height / 2 },
        data: { project },
        style: {
          width: nodeData.width,
          height: nodeData.height,
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

  const handleNodeSelect = useCallback((nodeId: string | null) => {
    setSelectedNodeId(nodeId);
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
        reactFlowInstance.fitView({
          padding: 0.3,
          duration: 800,
          nodes: [node],
        });
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
          fitView
          fitViewOptions={{ padding: 0.15 }}
          minZoom={0.1}
          maxZoom={2}
          defaultViewport={{ x: 0, y: 0, zoom: 1.0 }}
          onNodeClick={(_, node) => handleNodeSelect(node.id)}
          onNodeMouseEnter={(_, node) => handleNodeHover(node.id)}
          onNodeMouseLeave={() => handleNodeHover(null)}
        >
          <Background color="#334155" gap={16} />
          <Controls showInteractive={false} />
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
