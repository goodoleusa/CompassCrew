#!/usr/bin/env python3
"""
/spawn — semantic-intent team spawner.

Parses intent, auto-selects a team and wave, assembles a context bundle, and emits Agent()
spawn directives.

SPAWN IDENTITY — the contract this script upholds (2026-08-22)
─────────────────────────────────────────────────────────────
The ONLY identity value that crosses into a child is `RECKON_SPAWN_ID`: a PUBLIC label, safe in
a transcript, a log or a screenshot. The child generates its own keypair IN PROCESS, claims the
slot its parent opened by publishing only its PUBLIC key, and proves possession thereafter by
signing a target-bound, single-use challenge.

Two earlier mechanisms are refused here by name rather than silently ignored:

  · RECKON_SPAWN_TOKEN — RETIRED 2026-07-30. A bearer secret: whoever holds it authenticates
    as the child, and every reader of the transcript that carried it holds it.
  · RECKON_SPAWN_KEY   — DEPRECATED 2026-08-01. Carries a raw private ed25519 seed in plaintext
    through the environment, the process table, shell history and the transcript. Nothing about
    it is hashed. It is a bearer secret wearing a key's name — the exact property that retired
    the token.

This script therefore has NO parameter, environment read, or emitted field that can carry a
private seed, mnemonic or salt, and deliberately never will. If a future change adds one, the
design has been reverted to the deprecated pattern whatever it is called. The invariant is one
line: NO VALUE THAT CAN SIGN MAY EVER LEAVE THE PROCESS THAT MADE IT.

Full rationale: reckon-lite/tools/revenant_spawnkey_lite.py, the block titled
"WHAT WAS TRIED, AND WHY EACH FAILED".
"""

import sys
import json
import argparse
from pathlib import Path
from datetime import datetime, timezone

# ── ALL VARS AT TOP ───────────────────────────────────────────────────────────────────────
import os

#: Where agent configuration lives. CLAUDE_HOME wins so a non-default install is not silently
#: read from the wrong place.
CLAUDE_HOME = Path(os.environ.get("CLAUDE_HOME") or (Path.home() / ".claude"))

#: PUBLIC label naming which spawn slot a child holds. The only identity value that crosses.
ENV_SPAWN_ID = "RECKON_SPAWN_ID"

#: Refused by name. See the module docstring for why each was retired.
REFUSED_CREDENTIAL_ENVS = {
    "RECKON_SPAWN_TOKEN": (
        "RETIRED 2026-07-30 — a bearer secret. Whoever holds it authenticates as this child, "
        "and every reader of the transcript that carried it holds it."),
    "RECKON_SPAWN_KEY": (
        "DEPRECATED 2026-08-01 — a raw private ed25519 seed in plaintext. Nothing about it is "
        "hashed; it is a bearer secret wearing a key's name."),
}

# Wave config
WAVE_CONFIG = {
    "1": {"name": "LIFTOFF", "max_parallel": 6, "model": "haiku", "background": False},
    "2": {"name": "CRUISE", "max_parallel": 4, "model": "haiku", "background": False},
    "3": {"name": "INSERTION", "max_parallel": 1, "model": "sonnet", "background": True}
}

TEAMS = {
    "analysis": ["data-analyst", "research-analyst", "code-reviewer", "knowledge-synthesizer"],
    "synthesis": ["documentation-engineer", "knowledge-synthesizer", "research-analyst", "data-analyst"],
    "implementation": ["fullstack-developer", "python-pro", "code-reviewer", "ai-engineer"],
    "audit": ["security-auditor", "code-reviewer", "data-analyst", "knowledge-synthesizer"],
}

# Budget mode: 2-agent complementary pairs (max deliverables per token)
BUDGET_TEAMS = {
    "analysis": ["data-analyst", "knowledge-synthesizer"],  # discover + synthesize
    "synthesis": ["documentation-engineer", "knowledge-synthesizer"],  # structure + connect
    "implementation": ["fullstack-developer", "python-pro"],  # architect + code
    "audit": ["security-auditor", "code-reviewer"],  # find + verify
}

def _read_json(path, absent):
    """Read a JSON config, or return `absent`. Bare `except:` removed on purpose: it swallowed
    KeyboardInterrupt and SystemExit too, so a hung read looked like a missing file."""
    try:
        with open(path) as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return absent

def read_formulas():
    # Renamed from the pre-rebrand `swarmy-formulas.json`, which no current install writes.
    for name in ("reckon-formulas.json", "swarmy-formulas.json"):
        found = _read_json(CLAUDE_HOME / name, None)
        if found is not None:
            return found
    return {}

def read_altimeter():
    # NOTE the default: 50 is a PLACEHOLDER, not a measurement. It exists so the warning path
    # stays quiet when there is nothing to read, and check_context_warnings never reports a
    # context percentage it did not actually observe.
    return _read_json(CLAUDE_HOME / "altimeter.json", {"context_pct": None})

def check_context_warnings(formulas, altimeter):
    """Check context fill and warn if approaching limits. Does NOT gate spawning."""
    try:
        raw = altimeter.get("context_pct")
        if raw is None:
            # UNMEASURED, not "fine". A gate that cannot look says so.
            return "context fill UNMEASURED (no altimeter.json) — proceeding, but this is not a green"
        pct = float(raw)
        red_alert = float(formulas.get("IMMUTABLE_CONSTANTS", {}).get("AUTO_COMPACT_PCT_THRESHOLD", {}).get("value", 93.5))

        if pct >= red_alert:
            return f"🔴 RED ALERT: {pct}% context >= {red_alert}% (compact imminent). Proceeding with spawn anyway."
        elif pct >= 85:
            return f"🟡 CAUTION: {pct}% context is high. Consider compacting after this wave."
        return None
    except (TypeError, ValueError) as exc:
        return f"context fill UNMEASURED (unreadable altimeter: {exc})"

