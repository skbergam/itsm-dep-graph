# ITSM Dependency Graph (Next.js)

Modern hierarchical dependency graph visualizer for ITSM tasks, built with **Next.js**, **React Flow**, and **dagre** layout engine.

## Live

- **App**: https://itsm-dep-graph.vercel.app
- **Repo**: https://github.com/skbergam/itsm-dep-graph

## Features

- **Blocked Task Emphasis**: Impossible to miss — red coloring, bold borders, animated edges
- **Hierarchical DAG**: Tasks organized under project containers, not flat blobs
- **Readable Names**: Default zoom shows task IDs and names clearly
- **Bidirectional Sync**: Click sidebar → canvas pans; click canvas → sidebar scrolls
- **Notion Status Colors**:
  - 🟢 **Done** (green)
  - 🔵 **In Progress** (blue)
  - 🟡 **Waiting** (yellow)
  - 🔴 **Blocked** (red)
  - ⚪ **Not Started** (gray)
  - 🟣 **Projects** (purple)
- **Clear Dependency Edges**: Arrows show direction, animated for blocked tasks

## Running Locally  // pragma: allowlist secret

Install dependencies and start the server:

```bash
npm install && npm start
```

Open http://localhost:3000 in your browser.

## Building

```bash
npm run build
```

Generates static export in `dist/` folder.

## Data Format

The app consumes `out/itsm-graph.json` with this structure:

```json
{
  "projects": [
    {
      "id": "proj-ontology",
      "name": "Platform - Ontology",
      "prefix": "ONTO"
    }
  ],
  "tasks": [
    {
      "id": "task-uuid",
      "name": "ONTO-5 — TypeBox vs Zod bakeoff",
      "code": "ONTO-5",
      "status": "Not started",
      "project_ids": ["proj-ontology"],
      "depends_on": ["other-task-id"]
    }
  ],
  "edges": [
    {
      "from": "task-a",
      "to": "task-b"
    }
  ]
}
```

### Status Values

Must be one of: `"Not started"`, `"In progress"`, `"Waiting"`, `"Blocked"`, `"Done"`

## Deployment

Vercel detects Next.js automatically. The build outputs static files to `dist/` via `output: "export"` in `next.config.ts`.

## Tech Stack

- **Next.js 15** (React 19, static export)
- **React Flow 12** (canvas rendering, controls, minimap)
- **dagre 0.8** (hierarchical DAG layout)
- **TypeScript 5.7**
- **Tailwind CSS 3.4**

## Architecture

- **`app/page.tsx`**: Entry point, dynamic import of graph component
- **`components/DependencyGraph.tsx`**: Main orchestrator (layout, state, React Flow setup)
- **`components/TaskNode.tsx`**: Task node rendering with status colors
- **`components/ProjectNode.tsx`**: Project container rendering
- **`components/Sidebar.tsx`**: Task list with selection sync
- **`types/graph.ts`**: TypeScript interfaces for data shape

The layout engine uses dagre's compound graph feature to nest tasks inside project nodes. React Flow provides pan/zoom, minimap, and interactive controls. Bidirectional selection uses `useReactFlow()` hook for programmatic viewport control.

## Clean Rewrite Notes

This is a **clean rewrite** from the original Vite+canvas implementation. The old approach had:
- Tiny canvas-rendered labels (unreadable at default zoom)
- Blob layout without clear project hierarchy
- Weak edge visibility

The new Next.js + React Flow solution addresses all experience contract requirements:
- Task names readable by default
- Projects as visual containers (purple borders)
- Blocked tasks with red emphasis + animated edges
- Sidebar ↔ canvas bidirectional selection sync
- Clear dependency arrows

---

**Internal tool for ITSM dependency visualization.**
