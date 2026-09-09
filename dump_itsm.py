#!/usr/bin/env python3
"""Normalize a Notion ITSM tasks dump into graph JSON.

Primary path (agent / Geronimo):
  1. Prefer Notion MCP `notion-query-data-sources` (SQL) against Tasks DS
     filtered to the three ITSM project URLs.
  2. Write the raw `results` array (or full MCP response) to a JSON file.
  3. Run:  python3 dump_itsm.py --raw out/raw-notion.json --out out/itsm-graph.json

Fallback path (rate-limited):
  1. `notion-fetch` each ITSM project page.
  2. Collect related Task URLs from the Project's Tasks relation / page body.
  3. `notion-fetch` each task; build objects with keys:
       url, Task name (or name/title), Status, Note, Bot, Project, icon (optional), body (optional)
  4. Save as JSON array → same dump_itsm.py command.

This script does NOT call Notion itself (no API token on the box). Agents supply
the raw dump via MCP.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "lib"))
from deps import (  # noqa: E402
    build_edges,
    strip_leading_emoji,
    task_code,
)

PROJECTS = [
    {
        "id": "proj-ontology",
        "name": "Platform - Ontology",
        "url": "https://app.notion.com/3d65dbddf0ea819296bfef0fae3b1fe6",
        "url_alt": "https://app.notion.com/p/3d65dbddf0ea819296bfef0fae3b1fe6",
        "prefix": "ONTO",
    },
    {
        "id": "proj-incident",
        "name": "Resolv — Incident",
        "url": "https://app.notion.com/3d65dbddf0ea81e08611d31d3eb04f6c",
        "url_alt": "https://app.notion.com/p/3d65dbddf0ea81e08611d31d3eb04f6c",
        "prefix": "INC",
    },
    {
        "id": "proj-cmdb",
        "name": "Resolv — CMDB",
        "url": "https://app.notion.com/3d65dbddf0ea8129a739ffdc41830d81",
        "url_alt": "https://app.notion.com/p/3d65dbddf0ea8129a739ffdc41830d81",
        "prefix": "CMDB",
    },
]

TASKS_DS = "collection://86797734-14d1-44d7-8d94-7b41fcacc2ca"
PROJECTS_DS = "collection://332d25cf-9469-4db7-aa47-dbe5e83854c2"
CHANNEL_ITSM = "b632b520-95b5-4ddc-9632-9b187dfcfb9c"

STATUS_COLORS = {
    "Waiting": "#EAB308",
    "Blocked": "#EF4444",
    "In progress": "#3B82F6",
    "Not started": "#9CA3AF",
    "Done": "#22C55E",
    "Archived": "#6B7280",
}


def page_id_from_url(url: str | None) -> str | None:
    if not url:
        return None
    m = re.search(r"([0-9a-f]{32})", url.replace("-", ""), re.I)
    if not m:
        m = re.search(
            r"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})",
            url,
            re.I,
        )
        return m.group(1).lower() if m else None
    raw = m.group(1).lower()
    return f"{raw[0:8]}-{raw[8:12]}-{raw[12:16]}-{raw[16:20]}-{raw[20:32]}"


def project_id_for_url(url: str | None) -> str | None:
    pid = page_id_from_url(url)
    if not pid:
        return None
    compact = pid.replace("-", "")
    for p in PROJECTS:
        for u in (p["url"], p.get("url_alt")):
            if u and compact in u.replace("-", "").lower():
                return p["id"]
    return None


def coerce_project_urls(val) -> list[str]:
    if val is None:
        return []
    if isinstance(val, list):
        out = []
        for x in val:
            if isinstance(x, str):
                if x.strip().startswith("["):
                    try:
                        out.extend(coerce_project_urls(json.loads(x)))
                    except Exception:
                        out.append(x)
                else:
                    out.append(x)
            elif isinstance(x, dict):
                out.append(x.get("url") or x.get("id") or "")
        return [u for u in out if u]
    if isinstance(val, str):
        s = val.strip()
        if s.startswith("["):
            try:
                return coerce_project_urls(json.loads(s))
            except Exception:
                pass
        return [s] if s else []
    return []


def load_raw(path: Path) -> list[dict]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(data, dict):
        if "results" in data:
            data = data["results"]
        elif "tasks" in data:
            data = data["tasks"]
        elif "rows" in data:
            data = data["rows"]
        else:
            raise SystemExit(f"Unrecognized raw dump shape in {path}")
    if not isinstance(data, list):
        raise SystemExit("Raw dump must be a list of task rows")
    return data


def row_to_task(row: dict) -> dict | None:
    name = (
        row.get("Task name")
        or row.get("task_name")
        or row.get("name")
        or row.get("title")
        or ""
    )
    if isinstance(name, list):
        name = " ".join(str(x) for x in name)
    name = str(name).strip()
    if not name:
        return None
    url = row.get("url") or row.get("page_url") or row.get("id") or ""
    tid = page_id_from_url(str(url)) or str(url)
    status = (row.get("Status") or row.get("status") or "Not started").strip()
    note = row.get("Note") or row.get("note") or ""
    bot = row.get("Bot") or row.get("bot")
    projects = coerce_project_urls(row.get("Project") or row.get("project"))
    project_ids = []
    for pu in projects:
        pid = project_id_for_url(pu)
        if pid and pid not in project_ids:
            project_ids.append(pid)
    icon_emoji = row.get("icon") or row.get("emoji")
    if isinstance(icon_emoji, dict):
        icon_emoji = icon_emoji.get("emoji") or icon_emoji.get("name")
    lead, _ = strip_leading_emoji(name)
    icon = lead or icon_emoji or "📋"
    code = task_code(name)
    return {
        "id": tid,
        "name": name,
        "code": code,
        "status": status,
        "note": note,
        "bot": bot,
        "url": url,
        "project_ids": project_ids,
        "icon": icon,
        "body": row.get("body") or row.get("content"),
        "color": STATUS_COLORS.get(status, "#9CA3AF"),
    }


def pulse_counts(tasks: list[dict]) -> dict:
    counts = {
        "Waiting": 0,
        "Blocked": 0,
        "In progress": 0,
        "Not started": 0,
        "Done": 0,
        "Archived": 0,
        "other": 0,
    }
    for t in tasks:
        s = t.get("status") or ""
        if s in counts:
            counts[s] += 1
        else:
            counts["other"] += 1
    counts["active"] = (
        counts["Waiting"]
        + counts["Blocked"]
        + counts["In progress"]
        + counts["Not started"]
    )
    counts["total"] = len(tasks)
    return counts


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--raw", required=True, help="Path to raw Notion JSON dump")
    ap.add_argument(
        "--out",
        default=str(ROOT / "out" / "itsm-graph.json"),
        help="Output graph JSON path",
    )
    ap.add_argument(
        "--include-archived",
        action="store_true",
        help="Keep Archived tasks in the graph (default: drop)",
    )
    ap.add_argument(
        "--include-done",
        action="store_true",
        help="Keep Done tasks (default: include — useful for dep context)",
    )
    args = ap.parse_args()

    rows = load_raw(Path(args.raw))
    tasks = []
    for row in rows:
        t = row_to_task(row)
        if not t:
            continue
        if not args.include_archived and t["status"] == "Archived":
            continue
        if not args.include_done and t["status"] == "Done":
            # Still useful as dep targets — keep by default? Spec says Done optional/include.
            # Keep Done for edge resolution but we can flag; default INCLUDE Done.
            pass
        tasks.append(t)

    # Default: include Done (optional/include per product req). Drop only Archived unless flagged.
    edges, issues = build_edges(tasks)

    # Membership edges: project → task
    membership = []
    for t in tasks:
        for pid in t.get("project_ids") or []:
            membership.append(
                {"from": pid, "to": t["id"], "kind": "in-project", "token": "", "via": "relation"}
            )

    graph = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "projects": PROJECTS,
        "tasks": tasks,
        "edges": edges,
        "membership": membership,
        "parse_issues": issues,
        "pulse": pulse_counts(tasks),
        "meta": {
            "tasks_ds": TASKS_DS,
            "projects_ds": PROJECTS_DS,
            "channel": CHANNEL_ITSM,
            "raw": str(Path(args.raw).resolve()),
        },
    }
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(graph, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    pulse = graph["pulse"]
    print(
        f"Wrote {out} — tasks={pulse['total']} "
        f"W={pulse['Waiting']} B={pulse['Blocked']} IP={pulse['In progress']} "
        f"NS={pulse['Not started']} D={pulse['Done']} A={pulse['Archived']} "
        f"edges={len(edges)} issues={len(issues)}"
    )
    if issues:
        print("Unresolved Depends-on tokens (first 12):")
        for iss in issues[:12]:
            print(f"  - {iss['task']}: {iss['token']!r} ({iss['reason']})")


if __name__ == "__main__":
    main()
