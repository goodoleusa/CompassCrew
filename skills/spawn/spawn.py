#!/usr/bin/env python3
"""
/spawn — Semantic-Intent Team Spawner (Consolidated, Working)

Single script that:
1. Parses semantic intent + args
2. Auto-selects team + wave
3. Reads context bundles
4. Actually spawns agents via Agent() tool directives

No more run.py/executor.py split. Just works.
"""

import sys
import json
import argparse
from pathlib import Path
from datetime import datetime, timezone

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

def read_formulas():
    path = Path("/mnt/d/0local/.claude/faerie2-formulas.json")
    try:
        with open(path) as f:
            return json.load(f)
    except:
        return {}

def read_altimeter():
    path = Path("/mnt/d/0local/.claude/altimeter.json")
    try:
        with open(path) as f:
            return json.load(f)
    except:
        return {"context_pct": 50}

def check_context_warnings(formulas, altimeter):
    """Check context fill and warn if approaching limits. Does NOT gate spawning."""
    try:
        pct = float(altimeter.get("context_pct", 50))
        red_alert = float(formulas.get("IMMUTABLE_CONSTANTS", {}).get("AUTO_COMPACT_PCT_THRESHOLD", {}).get("value", 93.5))

        if pct >= red_alert:
            return f"🔴 RED ALERT: {pct}% context >= {red_alert}% (compact imminent). Proceeding with spawn anyway."
        elif pct >= 85:
            return f"🟡 CAUTION: {pct}% context is high. Consider compacting after this wave."
        return None
    except:
        return None

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
    """Assemble context bundle for agents."""
    parts = []

    # Global HONEY
    honey = Path("/mnt/d/0LOCAL/.claude/HONEY.md")
    if honey.exists():
        with open(honey) as f:
            parts.append(f"# Global Principles\n\n{f.read()[:1000]}\n")

    # NECTAR tail-50
    nectar = Path("/mnt/d/0LOCAL/.claude/NECTAR.md")
    if nectar.exists():
        with open(nectar) as f:
            lines = f.readlines()
            parts.append(f"# Recent Findings (NECTAR tail-50)\n\n{''.join(lines[-50:])}\n")

    # Bundle template
    template = Path("/mnt/d/0local/gitrepos/faerie2/.claude/scripts/0x_spawn_bundle_template.md")
    if template.exists():
        with open(template) as f:
            parts.append(f"# Bundle Structure (Self-Describing)\n\n{f.read()[:2000]}\n")

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

if __name__ == "__main__":
    main()
