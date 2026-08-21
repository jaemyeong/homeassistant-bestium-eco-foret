#!/usr/bin/env python3
import json
import sys


ALLOWED_SOURCES = frozenset(("startup", "resume", "clear", "compact"))
ADDITIONAL_CONTEXT = """M0 continuity guard:
- Read AGENTS.md and .agent/progress.md before acting.
- Bootstrap every task conditionally when the matching index or tool is available: Graphify -> CodeGraph -> Serena. Record each skipped tool and its reason.
- Research current claims with Web + Context7 before coding. Use Sosumi only for Apple-platform claims; otherwise record \"Sosumi: N/A\". Do not guess; repeat empirical verification whenever the task, version, or assumption changes.
- Tests first, then the minimum implementation.
- Delegate product code only to exact gpt-5.3-codex-spark; no fallback. Obtain a read-only adversarial review.
- For each work unit, update CHANGELOG.md and .agent/progress.md, explicitly stage only task files, and create a signed task commit.
- Current M0 boundary: do not implement app code or access EW11/private LAN."""
OUTPUT = {
    "hookSpecificOutput": {
        "hookEventName": "SessionStart",
        "additionalContext": ADDITIONAL_CONTEXT,
    }
}


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except (json.JSONDecodeError, UnicodeError):
        return 0

    source = payload.get("source") if isinstance(payload, dict) else None
    if not isinstance(source, str) or source not in ALLOWED_SOURCES:
        return 0

    json.dump(OUTPUT, sys.stdout, separators=(",", ":"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
