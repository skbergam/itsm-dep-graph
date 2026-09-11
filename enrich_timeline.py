#!/usr/bin/env python3
"""Enrich timeline JSON with Cursor Cloud Agents API usage data.

Reads a timeline JSON file, extracts agent IDs from links.agents,
fetches usage data from the Cursor API for each agent, and enriches
the timeline events/spans with real token and cost data.

Usage:
    export CURSOR_API_KEY="your-api-key-here"
    python3 enrich_timeline.py --timeline public/timelines/<id>.json

Environment:
    CURSOR_API_KEY: Required. Your Cursor API key for authenticating
                     with the Cursor Cloud Agents API.

API:
    GET https://api.cursor.com/v1/agents/{id}/usage
    Authorization: Bearer {CURSOR_API_KEY}
    
    Response:
        {
          "inputTokens": 123456,
          "outputTokens": 78900,
          "costUsd": 1.23
        }
"""

import argparse
import json
import os
import re
import sys
import urllib.request
from pathlib import Path
from typing import Any, Dict, List, Optional


def extract_agent_id(agent_link: str | dict) -> Optional[str]:
    """Extract agent bcId from a link string or dict."""
    if isinstance(agent_link, dict):
        url = agent_link.get("url") or agent_link.get("href") or agent_link.get("id", "")
    else:
        url = str(agent_link)
    
    # Match bc-UUID pattern (e.g., bc-998fc92a-9bd0-412b-960b-65a7ec415187)
    match = re.search(r'(bc-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})', url)
    if match:
        return match.group(1)
    
    return None


def fetch_agent_usage(agent_id: str, api_key: str) -> Optional[Dict[str, Any]]:
    """Fetch usage data for a single agent from Cursor API.
    
    Returns:
        dict with inputTokens, outputTokens, costUsd if successful
        None if agent not found or API error
    """
    url = f"https://api.cursor.com/v1/agents/{agent_id}/usage"
    
    try:
        req = urllib.request.Request(
            url,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Accept": "application/json"
            }
        )
        
        with urllib.request.urlopen(req, timeout=10) as response:
            if response.status == 200:
                data = json.loads(response.read().decode('utf-8'))
                # Return only the fields we care about, if present
                usage = {}
                if "inputTokens" in data:
                    usage["inputTokens"] = data["inputTokens"]
                if "outputTokens" in data:
                    usage["outputTokens"] = data["outputTokens"]
                if "costUsd" in data:
                    usage["costUsd"] = data["costUsd"]
                
                # Calculate total tokens if both input and output present
                if "inputTokens" in usage and "outputTokens" in usage:
                    usage["totalTokens"] = usage["inputTokens"] + usage["outputTokens"]
                
                return usage if usage else None
            else:
                print(f"  Warning: API returned status {response.status} for {agent_id}", file=sys.stderr)
                return None
                
    except urllib.error.HTTPError as e:
        if e.code == 404:
            print(f"  Agent {agent_id} not found (404)", file=sys.stderr)
        else:
            print(f"  HTTP error {e.code} fetching {agent_id}: {e.reason}", file=sys.stderr)
        return None
    except Exception as e:
        print(f"  Error fetching {agent_id}: {e}", file=sys.stderr)
        return None


def enrich_timeline(timeline: Dict[str, Any], api_key: str) -> Dict[str, Any]:
    """Enrich timeline with agent usage data."""
    
    # Extract agent IDs from links.agents
    agent_links = timeline.get("links", {}).get("agents", [])
    if not agent_links:
        print("No agents found in timeline.links.agents")
        return timeline
    
    print(f"Found {len(agent_links)} agent link(s)")
    
    # Map agent_id -> usage data
    usage_map: Dict[str, Dict[str, Any]] = {}
    
    for link in agent_links:
        agent_id = extract_agent_id(link)
        if not agent_id:
            print(f"  Warning: Could not extract agent ID from {link}", file=sys.stderr)
            continue
        
        print(f"  Fetching usage for {agent_id}...")
        usage = fetch_agent_usage(agent_id, api_key)
        if usage:
            usage_map[agent_id] = usage
            print(f"    ✓ {usage.get('inputTokens', 0)} in / {usage.get('outputTokens', 0)} out / ${usage.get('costUsd', 0):.2f}")
        else:
            print(f"    ✗ No usage data available")
    
    if not usage_map:
        print("No usage data retrieved from API")
        return timeline
    
    # Enrich agent events with usage data
    enriched_count = 0
    for event in timeline.get("events", []):
        if event.get("type") in ("agent.started", "agent.ended"):
            # Try to extract agent_id from meta or source_ref
            agent_id = event.get("meta", {}).get("agent_id")
            if not agent_id and event.get("source_ref"):
                agent_id = extract_agent_id(event["source_ref"])
            
            if agent_id and agent_id in usage_map:
                if "meta" not in event:
                    event["meta"] = {}
                event["meta"]["usage"] = usage_map[agent_id]
                enriched_count += 1
    
    # Enrich agent spans with usage data
    for span in timeline.get("spans", []):
        if span.get("kind") == "agent":
            # For spans, we need to look at corresponding events or metadata
            # Since spans don't have agent_id directly, we'll match by time
            # to nearby agent.started events, or add a global usage summary
            # For now, we'll add usage to meta if we can infer it
            # This is a heuristic - better to have agent_id in span metadata
            pass  # Leave this for now - UI will pull from events
    
    print(f"\nEnriched {enriched_count} agent event(s) with usage data")
    
    # Add omissions for agents we couldn't fetch
    omissions = timeline.get("omissions", [])
    for link in agent_links:
        agent_id = extract_agent_id(link)
        if agent_id and agent_id not in usage_map:
            omissions.append({
                "wanted": f"agent.usage.{agent_id}",
                "reason": "API returned 404 or error - usage unavailable"
            })
    
    if omissions:
        timeline["omissions"] = omissions
    
    return timeline


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--timeline", required=True, help="Path to timeline JSON file")
    parser.add_argument("--out", help="Output path (defaults to overwriting input)")
    parser.add_argument("--api-key", help="Cursor API key (or set CURSOR_API_KEY env var)")
    
    args = parser.parse_args()
    
    # Get API key from arg or env
    api_key = args.api_key or os.environ.get("CURSOR_API_KEY")
    if not api_key:
        print("Error: CURSOR_API_KEY environment variable not set and --api-key not provided", file=sys.stderr)
        print("\nSet your API key with:", file=sys.stderr)
        print("  export CURSOR_API_KEY='your-key-here'", file=sys.stderr)
        sys.exit(1)
    
    # Load timeline
    timeline_path = Path(args.timeline)
    if not timeline_path.exists():
        print(f"Error: Timeline file not found: {timeline_path}", file=sys.stderr)
        sys.exit(1)
    
    print(f"Loading timeline from {timeline_path}")
    with open(timeline_path, "r", encoding="utf-8") as f:
        timeline = json.load(f)
    
    # Enrich
    enriched = enrich_timeline(timeline, api_key)
    
    # Write output
    out_path = Path(args.out) if args.out else timeline_path
    print(f"\nWriting enriched timeline to {out_path}")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(enriched, f, indent=2, ensure_ascii=False)
        f.write("\n")
    
    print("Done!")


if __name__ == "__main__":
    main()
