"use client";

import { memo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import type { Task } from "@/types/graph";

const STATUS_COLORS = {
  "Not started": "#9CA3AF",
  "In progress": "#3B82F6",
  "Waiting": "#EAB308",
  "Blocked": "#EF4444",
  "Done": "#22C55E",
};

function TaskNode({ data }: NodeProps) {
  const task = data.task as Task;
  const selected = data.selected as boolean | undefined;
  const hovered = data.hovered as boolean | undefined;
  const isBlocked = task.status === "Blocked";
  const backgroundColor = STATUS_COLORS[task.status];

  return (
    <div
      className={`rounded-lg px-4 py-3 border-2 transition-all ${
        isBlocked
          ? "border-red-500 shadow-lg shadow-red-500/40"
          : selected
          ? "border-white shadow-lg shadow-white/50"
          : hovered
          ? "border-blue-400 shadow-lg shadow-blue-400/60 scale-105"
          : "border-slate-600"
      }`}
      style={{
        backgroundColor,
        width: "100%",
        height: "100%",
      }}
    >
      <Handle type="target" position={Position.Top} className="!bg-slate-400 !w-3 !h-3" />
      
      <div className="flex flex-col h-full justify-between">
        <div className="space-y-1">
          <div
            className={`text-base font-bold text-white leading-tight line-clamp-2 ${
              isBlocked ? "text-lg" : ""
            }`}
          >
            {task.name}
          </div>
          {task.code && (
            <div className="text-xs text-white/60 uppercase tracking-wide truncate">
              {task.code}
            </div>
          )}
        </div>
        
        <div className="flex items-center justify-between text-sm mt-2">
          <span
            className={`px-2 py-0.5 rounded font-semibold ${
              isBlocked
                ? "bg-red-900/60 text-white"
                : "bg-black/20 text-white/80"
            }`}
          >
            {task.status}
          </span>
          {task.bot && (
            <span className="text-white/70 text-xs truncate ml-2">
              {task.bot}
            </span>
          )}
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-slate-400 !w-3 !h-3" />
    </div>
  );
}

export default memo(TaskNode);
