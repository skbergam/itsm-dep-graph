"""Depends-on parsing for ITSM Notion Notes."""
from __future__ import annotations
import re
from typing import Any

EMOJI_RE = re.compile(
    r"^([\U0001F300-\U0001FAFF\U00002700-\U000027BF\U0001F1E0-\U0001F1FF]+)\s*"
)
CODE_RE = re.compile(r"\b((?:ONTO|INC|CMDB|PJM|K|SR|CONV|CHG|PRB)-\d+)\b", re.I)
DEP_LINE_RE = re.compile(
    r"(?i)depends[- ]on\s*:\s*(.+?)(?:\.|$|\n|;)",
    re.S,
)
SIGN_OFF_ALIASES = {
    "sign-off — incident product design": "INC-0",
    "sign-off - incident product design": "INC-0",
    "sign-off incident product design": "INC-0",
    "sign-off — cmdb product design": "CMDB-0",
    "sign-off - cmdb product design": "CMDB-0",
    "sign-off cmdb product design": "CMDB-0",
    "inc-0": "INC-0",
    "cmdb-0": "CMDB-0",
}


def strip_leading_emoji(name: str) -> tuple[str | None, str]:
    m = EMOJI_RE.match(name or "")
    if not m:
        return None, name or ""
    return m.group(1), name[m.end() :].lstrip()


def task_code(name: str) -> str | None:
    _, rest = strip_leading_emoji(name or "")
    m = CODE_RE.search(rest)
    return m.group(1).upper() if m else None


def _tokens_from_note(note: str) -> list[str]:
    if not note:
        return []
    tokens: list[str] = []
    for m in DEP_LINE_RE.finditer(note):
        blob = m.group(1)
        # drop parenthetical empties
        blob = re.sub(r"\(\s*\)", "", blob)
        # split on ; or , or " and "
        parts = re.split(r"\s*(?:,|;|/|\band\b)\s*", blob, flags=re.I)
        for p in parts:
            p = p.strip().strip(".")
            if not p or p.lower() in {"none", "n/a", "na"}:
                continue
            tokens.append(p)
    # also pick bare codes anywhere after Depends-on
    if "depends" in note.lower():
        for m in CODE_RE.finditer(note):
            tokens.append(m.group(1).upper())
    # dedupe preserve order
    seen = set()
    out = []
    for t in tokens:
        key = t.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(t)
    return out


def build_edges(tasks: list[dict[str, Any]]) -> tuple[list[dict], list[dict]]:
    by_code: dict[str, str] = {}
    by_id: dict[str, dict] = {}
    for t in tasks:
        by_id[t["id"]] = t
        code = t.get("code") or task_code(t.get("name") or "")
        if code:
            by_code[code.upper()] = t["id"]
            t["code"] = code.upper()
        # alias signoff names
        nlow = (t.get("name") or "").lower()
        if "sign-off" in nlow and "incident" in nlow:
            by_code.setdefault("INC-0", t["id"])
        if "sign-off" in nlow and "cmdb" in nlow:
            by_code.setdefault("CMDB-0", t["id"])

    edges: list[dict] = []
    issues: list[dict] = []
    seen_e = set()

    for t in tasks:
        note = t.get("note") or ""
        body = t.get("body") or ""
        tokens = _tokens_from_note(str(note)) + _tokens_from_note(str(body))
        # dedupe tokens
        tok_seen = set()
        uniq = []
        for tok in tokens:
            k = tok.lower()
            if k in tok_seen:
                continue
            tok_seen.add(k)
            uniq.append(tok)
        t["depends_tokens"] = uniq
        depends_on_ids = []
        for tok in uniq:
            tid = None
            via = "token"
            code_m = CODE_RE.search(tok)
            if code_m:
                code = code_m.group(1).upper()
                tid = by_code.get(code)
                via = f"code:{code}"
            if not tid:
                alias = SIGN_OFF_ALIASES.get(tok.lower().strip())
                if alias:
                    tid = by_code.get(alias)
                    via = "alias"
            if not tid:
                # try matching code-like in token after strip
                norm = re.sub(r"\s+", " ", tok.lower())
                for alias, code in SIGN_OFF_ALIASES.items():
                    if alias in norm:
                        tid = by_code.get(code)
                        via = "alias"
                        break
            if not tid:
                # match ONTO-1 (Done) style
                if code_m and code_m.group(1).upper() in by_code:
                    tid = by_code[code_m.group(1).upper()]
            if not tid:
                issues.append(
                    {
                        "task": t.get("name"),
                        "task_id": t["id"],
                        "token": tok,
                        "reason": f"unresolved:{tok}",
                    }
                )
                continue
            if tid == t["id"]:
                continue
            key = (tid, t["id"])
            if key in seen_e:
                continue
            seen_e.add(key)
            edges.append(
                {
                    "from": tid,
                    "to": t["id"],
                    "kind": "depends-on",
                    "token": tok,
                    "via": via,
                }
            )
            depends_on_ids.append(tid)
        t["depends_on"] = depends_on_ids
    return edges, issues
