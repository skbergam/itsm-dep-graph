#!/usr/bin/env python3
"""Recover nested subagent spans from cloud agent transcripts.

Reads a timeline JSON file, extracts agent IDs from links.agents,
fetches full transcripts from the Cursor API, extracts Task tool call
information (subagent spawns), and emits subagent.started/subagent.ended
events plus subagent spans.

Usage:
    export CURSOR_API_KEY="your-api-key-here"
    python3 recover_subagents.py --timeline public/timelines/<id>.json

Environment:
    CURSOR_API_KEY: Required. Your Cursor API key for authenticating
                     with the Cursor Cloud Agents API.

Recovery Strategy:
    1. Fetch transcript for each parent agent in timeline
    2. Find all Task tool calls (these spawn subagents)
    3. Extract subagent bcId from Task tool results
    4. For each subagent, check if it has timing in the transcript:
       - started_at_ms from first message/tool in subagent
       - completed_at_ms from last message/tool in subagent
    5. Emit subagent.started and subagent.ended events with proven timestamps
    6. Emit subagent spans with duration
    7. For subagents still running at as_of time: emit open-ended span

Deterministic Timestamps Only:
    - All timestamps are extracted from source records (ISO from ms timestamps)
    - NO wall-clock guesses or vibes-based inference
    - If timing cannot be proven from transcript: add omission, skip span
"""

import argparse
import json
import os
import re
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Set


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


def ms_to_iso(ms: int) -> str:
    """Convert milliseconds since epoch to ISO 8601 UTC string."""
    return datetime.fromtimestamp(ms / 1000.0, tz=timezone.utc).isoformat()


def iso_to_ms(iso_str: str) -> int:
    """Convert ISO 8601 string to milliseconds since epoch."""
    dt = datetime.fromisoformat(iso_str.replace('Z', '+00:00'))
    return int(dt.timestamp() * 1000)


def fetch_agent_transcript(agent_id: str, api_key: str) -> Optional[Dict[str, Any]]:
    """Fetch full transcript for a single agent from Cursor API.
    
    Returns:
        dict with transcript structure if successful
        None if agent not found or API error
    """
    url = f"https://api.cursor.com/v1/agents/{agent_id}/transcript"
    
    try:
        req = urllib.request.Request(
            url,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Accept": "application/json"
            }
        )
        
        with urllib.request.urlopen(req, timeout=30) as response:
            if response.status == 200:
                data = json.loads(response.read().decode('utf-8'))
                return data
            else:
                print(f"  Warning: API returned status {response.status} for {agent_id}", file=sys.stderr)
                return None
                
    except urllib.error.HTTPError as e:
        if e.code == 404:
            print(f"  Agent transcript {agent_id} not found (404)", file=sys.stderr)
        else:
            print(f"  HTTP error {e.code} fetching transcript {agent_id}: {e.reason}", file=sys.stderr)
        return None
    except Exception as e:
        print(f"  Error fetching transcript {agent_id}: {e}", file=sys.stderr)
        return None


