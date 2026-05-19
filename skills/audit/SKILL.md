---
description: Unified audit — COC immutability, script equilibrium, investigation gate, session-hook lifecycle. One skill, 4 targets, --all default.
argument-hint: "[--target coc|equilibrium|investigation|session|all] [--fix] [--verbose] [--commits N]"
model: haiku
effort: low
---

# /audit

Unified audit skill replacing four formerly-separate audit skills (audit-coc, audit-equilibrium, audit-investigation, audit-session). Same 4 forensic-integrity checks, one entry point.

## Targets

### `--target coc` — Chain-of-Custody Immutability
Verify that COC critical files are append-only and never overwritten:
- `forensics/coc.jsonl` — hash chain unbroken, no entry mutations
- `forensics/manifests/`, `forensics/artifacts/`, `forensics/bundles/`, `forensics/coc-entries/` — no in-place edits to existing files
- `forensics/supersessions/` — append-only
- `~/.claude/hooks/state/native-to-honey-coc.jsonl` — hash chain unbroken
- Method: walk each tracked path; for any file mtime within last N hours, verify its hash matches the COC entry that committed it.

### `--target equilibrium` — Script Equilibrium
Verify every Python script in `scripts/` and `hooks/` follows the equilibrium contract:
- Has a tier prefix (`0x_`, `1x_`, ..., `9x_`)
- If superseding another script, has a `REPLACES:` comment in header
- Has at least one `METRIC:` annotation declaring the script's measurable purpose
- `--fix` mode adds missing `METRIC:` placeholders for review (does NOT auto-fill REPLACES — that requires human attribution).

### `--target investigation` — Investigation Gate
Verify the last N commits (default 10) only added forensic completeness work, no unrelated features:
- For each commit: parse the message; if it doesn't reference a `mission_id` from `forensics/missions/` OR an explicit `gate-N` marker, flag it.
- Cross-reference touched files: changes to scripts/ + hooks/ without a mission attribution are gate violations.
- Output: `gate_violations[]` per commit, with severity.

### `--target session` — Session Lifecycle Hooks
Verify session start/stop hooks are registered AND firing:
- Read `settings.json` and project `settings.json`; confirm `SessionStart`, `SubagentStop`, `PreCompact`, `SessionStop` event hooks declared.
- For each declared hook: check the script path exists, is executable, syntax-valid.
- `--test` mode: invoke each hook with synthetic input, verify exit code 0 + expected stdout.

### `--target all` (default)
Run all 4 audits sequentially. Stop on first ERROR (immutability or gate violation); continue through warnings.

## Output

Single JSON manifest at `forensics/ephemeral/{date}/audit/manifest_audit_{target}_{ts}.json`:

```json
{
  "schema": "audit-v2",
  "target": "all|coc|equilibrium|investigation|session",
  "timestamp": "...",
  "results": {
    "coc":           { "status": "PASS|WARN|FAIL", "checks_run": N, "issues": [...] },
    "equilibrium":   { "status": "...",            "scripts_audited": N, "missing_metric": [...], "missing_replaces": [...] },
    "investigation": { "status": "...",            "commits_checked": N, "gate_violations": [...] },
    "session":       { "status": "...",            "hooks_declared": N, "hooks_firing": N, "broken": [...] }
  },
  "overall_verdict": "PASS|WARN|FAIL",
  "next_action": "..."
}
```

## When to use

- Before any commit touching scripts/hooks (run `--target all`)
- Before crystallization (Phase 2.5 evidence verification depends on intact COC)
- After settings.json edits (`--target session`)
- During refactors (`--target equilibrium`)
- During release readiness checks (`--target all`)

## Replaces

Deprecated skills consolidated into this one (2026-05-04):
- `audit-coc` → `--target coc`
- `audit-equilibrium` → `--target equilibrium`
- `audit-investigation` → `--target investigation`
- `audit-session` → `--target session`
