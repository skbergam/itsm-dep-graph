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

### Recovering Subagent Spans

Timelines can be enriched with **nested subagent** spans (Task tool calls within parent agents) using the `recover_subagents.py` script:

```bash
# Set your Cursor API key
export CURSOR_API_KEY="your-api-key-here"

# Recover subagent spans from parent agent transcripts
python3 recover_subagents.py --timeline public/timelines/<id>.json
```

**What it does:**
- Reads agent IDs from `links.agents` in the timeline JSON
- Fetches full transcripts for each parent agent
- Extracts Task tool calls (which spawn subagents) from transcripts
- Recovers subagent bcIds from Task tool results
- Emits `subagent.started` and `subagent.ended` events with proven timestamps
- Emits `subagent` spans with duration (or open-ended → `as_of`)
- **Deterministic timestamps only** — extracted from source records (ISO from ms)
- **Never invents** spans when timing cannot be proven from transcript

**Recovery Strategy:**
1. Fetch transcript for each parent agent in timeline
2. Find all Task tool calls (these spawn subagents)
3. Extract subagent bcId from Task tool results
4. For each subagent, extract timing from the transcript:
   - `started_at_ms` from Task tool call message timestamp
   - `completed_at_ms` from Task tool result message timestamp
5. Emit subagent.started and subagent.ended events with proven timestamps
6. Emit subagent spans with duration
7. For subagents still running at `as_of` time: emit open-ended span

**UI Display:**
- Subagent events and spans are displayed with distinct lime-green color
- Event type shows as "Subagent Started" / "Subagent Ended"
- Span kind shows as "Subagent"
- Hover shows subagent ID, parent agent ID, and description

**Known Gaps:**
- Subagent recovery requires parent agent transcript API access
- If transcript API is unavailable: adds omission, skips subagent spans
- Transcript structure may vary; script handles common patterns
- Only Task tool calls with recoverable bcIds are processed
- Parallel sibling cloud agents (bc-*) are NOT subagents — they're separate runs

**Integration Notes:**
- This script is designed to be integrated into the gather pipeline
- For gather pipelines that don't use Cursor API: adapt to use MCP `batch-fetch-details`
- See script comments for alternative recovery approaches from transcript structure

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