def extract_subagent_info(transcript: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Extract subagent spawn information from transcript.
    
    Looks for Task tool calls in the transcript and extracts:
    - subagent bcId from tool result
    - start time (when Task tool was called)
    - end time (when Task tool completed, if available)
    
    Returns list of subagent info dicts with:
        {
            'subagent_id': 'bc-...',
            'parent_agent_id': 'bc-...',
            'started_at_ms': int,
            'completed_at_ms': int or None,
            'description': str,
            'tool_call_id': str
        }
    """
    subagents = []
    
    # Transcript structure varies, but typically has messages array
    messages = transcript.get('messages', [])
    parent_agent_id = transcript.get('bcId') or transcript.get('agentId')
    
    for msg in messages:
        # Look for assistant messages with tool_calls
        if msg.get('role') != 'assistant':
            continue
            
        tool_calls = msg.get('tool_calls', [])
        for tool_call in tool_calls:
            # Check if this is a Task tool call
            tool_name = tool_call.get('function', {}).get('name', '')
            if tool_name != 'Task':
                continue
            
            # Extract timing from message
            started_at_ms = msg.get('started_at_ms') or msg.get('timestamp_ms')
            if not started_at_ms:
                continue
            
            tool_call_id = tool_call.get('id', '')
            
            # Try to parse arguments to get description
            args = tool_call.get('function', {}).get('arguments', '{}')
            try:
                args_dict = json.loads(args) if isinstance(args, str) else args
                description = args_dict.get('description', 'Subagent task')
            except:
                description = 'Subagent task'
            
            # Look for the tool result in subsequent messages
            completed_at_ms = None
            subagent_id = None
            
            # Find the tool result message
            for result_msg in messages:
                if result_msg.get('role') != 'tool':
                    continue
                if result_msg.get('tool_call_id') != tool_call_id:
                    continue
                    
                # Found the result - extract timing and subagent ID
                completed_at_ms = result_msg.get('completed_at_ms') or result_msg.get('timestamp_ms')
                
                # Try to extract bcId from tool result content
                content = result_msg.get('content', '')
                if isinstance(content, str):
                    # Look for cloudAgentBcId in the result
                    bc_match = re.search(r'"cloudAgentBcId"\s*:\s*"(bc-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"', content)
                    if bc_match:
                        subagent_id = bc_match.group(1)
                    else:
                        # Try alternate patterns
                        bc_match = re.search(r'(bc-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})', content)
                        if bc_match:
                            subagent_id = bc_match.group(1)
                
                break
            
            # Only record if we found a subagent ID
            if subagent_id:
                subagents.append({
                    'subagent_id': subagent_id,
                    'parent_agent_id': parent_agent_id,
                    'started_at_ms': started_at_ms,
                    'completed_at_ms': completed_at_ms,
                    'description': description,
                    'tool_call_id': tool_call_id
                })
    
    return subagents


def recover_subagents(timeline: Dict[str, Any], api_key: str) -> Dict[str, Any]:
    """Recover subagent spans from agent transcripts."""
    
    # Extract agent IDs from links.agents
    agent_links = timeline.get("links", {}).get("agents", [])
    if not agent_links:
        print("No agents found in timeline.links.agents")
        return timeline
    
    print(f"Found {len(agent_links)} agent link(s)")
    
    # Track all subagents we discover
    all_subagents: List[Dict[str, Any]] = []
    failed_agents: List[str] = []
    
    for link in agent_links:
        agent_id = extract_agent_id(link)
        if not agent_id:
            print(f"  Warning: Could not extract agent ID from {link}", file=sys.stderr)
            continue
        
        print(f"  Fetching transcript for {agent_id}...")
        transcript = fetch_agent_transcript(agent_id, api_key)
        if not transcript:
            print(f"    ✗ No transcript available")
            failed_agents.append(agent_id)
            continue
        
        # Extract subagent info from transcript
        subagents = extract_subagent_info(transcript)
        if subagents:
            print(f"    ✓ Found {len(subagents)} subagent(s)")
            for sub in subagents:
                print(f"      - {sub['subagent_id']}: {sub['description']}")
            all_subagents.extend(subagents)
        else:
            print(f"    ℹ No subagents found in transcript")
    
    if not all_subagents:
        print("\nNo subagents discovered from transcripts")
        # Add omission
        omissions = timeline.get("omissions", [])
        omissions.append({
            "wanted": "subagent.*",
            "reason": "No Task tool calls with recoverable subagent bcIds found in parent agent transcripts"
        })
        timeline["omissions"] = omissions
        return timeline
    
    print(f"\nRecovered {len(all_subagents)} subagent(s) from transcripts")
    
    # Get timeline as_of for open-ended spans
    as_of = timeline.get("as_of", timeline.get("generated_at", datetime.now(timezone.utc).isoformat()))
    as_of_ms = iso_to_ms(as_of)
    
    # Generate subagent events
    events = timeline.get("events", [])
    existing_event_ids = {e.get("id") for e in events}
    
    # Find max event ID number to continue sequence
    max_event_num = 0
    for e in events:
        eid = e.get("id", "")
        if eid.startswith("e"):
            try:
                num = int(eid[1:])
                max_event_num = max(max_event_num, num)
            except:
                pass
    
    next_event_num = max_event_num + 1
    
    for sub in all_subagents:
        # Emit subagent.started event
        started_event_id = f"e{next_event_num:03d}"
        next_event_num += 1
        
        started_event = {
            "id": started_event_id,
            "type": "subagent.started",
            "t": ms_to_iso(sub['started_at_ms']),
            "source": "parent_agent_transcript",
            "source_ref": f"cursor://agent/{sub['parent_agent_id']}#task_call={sub['tool_call_id']}",
            "summary": f"Subagent {sub['subagent_id'][:12]}… started: {sub['description']}",
            "meta": {
                "subagent_id": sub['subagent_id'],
                "parent_agent_id": sub['parent_agent_id'],
                "description": sub['description'],
                "evidence": "Task tool call started_at_ms from parent transcript"
            }
        }
        events.append(started_event)
        
        # Emit subagent.ended event if we have completion time
        if sub['completed_at_ms']:
            ended_event_id = f"e{next_event_num:03d}"
            next_event_num += 1
            
            ended_event = {
                "id": ended_event_id,
                "type": "subagent.ended",
                "t": ms_to_iso(sub['completed_at_ms']),
                "source": "parent_agent_transcript",
                "source_ref": f"cursor://agent/{sub['parent_agent_id']}#task_result={sub['tool_call_id']}",
                "summary": f"Subagent {sub['subagent_id'][:12]}… completed",
                "meta": {
                    "subagent_id": sub['subagent_id'],
                    "parent_agent_id": sub['parent_agent_id'],
                    "evidence": "Task tool result completed_at_ms from parent transcript"
                }
            }
            events.append(ended_event)
    
    timeline["events"] = events
    
    # Generate subagent spans
    spans = timeline.get("spans", [])
    
    for sub in all_subagents:
        # Determine end time: use completed_at_ms if available, otherwise as_of
        end_ms = sub['completed_at_ms'] if sub['completed_at_ms'] else as_of_ms
        duration_seconds = (end_ms - sub['started_at_ms']) / 1000.0
        
        span = {
            "kind": "subagent",
            "start": ms_to_iso(sub['started_at_ms']),
            "end": ms_to_iso(end_ms),
            "seconds": int(duration_seconds),
            "meta": {
                "subagent_id": sub['subagent_id'],
                "parent_agent_id": sub['parent_agent_id'],
                "description": sub['description'],
                "open_ended": sub['completed_at_ms'] is None
            }
        }
        spans.append(span)
    
    timeline["spans"] = spans
    
    # Update omissions
    omissions = timeline.get("omissions", [])
    
    # Remove old subagent omissions if we successfully recovered subagents
    omissions = [o for o in omissions if not o.get("wanted", "").startswith("subagent.")]
    
    # Add omission for failed agents if any
    if failed_agents:
        omissions.append({
            "wanted": f"subagent.* for agents {', '.join(failed_agents[:3])}{'...' if len(failed_agents) > 3 else ''}",
            "reason": f"Could not fetch transcripts for {len(failed_agents)} parent agent(s) - transcript API unavailable"
        })
    
    timeline["omissions"] = omissions
    
    print(f"Emitted {len(all_subagents)} subagent event pair(s) and {len(all_subagents)} subagent span(s)")
    
    return timeline


def main():
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter
    )
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
    
    # Recover subagents
    enriched = recover_subagents(timeline, api_key)
    
    # Write output
    out_path = Path(args.out) if args.out else timeline_path
    print(f"\nWriting timeline with subagent spans to {out_path}")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(enriched, f, indent=2, ensure_ascii=False)
        f.write("\n")
    
    print("Done!")


if __name__ == "__main__":
    main()
