# ITSM Dependency Graph Visualizer

A TypeScript-based dependency graph visualizer for ITSM tasks, built with Vite, Canvas API, and dagre layout engine.

## Features

- **Hierarchical DAG Layout**: Tasks organized under their projects with proper dependency layering
- **Interactive Canvas**: Pan, zoom, and click nodes
- **Bidirectional Highlighting**: Hover in sidebar highlights graph nodes and vice versa
- **Status Color Coding**:
  - 🟢 **Done** (green)
  - 🔵 **In Progress** (blue)
  - 🟡 **Waiting** (yellow)
  - 🔴 **Blocked** (red)
  - ⚪ **Not Started** (gray)
  - 🟣 **Projects** (purple)
- **Dependency Edges**: Clear arrows showing task dependencies, including cross-project dependencies
- **Offline-Capable**: Bundled static artifact works via `file://` or simple HTTP server

## Project Structure

```
/workspace/itsm-dep-graph/
├── out/
│   └── itsm-graph.json       # Fixture data (3 projects, 22 tasks)
├── src/
│   ├── main.ts               # Entry point
│   ├── types.ts              # TypeScript types
│   ├── layout.ts             # Dagre layout engine
│   ├── renderer.ts           # Canvas rendering
│   ├── sidebar.ts            # Sidebar UI
│   └── style.css             # Styles
├── dist/                     # Built static artifact
├── index.html                # HTML template
├── package.json
└── README.md
```

## Installation

```bash
npm install
```

npm install
```

## Development // pragma: allowlist secret

Run the local server:

```bash
npm run dev  # pragma: allowlist secret
```

Then open http://localhost:5173 (or the port shown in terminal).

## Building

npm run build
```

This generates a `dist/` folder with bundled assets. To use offline:

1. Copy `out/itsm-graph.json` to `dist/out/` (or run the copy command below)
2. Open `dist/index.html` in a browser via `file://` or serve with any HTTP server

```bash
# After build, ensure fixture is in dist
cp -r out dist/

# Optional: serve locally
npx serve dist
```

## Data Format

The app consumes JSON from `out/itsm-graph.json` with this schema:

```json
{
  "projects": [
    {
      "id": "PROJ-ID",
      "name": "Project Name",
      "status": "in_progress"
    }
  ],
  "tasks": [
    {
      "id": "TASK-ID",
      "name": "Task Name",
      "status": "not_started|in_progress|waiting|blocked|done",
      "project_id": "PROJ-ID"
    }
  ],
  "edges": [
    {
      "from": "TASK-A",
      "to": "TASK-B"
    }
  ],
  "membership": {},
  "pulse": {}
}
```

## Regenerating Data

If using Notion MCP or another source:

1. Export ITSM data to `out/itsm-graph.json` in the format above
If using Notion MCP or another source:

1. Export ITSM data to `out/itsm-graph.json` in the format above
2. Refresh browser (local mode) or rebuild (production)

Example Python normalizer stub:

from notion_client import Client

# Fetch from Notion, normalize to schema
data = {
    "projects": [...],
    "tasks": [...],
    "edges": [...],
    "membership": {},
    "pulse": {}
}

with open('out/itsm-graph.json', 'w') as f:
    json.dump(data, f, indent=2)
```

## Usage for Grok Bot

Built artifact can be copied to Grok Bot scratch box:

```bash
# Build and prepare
npm run build
cp -r out dist/

# Copy entire folder to Grok Bot workspace
# Path: /workspace/itsm-dep-graph/
```

# Path: /workspace/itsm-dep-graph/
```

Open `dist/index.html` or use the local server output.

## Controls

- **Click + Drag**: Pan canvas
- **Hover**: Highlight task/project in sidebar and graph
- **Click Node**: Select and log to console

## Architecture

- **Layout Engine**: `@dagrejs/dagre` for hierarchical DAG layout with compound nodes (tasks grouped under projects)
- **Rendering**: HTML5 Canvas with manual node/edge drawing
- **No External CDN**: All dependencies bundled into `dist/assets/`
- **Responsive**: Mobile-friendly with vertical layout on small screens

## Tech Stack

- **TypeScript 6.0**
- **Vite 8.2** (build tool)
- **Dagre 1.1** (graph layout)
- **Vanilla JS/Canvas** (no React/Vue/etc.)

## License

Internal tool for Grok Bot ITSM dependency visualization.