def select_team(intent, custom=None):
    """Auto-select team based on semantic intent."""
    if custom:
        return custom.split(",")
    intent_lower = intent.lower()
    if any(w in intent_lower for w in ["audit", "review", "check", "security"]):
        return TEAMS["audit"]
    elif any(w in intent_lower for w in ["build", "implement", "code", "develop"]):
        return TEAMS["implementation"]
    elif any(w in intent_lower for w in ["summarize", "synthesize", "report", "document"]):
        return TEAMS["synthesis"]
    else:
        return TEAMS["analysis"]

def read_bundle(label):
    """Assemble the context bundle handed to each agent.

    NOTE ON THE PATHS BELOW. These used to be written as `Path("~/.claude/HONEY.md")` — a
    LITERAL tilde, never expanded, so `.exists()` was False on every machine and the bundle
    silently shipped empty while reporting success. They now go through CLAUDE_HOME. A
    hardcoded `~/gitrepos/faerie2/...` template path from a repo that no longer exists was
    removed rather than re-pointed: a source nobody can produce is not a fallback.
    """
    parts = []

    for name, title, tail in (
        ("GOLD.md", "Promoted Lessons (GOLD)", None),
        ("HONEY.md", "Global Principles", None),
        ("NECTAR.md", "Recent Findings (tail-50)", 50),
    ):
        path = CLAUDE_HOME / name
        if not path.exists():
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        if tail:
            text = "".join(text.splitlines(keepends=True)[-tail:])
        parts.append(f"# {title}\n\n{text[:2000]}\n")

    # Investigation label hint
    if label != "default":
        parts.append(f"\n**Investigation Label:** {label}\n")
        parts.append("Read forensics/manifests/ to discover work. Agents coordinate via compass edges.\n")

    return "\n".join(parts)

def spawn_agent(agent_type, team_size, idx, prompt, wave, label, model, background):
    """Output Agent() tool directive for this agent."""
    return {
        "type": "spawn_agent_directive",
        "description": f"W{wave} SPAWN: {agent_type} ({idx+1}/{team_size}) for {label}",
        "subagent_type": agent_type,
        "prompt": prompt,
        "model": model,
        "run_in_background": background,
        "investigation_label": label,
        "wave": wave
    }

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("semantic_intent", nargs="?", default="Analyze and improve system efficiency")
    parser.add_argument("--investigation-label", default=None)
    parser.add_argument("--wave", choices=["1", "2", "3"], default=None)
    parser.add_argument("--run-background", action="store_true")
    parser.add_argument("--team", default=None)
    args = parser.parse_args()

    # Default to W1 LIFTOFF (user invocation = max velocity)
    if not args.wave:
        args.wave = "1"

    # Refuse deprecated credential channels BEFORE doing any work, and name what was seen. A
    # deprecation that fires silently is indistinguishable from "nothing was offered".
    for env_name, why in REFUSED_CREDENTIAL_ENVS.items():
        if os.environ.get(env_name):
            print(f"REFUSED: {env_name} is set. {why}", file=sys.stderr)
            print(f"         CompassCrew/spawn does not read it. Use the PUBLIC {ENV_SPAWN_ID}; "
                  f"the child generates its own keypair in-process.", file=sys.stderr)
            return 2

    spawn_id = os.environ.get(ENV_SPAWN_ID, "").strip()
    if spawn_id:
        print(f"🔖 Spawn slot: {spawn_id} (public label)")
    else:
        # UNMEASURED, not an error: this hand may simply be running outside the spawn pipeline.
        print(f"🔖 Spawn slot: UNMEASURED — no {ENV_SPAWN_ID} in the environment")

    # Check context warnings (non-blocking)
    formulas = read_formulas()
    altimeter = read_altimeter()
    warning = check_context_warnings(formulas, altimeter)
    if warning:
        print(f"⚠️  {warning}")

    # Generate investigation label
    if not args.investigation_label:
        ts = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
        args.investigation_label = f"spawn-{ts}"

    # Select team
    team = select_team(args.semantic_intent, args.team)

    # Read context bundle
    bundle = read_bundle(args.investigation_label)

    # Print summary
    print(f"🎯 Intent: {args.semantic_intent}")
    print(f"👥 Team: {', '.join(team)}")
    print(f"🌊 Wave: {args.wave} ({WAVE_CONFIG[args.wave]['name']})")
    print(f"📋 Label: {args.investigation_label}\n")

    # Spawn agents
    directives = []
    background = args.run_background or WAVE_CONFIG[args.wave]["background"]
    model = WAVE_CONFIG[args.wave]["model"]

    for idx, agent_type in enumerate(team):
        prompt = f"""{bundle}

---

# Task Assignment

**Agent:** {agent_type}
**Wave:** {args.wave} ({WAVE_CONFIG[args.wave]['name']})
**Investigation:** {args.investigation_label}
**Intent:** {args.semantic_intent}

Navigate via investigation_label + frontier scan.
Write manifest to: forensics/manifests/{{YYYY-MM-DD}}/{{HH-MM-SS}}Z_manifest_{{investigation}}_{{agent}}.json
"""

        directive = spawn_agent(agent_type, len(team), idx, prompt, args.wave, args.investigation_label, model, background)
        directives.append(directive)

        print(f"  {idx+1}. {agent_type:25} {'background' if background else 'inline'}")

    # Output directives as JSON lines for skill harness to execute
    print(f"\n# Agent spawn directives (skill harness will execute):\n")
    for directive in directives:
        print(json.dumps(directive))
    return 0

if __name__ == "__main__":
    sys.exit(main())
