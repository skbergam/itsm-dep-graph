# Subagent Span Recovery - Implementation Notes

## Problem Statement

Timeline gather needed to show **nested subagent spans** (Task tool calls within parent cloud agents) on the timeline UI, but the gather pipeline had no proven mechanism to extract subagent start/end timestamps from available sources.

**Key constraint**: Only emit spans with **deterministic timestamps** from source records — never invent timings from vibes or wall-clock guesses.

## Solution Overview

Created `recover_subagents.py` script that:

1. Reads timeline JSON with parent agent IDs in `links.agents`
2. Fetches full transcripts for each parent agent
3. Parses transcripts to find Task tool calls (which spawn subagents)
4. Extracts subagent bcIds from Task tool result content
5. Recovers proven timestamps from transcript message metadata
6. Emits `subagent.started` / `subagent.ended` events and `subagent` spans

## Recovery Strategy

### Transcript Structure

Parent agent transcripts contain:
- `messages` array with role-based conversation flow
- Tool calls in `assistant` messages with `tool_calls` array
- Tool results in `tool` messages with matching `tool_call_id`
- Timing metadata: `started_at_ms`, `completed_at_ms`, or `timestamp_ms`

### Extraction Steps

For each Task tool call:

1. **Find Tool Call**: Look for `assistant` messages with `tool_calls` where `function.name === 'Task'`
2. **Extract Start Time**: Use `started_at_ms` or `timestamp_ms` from the tool call message
3. **Parse Arguments**: Extract `description` from tool call arguments for span metadata
4. **Find Tool Result**: Locate matching `tool` message with same `tool_call_id`
5. **Extract End Time**: Use `completed_at_ms` or `timestamp_ms` from result message
6. **Extract Subagent ID**: Parse `cloudAgentBcId` from tool result content (JSON or text search)
7. **Validate**: Only emit span if we have both subagent ID and start time

### Event and Span Generation

For each recovered subagent:

**Events:**
- `subagent.started`: emitted with proven start timestamp from transcript
- `subagent.ended`: emitted with proven end timestamp (if available)

**Spans:**
- `kind: 'subagent'` with start/end times
- If no `completed_at_ms`: use timeline `as_of` and mark `open_ended: true`
- Duration in seconds calculated from millisecond timestamps

**Metadata:**
- `subagent_id`: The nested agent's bcId
- `parent_agent_id`: The parent agent that spawned it
- `description`: Task description from tool call arguments
- `evidence`: Notes the source of the timing data

## UI Integration

### Schema Updates

Added to `types/timeline.ts`:

```typescript
export interface TaskTimelineSpan {
  kind: 'wall' | 'waiting_human' | 'idle' | 'stuck' | 'ci' | 'agent' | 'subagent';
  // ...
  meta?: {
    subagent_id?: string;
    parent_agent_id?: string;
    description?: string;
    open_ended?: boolean;
    // ...
  };
}
```

### Visual Styling

In `app/timelines/[id]/TimelineView.tsx`:

**Event Colors:**
- `subagent.started`: `#84cc16` (lime-500)
- `subagent.ended`: `#65a30d` (lime-600)

**Span Colors:**
- `subagent`: `bg-lime-500`

**Labels:**
- Event type: "Subagent Started" / "Subagent Ended"
- Span kind: "Subagent"

### UI Behavior

- Subagent events appear as lime-green dots on waterfall timeline
- Subagent spans appear as lime-green bars below wall/agent spans
- Hover shows subagent ID, parent agent, and description
- Distinct from parent agent spans (cyan) and sibling cloud agents

## Known Gaps and Omissions

### When Recovery Fails

Add omission to timeline JSON:

```json
{
  "wanted": "subagent.*",
  "reason": "No Task tool calls with recoverable subagent bcIds found in parent agent transcripts"
}
```

### Gap Scenarios

