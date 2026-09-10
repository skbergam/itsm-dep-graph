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
  const isBlocked = task.status === "Blocked";
  const backgroundColor = STATUS_COLORS[task.status];

  return (
    <div
      className={`rounded-lg px-4 py-3 border-2 transition-all ${
        isBlocked
          ? "border-red-500 shadow-lg shadow-red-500/40"
          : selected
          ? "border-white shadow-lg"
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
          {task.code && (
            <div className="text-xs font-bold text-white/90 uppercase tracking-wide">
              {task.code}
            </div>
          )}
          <div
            className={`text-sm font-semibold text-white leading-tight line-clamp-2 ${
              isBlocked ? "font-bold" : ""
            }`}
          >
            {task.name}
          </div>
        </div>
        
        <div className="flex items-center justify-between text-xs mt-2">
          <span
            className={`px-2 py-0.5 rounded ${
              isBlocked
                ? "bg-red-900/60 text-white font-bold"
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
