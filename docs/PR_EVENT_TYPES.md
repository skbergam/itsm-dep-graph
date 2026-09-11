# PR Event Types - Canonical Reference

This document defines the canonical event types for PR status and draft state changes in the timeline system.

## Event Types by Target State

### PR Status Events

| Event Type | Target State | Color | Description |
|------------|--------------|-------|-------------|
| `pr.created` | N/A | `#f59e0b` (amber-500) | PR opened |
| `pr.merged` | merged | `#22c55e` (green-500) | PR status changed to merged |
| `pr.closed` | closed | `#ef4444` (red-500) | PR status changed to closed (without merging) |
| `pr.reopened` | open | `#3b82f6` (blue-500) | PR status changed back to open |

### PR Draft Status Events

| Event Type | Target State | Color | Description |
|------------|--------------|-------|-------------|
| `pr.set_to_draft` | draft | `#ec4899` (pink-500) | PR draft status set (converted to draft) |
| `pr.ready_for_review` | ready/ready_for_review | `#a78bfa` (violet-400) | PR draft status removed (marked ready for review) |

### Other PR Events

| Event Type | Color | Description |
|------------|-------|-------------|
| `pr.updated` | `#f97316` (orange-500) | PR updated (new commits, description changes, etc.) |

## Migration from Umbrella Types

Previously, the system used umbrella types `pr.status_changed` and `pr.draft_changed` with a `meta.to` field to indicate the target state. These have been split into distinct event types:

### Status Changes
- `pr.status_changed` with `meta.to="merged"` → `pr.merged`
- `pr.status_changed` with `meta.to="closed"` → `pr.closed`
- `pr.status_changed` with `meta.to="open"` → `pr.reopened`

### Draft Status Changes
- `pr.draft_changed` with `meta.to="draft"` → `pr.set_to_draft`
- `pr.draft_changed` with `meta.to="ready"` or `"ready_for_review"` → `pr.ready_for_review`

## Implementation Notes

1. **Type Definitions**: Documented in `types/timeline.ts`
2. **Color Mapping**: Defined in `eventTypeColors` in `app/timelines/[id]/TimelineView.tsx`
3. **Friendly Names**: Generated in `getFriendlyEventTypeName()` function
4. **Migration Script**: `normalize_pr_events.py` can normalize existing JSON files

## Display Rules

Each event type has its own unique color that is consistently used across:
- Event dots on the timeline waterfall
- Event bars on the wall time strip
- Hover highlights and borders
- Legend entries

The friendly display names follow the pattern: `PR #{number} {Action}`, for example:
- `PR #123 Merged`
- `PR #123 Set to Draft`
- `PR #123 Ready for Review`
- `PR #123 Closed`