1. **Transcript API Unavailable**: Cannot fetch parent transcripts → no subagent recovery
2. **Task Tool Missing bcId**: Tool result doesn't contain `cloudAgentBcId` → cannot link to subagent
3. **Incomplete Timing**: Missing `started_at_ms` or `completed_at_ms` → partial or no span
4. **Transcript Structure Variation**: Non-standard transcript format → parsing may fail
5. **Background Tasks**: Task tool calls that completed after parent finished → may have `null` end time

### What This Does NOT Recover

- **Parallel sibling cloud agents** (`bc-*` runs launched separately) — these are NOT subagents
- **System notifications about Tasks** — these lack structured timing or stable IDs
- **Subagents from other sources** — only recovers from parent transcript Task tool calls

## Integration with Gather Pipeline

This script is designed to be run **after** the initial timeline gather:

```bash
# 1. Gather timeline (external process - e.g., from elementum-fde/products)
#    Produces: public/timelines/<id>.json

# 2. Enrich with agent usage (optional)
python3 enrich_timeline.py --timeline public/timelines/<id>.json

# 3. Recover subagent spans
python3 recover_subagents.py --timeline public/timelines/<id>.json

# 4. View in UI
#    Open: http://localhost:3000/timelines/<id>
```

### Alternative: MCP Integration

For gather pipelines running as cloud agents with MCP access:

Instead of direct API calls, use `cursor-cloud` MCP tools:

```python
# Fetch transcripts via MCP batch-fetch-details
from mcp import call_tool

results = call_tool('cursor-cloud', 'batch-fetch-details', {
    'bcIds': agent_ids,
    'includeTranscripts': True
})

# Read transcripts from filesystem paths in results
for bc_id, paths in results['agents'].items():
    transcript_path = paths['transcript']
    with open(transcript_path) as f:
        transcript = json.load(f)
    # ... extract subagents as in recover_subagents.py
```

This avoids direct HTTP calls and works in cloud agent environments.

## Testing

### Demo Timeline

Created `public/timelines/subagent-demo.json` with:
- 1 parent agent span
- 2 subagent spans (one 5min, one 13min)
- Proper event sequence showing subagent start/end within parent agent lifetime

### Build Verification

```bash
npm run build
# ✓ Compiled successfully
# ✓ Types valid
# ✓ All timelines including subagent-demo render
```

### Visual Verification

1. Open timeline with subagent spans in browser
2. Check waterfall shows lime-green subagent bars nested within cyan agent span
3. Hover over subagent events to see metadata
4. Verify subagent span label shows "Subagent" with correct description

## Future Enhancements

1. **Subagent Usage Data**: Extend `enrich_timeline.py` to fetch usage for subagent bcIds
2. **Nested Depth Visualization**: Indent or tree-view for multi-level subagent hierarchies
3. **Subagent Links**: Click subagent span → open subagent's own timeline (if available)
4. **Live Recovery**: Integrate directly into gather pipeline instead of post-process script
5. **Transcript Caching**: Cache fetched transcripts to avoid redundant API calls

## Deterministic Timestamp Contract

**Golden rule**: Never emit a span without a proven timestamp from source records.

- ✅ Use `started_at_ms` / `completed_at_ms` from transcript messages
- ✅ Convert milliseconds to ISO 8601 UTC strings
- ✅ Use timeline `as_of` for open-ended spans (mark with `open_ended: true`)
- ❌ Never guess timing from duration vibes
- ❌ Never infer from wall-clock or system time
- ❌ Never assume "probably started around here"

If timing cannot be proven: add omission, skip span.

## References

- **Timeline Schema**: `types/timeline.ts`
- **UI Component**: `app/timelines/[id]/TimelineView.tsx`
- **Recovery Script**: `recover_subagents.py`
- **Enrichment Script**: `enrich_timeline.py`
- **Demo Timeline**: `public/timelines/subagent-demo.json`

---

**Author**: Cloud Agent (PJM-11)  
**Date**: 2026-09-11  
**Status**: ✅ Implemented, tested, documented
