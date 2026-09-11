#!/usr/bin/env python3
"""
Normalize PR events in timeline JSON files from umbrella types to distinct types.

Transforms:
- pr.draft_changed with meta.to="draft" -> pr.set_to_draft
- pr.draft_changed with meta.to="ready" or "ready_for_review" -> pr.ready_for_review
- pr.status_changed with meta.to="merged" -> pr.merged
- pr.status_changed with meta.to="closed" -> pr.closed
- pr.status_changed with meta.to="open" -> pr.reopened
"""

import json
import sys
from pathlib import Path


def normalize_event(event: dict) -> dict:
    """Normalize a single event from umbrella type to distinct type."""
    event_type = event.get("type", "")
    meta = event.get("meta", {})
    to_state = meta.get("to", "")
    
    if event_type == "pr.draft_changed":
        if to_state == "draft":
            event["type"] = "pr.set_to_draft"
        elif to_state in ("ready", "ready_for_review"):
            event["type"] = "pr.ready_for_review"
    elif event_type == "pr.status_changed":
        if to_state == "merged":
            event["type"] = "pr.merged"
        elif to_state == "closed":
            event["type"] = "pr.closed"
        elif to_state == "open":
            event["type"] = "pr.reopened"
    
    return event


def normalize_timeline(timeline: dict) -> dict:
    """Normalize all events in a timeline."""
    if "events" in timeline:
        timeline["events"] = [normalize_event(e) for e in timeline["events"]]
    return timeline


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 normalize_pr_events.py <timeline.json> [<timeline2.json> ...]")
        sys.exit(1)
    
    for filepath in sys.argv[1:]:
        path = Path(filepath)
        if not path.exists():
            print(f"File not found: {filepath}")
            continue
        
        print(f"Normalizing {filepath}...")
        with open(path, "r") as f:
            data = json.load(f)
        
        data = normalize_timeline(data)
        
        with open(path, "w") as f:
            json.dump(data, f, indent=2)
        
        print(f"✓ Updated {filepath}")


if __name__ == "__main__":
    main()
