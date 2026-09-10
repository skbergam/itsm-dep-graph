"use client";

import { memo } from "react";
import { NodeProps } from "@xyflow/react";
import type { Project } from "@/types/graph";

function ProjectNode({ data }: NodeProps) {
  const project = data.project as Project;
  const hovered = data.hovered as boolean | undefined;

  return (
    <div
      className={`rounded-lg border transition-all ${
        hovered 
          ? "border-purple-400 bg-purple-900/30 shadow-md shadow-purple-400/30" 
          : "border-purple-500/40 bg-purple-900/15"
      } backdrop-blur-sm p-2.5`}
      style={{
        width: "100%",
        height: "100%",
      }}
    >
      <div className="flex flex-col">
        <div className="text-xs font-semibold text-purple-300/70 uppercase tracking-wider mb-0.5">
          {project.prefix || project.id}
        </div>
        <div className="text-sm font-bold text-purple-100/80 leading-tight">
          {project.name}
        </div>
      </div>
    </div>
  );
}

export default memo(ProjectNode);
