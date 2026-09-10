"use client";

import { useMemo } from "react";
import type { GraphData, Task } from "@/types/graph";

const STATUS_COLORS = {
  "Not started": "#9CA3AF",
  "In progress": "#3B82F6",
  "Waiting": "#EAB308",
  "Blocked": "#EF4444",
  "Done": "#22C55E",
};

interface SidebarProps {
  graphData: GraphData;
  selectedNodeId: string | null;
  hoveredNodeId: string | null;
  onNodeSelect: (nodeId: string | null) => void;
  onNodeHover: (nodeId: string | null) => void;
}

export default function Sidebar({
  graphData,
  selectedNodeId,
  hoveredNodeId,
  onNodeSelect,
  onNodeHover,
}: SidebarProps) {
  const tasksByProject = useMemo(() => {
    const map = new Map<string, Task[]>();
    graphData.tasks.forEach((task) => {
      const projectId = task.project_ids[0] || "unknown";
      if (!map.has(projectId)) {
        map.set(projectId, []);
      }
      map.get(projectId)!.push(task);
    });
    return map;
  }, [graphData.tasks]);

  const sortedProjects = useMemo(() => {
    return [...graphData.projects].sort((a, b) => {
      const aTasks = tasksByProject.get(a.id) || [];
      const bTasks = tasksByProject.get(b.id) || [];
      const aBlocked = aTasks.filter((t) => t.status === "Blocked").length;
      const bBlocked = bTasks.filter((t) => t.status === "Blocked").length;
      return bBlocked - aBlocked;
    });
  }, [graphData.projects, tasksByProject]);

  const blockedCount = useMemo(() => {
    return graphData.tasks.filter((t) => t.status === "Blocked").length;
  }, [graphData.tasks]);

  const waitingCount = useMemo(() => {
    return graphData.tasks.filter((t) => t.status === "Waiting").length;
  }, [graphData.tasks]);

  const inProgressCount = useMemo(() => {
    return graphData.tasks.filter((t) => t.status === "In progress").length;
  }, [graphData.tasks]);

  return (
    <div className="w-80 bg-slate-800 border-r border-slate-700 overflow-y-auto flex-shrink-0">
      <div className="sticky top-0 bg-slate-900 border-b border-slate-700 p-4 z-10">
        <h1 className="text-xl font-bold text-white mb-2">ITSM Tasks</h1>
        <div className="flex gap-2 text-xs">
          <div className="px-2 py-1 rounded bg-red-500/20 text-red-300 font-semibold border border-red-500/40">
            🚫 {blockedCount} Blocked
          </div>
          <div className="px-2 py-1 rounded bg-yellow-500/20 text-yellow-300 border border-yellow-500/30">
            {waitingCount} Waiting
          </div>
          <div className="px-2 py-1 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
            {inProgressCount} In Progress
          </div>
        </div>
      </div>

      <div className="p-3 space-y-4">
        {sortedProjects.map((project) => {
          const tasks = tasksByProject.get(project.id) || [];
          const sortedTasks = [...tasks].sort((a, b) => {
            const statusOrder = { Blocked: 0, Waiting: 1, "In progress": 2, "Not started": 3, Done: 4 };
            return statusOrder[a.status] - statusOrder[b.status];
          });

          return (
            <div key={project.id} className="space-y-2">
              <div
                className={`cursor-pointer rounded-lg p-2 border transition-all ${
                  "border-purple-500/30 bg-purple-900/10 hover:bg-purple-900/30"
                }`}
                onClick={() => {
                  const firstTask = sortedTasks[0];
                  if (firstTask) onNodeSelect(firstTask.id);
                }}
              >
                <div className="text-xs font-semibold text-purple-300 uppercase tracking-wide">
                  {project.prefix || project.id}
                </div>
                <div className="text-sm font-bold text-purple-100 mt-0.5">
                  {project.name}
                </div>
              </div>

              <div className="space-y-1.5 ml-2">
                {sortedTasks.map((task) => {
                  const isBlocked = task.status === "Blocked";
                  const isSelected = selectedNodeId === task.id;
                  const isHovered = hoveredNodeId === task.id;
                  const backgroundColor = STATUS_COLORS[task.status];

                  return (
                    <div
                      key={task.id}
                      className={`cursor-pointer rounded-md p-2.5 transition-all border-2 ${
                        isBlocked
                          ? "border-red-500 bg-red-500/15 shadow-md shadow-red-500/20"
                          : isSelected
                          ? "border-white bg-slate-700/50 shadow-md shadow-white/30"
                          : isHovered
                          ? "border-blue-400 bg-blue-500/20 shadow-lg shadow-blue-400/40"
                          : "border-transparent bg-slate-700/30 hover:bg-slate-700/50"
                      }`}
                      onClick={() => onNodeSelect(task.id)}
                      onMouseEnter={() => onNodeHover(task.id)}
                      onMouseLeave={() => onNodeHover(null)}
                    >
                      <div className="flex items-start gap-2">
                        <div
                          className="w-1 h-full rounded-full flex-shrink-0 mt-0.5"
                          style={{ backgroundColor }}
                        />
                        <div className="flex-1 min-w-0">
                          <div
                            className={`text-sm leading-tight ${
                              isBlocked
                                ? "font-bold text-white"
                                : "font-semibold text-slate-100"
                            }`}
                          >
                            {task.name}
                          </div>
                          {task.code && (
                            <div
                              className={`text-xs mt-1 uppercase tracking-wide truncate ${
                                isBlocked ? "text-red-300/70" : "text-slate-400"
                              }`}
                            >
                              {task.code}
                            </div>
                          )}
                          <div className="flex items-center gap-2 mt-1.5 text-xs">
                            <span
                              className={`px-1.5 py-0.5 rounded font-medium ${
                                isBlocked
                                  ? "bg-red-900/60 text-red-100"
                                  : "text-slate-400"
                              }`}
                              style={{
                                color: isBlocked ? undefined : backgroundColor,
                              }}
                            >
                              {task.status}
                            </span>
                            {task.bot && (
                              <span className="text-slate-400 truncate">
                                {task.bot}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
