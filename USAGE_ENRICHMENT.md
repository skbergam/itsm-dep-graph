# Timeline Usage Enrichment - Implementation Summary

## Overview

This document describes how Cursor Cloud Agents API usage data (tokens and cost) is integrated into the timeline system for `skbergam/itsm-dep-graph`.

## Key Components

### 1. Enrichment Script: `enrich_timeline.py`

**Purpose**: Fetch real usage data from Cursor API and enrich timeline JSON.

**Usage**:
```bash
export CURSOR_API_KEY="your-api-key-here"
python3 enrich_timeline.py --timeline public/timelines/<id>.json
```

**What it does**:
1. Reads timeline JSON from file
2. Extracts agent IDs from `links.agents` array (e.g., `bc-998fc92a-...`)
3. Calls `GET https://api.cursor.com/v1/agents/{id}/usage` for each agent
4. Enriches `agent.started` and `agent.ended` events with `meta.usage`
5. Writes enriched timeline back to file (or `--out` path)

**API Response Schema**:
```json
{
  "inputTokens": 123456,
  "outputTokens": 78900,
  "costUsd": 1.23
}
```

**Enriched Event Example**:
```json
{
  "id": "evt_002",
  "type": "agent.started",
  "t": "2026-09-10T10:15:00Z",
  "source": "cursor",
  "source_ref": "bc_example123",
  "summary": "Cloud agent started implementation",
  "meta": {
    "agent_id": "bc_example123",
    "usage": {
      "inputTokens": 50000,
      "outputTokens": 25000,
      "totalTokens": 75000,
      "costUsd": 0.45
    }
  }
}
```

### 2. TypeScript Schema: `types/timeline.ts`

**New Interface**:
```typescript
export interface AgentUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  costUsd?: number;
}
```

**Updated Event Type**:
```typescript
export interface TaskTimelineEvent {
  id: string;
  type: string;
  t: string;
  source: string;
  source_ref: string;
  summary: string;
  meta: Record<string, unknown> & {
    usage?: AgentUsage;
    agent_id?: string;
  };
}
```

**Updated Span Type**:
```typescript
export interface TaskTimelineSpan {
  kind: 'wall' | 'waiting_human' | 'idle' | 'stuck' | 'ci' | 'agent';
  start: string;
  end: string;
  seconds: number;
  meta?: {
    usage?: AgentUsage;
    agent_id?: string;
    [key: string]: unknown;
  };
}
```

### 3. UI Display: `app/timelines/[id]/TimelineView.tsx`

**Utility Function** (`lib/timeline-utils.ts`):
```typescript
export function formatAgentUsage(usage: AgentUsage | undefined): string | null {
  if (!usage) return null;
  
  const parts: string[] = [];
  
  if (usage.inputTokens !== undefined || usage.outputTokens !== undefined) {
    const inTokens = usage.inputTokens ?? 0;
    const outTokens = usage.outputTokens ?? 0;
    const total = usage.totalTokens ?? (inTokens + outTokens);
    
    parts.push(`${total.toLocaleString()} tokens`);
    parts.push(`(${inTokens.toLocaleString()} in / ${outTokens.toLocaleString()} out)`);
  }
  
  if (usage.costUsd !== undefined) {
    parts.push(`$${usage.costUsd.toFixed(2)}`);
  }
  
  return parts.length > 0 ? parts.join(' · ') : null;
}
```

**Display Locations**:

1. **Agent Event Hover Tooltip**:
   - Shows on hover over agent event dot in waterfall
   - Format: `"75,000 tokens (50,000 in / 25,000 out) · $0.45"`

2. **Agent Event Row Highlight**:
   - Shows when row is highlighted or hovered
   - Displays inline below event summary

3. **Agent Span Hover**:
   - Shows on hover over agent span bar
   - Same format as event hover

4. **Agent Span Row Highlight**:
   - Shows when span row is highlighted or hovered
   - Displays inline below duration info

**Graceful Degradation**:
- If `usage` field is missing → shows nothing (not `0` or fake data)
- If only partial usage (e.g., no cost) → shows what's available
- UI never invents token counts from wall time or transcript length

## Data Flow

```
Timeline JSON (public/timelines/<id>.json)
    └─ links.agents: ["https://cursor.com/agents/bc-xxx", ...]
              │
              ▼
    enrich_timeline.py script
              │
              ├─ Extract agent IDs (bc-xxx)
              ├─ Call GET /v1/agents/{id}/usage
              └─ Enrich events[].meta.usage
              │
              ▼
    Enriched Timeline JSON
              │
              ▼
    TimelineView.tsx UI
              │
              ├─ Read event.meta.usage
              ├─ Format with formatAgentUsage()
              └─ Display in hover/highlight overlays
```

## Environment Variable

**Name**: `CURSOR_API_KEY`

**Where to get it**: https://cursor.com/settings/api

**How to set**:
```bash
export CURSOR_API_KEY="your-api-key-here"
```

**Required for**: Running `enrich_timeline.py` script

**Not required for**: UI rendering (UI just reads existing usage data from JSON)

## Omissions

If agent usage is unavailable (404, API error, etc.), the script adds an omission entry:

```json
{
  "omissions": [
    {
      "wanted": "agent.usage.bc-998fc92a-9bd0-412b-960b-65a7ec415187",
      "reason": "API returned 404 or error - usage unavailable"
    }
  ]
}
```

## Storage Location

Usage data is stored **inline** in the timeline JSON:

- **Events**: `events[].meta.usage` for `agent.started`/`agent.ended` events
- **Spans**: `spans[].meta.usage` for `kind: 'agent'` spans (future enhancement)

**Why inline?**
- Keeps timeline self-contained
- No separate usage database needed
- Easy to archive/version with timeline snapshots
- UI can render without API calls

## Testing Without API Key

```bash
# Script fails gracefully with clear message
python3 enrich_timeline.py --timeline public/timelines/example.json

# Output:
# Error: CURSOR_API_KEY environment variable not set and --api-key not provided
#
# Set your API key with:
#   export CURSOR_API_KEY='your-key-here'
```

## Example End-to-End Workflow

1. **Generate/fetch timeline** (via existing gather process)
   → Produces `public/timelines/abc123.json` with agent links

2. **Enrich with usage**:
   ```bash
   export CURSOR_API_KEY="sk-..."
   python3 enrich_timeline.py --timeline public/timelines/abc123.json
   ```
   → Adds `meta.usage` to agent events

3. **View in UI**:
   → Open https://itsm-dep-graph.vercel.app/timelines/abc123
   → Hover over agent events/spans to see tokens and cost

## Commit SHA

Latest commit: `bd88c62`

Branch: `cursor/pjm-10-agent-usage-timeline-4dd7`

PR: https://github.com/skbergam/itsm-dep-graph/pull/13
