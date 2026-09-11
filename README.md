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

## Timeline Feature

This repo includes a timeline viewer for ITSM task execution (see `app/timelines/[id]/` and `public/timelines/`).

### Enriching Timelines with Agent Usage

Timelines can be enriched with real Cursor Cloud Agents API usage data (tokens and cost) using the `enrich_timeline.py` script:

```bash
# Set your Cursor API key
export CURSOR_API_KEY="your-api-key-here"

# Enrich a timeline with agent usage data
python3 enrich_timeline.py --timeline public/timelines/<id>.json
```

**What it does:**
- Reads agent IDs from `links.agents` in the timeline JSON
- Calls `GET /v1/agents/{id}/usage` for each agent (Cursor Cloud Agents API)
- Enriches `agent.started`/`agent.ended` events with `meta.usage` fields:
  - `inputTokens`, `outputTokens`, `totalTokens`, `costUsd`
- Adds omissions for agents where usage data is unavailable (404/error)
- **Never invents** token counts — missing usage stays empty

**UI Display:**
- Agent event/span hover shows token usage and cost (when present)
- If usage is unavailable, nothing is shown (no fake zeros)

**Environment Variables:**
- `CURSOR_API_KEY`: Required. Your Cursor API key for authenticating with the Cursor Cloud Agents API. Get yours from [cursor.com/settings/api](https://cursor.com/settings/api).

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
