"use client";

import { memo } from "react";
import { NodeProps } from "@xyflow/react";
import type { Project } from "@/types/graph";

function ProjectNode({ data }: NodeProps) {
  const project = data.project as Project;

  return (
    <div
      className="rounded-xl border-2 border-purple-500/50 bg-purple-900/20 backdrop-blur-sm p-4"
      style={{
        width: "100%",
        height: "100%",
      }}
    >
      <div className="flex flex-col">
        <div className="text-xs font-semibold text-purple-300 uppercase tracking-wider mb-1">
          {project.prefix || project.id}
        </div>
        <div className="text-base font-bold text-purple-100 leading-tight">
          {project.name}
        </div>
      </div>
    </div>
  );
}

export default memo(ProjectNode);
