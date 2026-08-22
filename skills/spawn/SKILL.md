---
name: spawn
description: "Semantic-intent team spawner — auto-assemble complementary 4-agent teams with differentiated bundles. Takes high-level task intent, auto-selects best-fit agents, emits context-aware bundles, spawns in parallel. All swarm agents: haiku. Depth = volume × emergence. Agents coordinate via manifest compass edges + investigation_label clustering (zero messaging, pure filesystem)."
argument-hint: "\"<semantic_intent>\" [--wave 1|2|3] [--investigation-label LABEL] [--run-background] [--team agent1,agent2,agent3,agent4]"
version: 2.1.0
user-invocable: true
allowed-tools: Bash, Read, Write, Agent
model: haiku
effort: low
---

# /spawn — Semantic-Intent Team Spawner (Flywheel Orchestrator)

## PRE-REG GATE

Any spawn touching agent system files (`$CLAUDE_HOME`, default `~/.claude/`) MUST have a pre-registration entry in the active charter BEFORE the agent is spawned.

Required format for each change:
```
CHANGE:            <short description of what changes>
BASELINE:          <current state — specific metric if available>
PREDICTED:         <what changes after fix — specific numbers or behavior>
MUTATION_TYPE:     beneficial | neutral | harmful | uncertain
EVAL_DIMS:         <list of A-G dimensions affected, or [] if none>
FALSIFIABLE_CLAIM: <verifiable statement: "After fix: X will be Y after N sessions">
```

Charter path: `~/.claude/templates/charters/active/`
If no active charter exists: create one from `~/.claude/templates/charters/system-tweak-charter-template.json` first.
Charter lifecycle over MCP: `reckon_charter verb=declare` (pro) opens one, `verb=close` retires it,
`verb=validate` runs the MANIFEST-CHARTER-REF check. The archiver path that used to be named here
(`$SWARMY_REPO/scripts/4x_charter_archiver.py`) referenced a pre-rebrand env var no current install
sets, so the instruction resolved to `/scripts/4x_charter_archiver.py` and silently pointed nowhere.

Spawns without pre-reg entries for system-file changes are BLOCKED pending charter creation.

## SPAWN IDENTITY GATE

The only identity value that crosses into a child is **`RECKON_SPAWN_ID`** — a PUBLIC label,
safe in a transcript, a log or a screenshot. The child generates its own keypair IN PROCESS,
claims its parent-opened slot by publishing only its PUBLIC key, and proves possession
thereafter by signing a target-bound, single-use challenge. First claim wins; a filled slot
refuses a second.

`spawn.py` REFUSES, by name and with a non-zero exit, if either of these is set:

| Env | Status |
|---|---|
| `RECKON_SPAWN_TOKEN` | RETIRED 2026-07-30 — a bearer secret; whoever holds it authenticates as the child |
| `RECKON_SPAWN_KEY` | DEPRECATED 2026-08-01 — a raw private ed25519 seed in plaintext through the environment, process table, shell history and transcript |

There is no parameter, environment read, or emitted field in this skill that can carry a private
seed, mnemonic or salt, and there deliberately never will be. **No value that can sign may ever
leave the process that made it.** Full rationale:
`reckon-lite/tools/revenant_spawnkey_lite.py`, block "WHAT WAS TRIED, AND WHY EACH FAILED".

---

Takes a high-level task intent and automatically assembles a complementary team of 4 agents with differentiated context bundles. Each agent receives a role-aware prompt tailored to their expertise. Agents discover follow-up work via manifest chaining (investigation_label + compass edges). Pure filesystem coordination, zero central dispatcher.

## Wave Specifications

| Wave | Name | Max Parallel | Model | Run Mode | Use Case |
|------|------|--------------|-------|----------|----------|
| **W1** | LIFTOFF | 6 haiku agents | haiku | inline | Max burn, parallel triage, cache hit |
| **W2** | CRUISE | 4 haiku agents | haiku | inline | Feature work, focused investigation |
| **W3** | INSERTION | 1 haiku agent | haiku | background | Deep synthesis, report generation (synthesis background agent) |

## Auto-Team Selection

/spawn analyzes your semantic intent and selects from 4 team templates:
- **analysis** → data-analyst, research-analyst, code-reviewer, knowledge-synthesizer
- **synthesis** → documentation-engineer, knowledge-synthesizer, research-analyst, data-analyst
- **implementation** → fullstack-developer, python-pro, code-reviewer, ai-engineer
- **audit** → security-auditor, code-reviewer, data-analyst, knowledge-synthesizer

Override with `--team agent1,agent2,agent3,agent4`.

## Quickstart

```bash
# W1 LIFTOFF: 6-agent analysis wave (auto-selected from intent)
/spawn "Analyze FFMx formula decomposition and identify optimization opportunities" --investigation-label ffmx-analysis

# W3 INSERTION: deep synthesis, background
/spawn "Generate comprehensive report with cited sources and visual breakdowns" --wave 3 --run-background --investigation-label ffmx-final

# Custom team
/spawn "Custom task" --team data-analyst,code-reviewer,research-analyst,documentation-engineer
```

## Full Usage

```
/spawn "<semantic_intent>" [--wave 1|2|3] [--investigation-label LABEL] [--run-background] [--team custom,team,list]
```

**Investigation label:** Auto-generated if not provided (spawn-YYYYMMDD-HHMMSS)

## MANDATORY EXECUTION PROTOCOL (do not just show docs)

**When /spawn is invoked via Skill tool, you MUST execute agents. Do not just show documentation.**

1. **Run spawn-direct.py to get directives:**
   ```bash
   python3 ~/.claude/skills/spawn/spawn-direct.py "<intent>" --mission <mission_name> --wave <1|2|3> --team <agent1,agent2,agent3,agent4>
   ```
   Example: `python3 ~/.claude/skills/spawn/spawn-direct.py "Fix the spawn execution bug" --mission mission-spawn-fix --wave 1 --team python-pro,code-reviewer,ai-engineer,security-auditor`

2. **Parse each JSON line from stdout** — each line is one directive with fields:
   - `subagent_type` (string, e.g., "python-pro")
   - `prompt` (string, full bundle context)
   - `model` (string, "haiku" or "sonnet")
   - `run_in_background` (boolean, true for W3)

3. **Call Agent() for EVERY directive in the SAME message** (parallel W1/W2):
   ```python
   # Pseudo-code for what you (main) must do:
   for directive in parsed_directives:
       Agent(
           subagent_type=directive["subagent_type"],
           prompt=directive["prompt"],
           model=directive["model"],
           run_in_background=directive["run_in_background"]
       )
   ```
   **DO NOT use Skill("spawn") recursively.** You are already in the /spawn context. Call Agent() directly.

4. **Wait for all Agent() calls to return** (for W1/W2; W3 runs async in background)
   - Agents write manifests to `$SWARMY_FORENSICS/{YYYY-MM-DD}/{mission}/` automatically
   - You will receive TaskNotification events when agents complete

5. **Read manifests from `$SWARMY_FORENSICS/{YYYY-MM-DD}/{mission}/`** to understand what agents produced
   - Manifest format: `{ISO_TIMESTAMP}__{mission}__{task_id}__{agent}__manifest.json`
   - Read only manifest, NOT full transcript (manifest is ≤5KB, transcript is 50KB+)

## DO NOT:
- ❌ Just show this documentation and stop
- ❌ Just show charter requirements and stop
- ❌ Ask user for confirmation before spawning (execute immediately)
- ❌ Call Skill("spawn") recursively — it will only show docs again, not spawn agents
- ❌ Use `--run-background` flag for W1/W2 (inline only)

## Example Execution (REAL CODE):

If user calls `/spawn "Analyze token metrics" --investigation-label token-analysis`, here is what you do:

1. Bash: `python3 ~/.claude/skills/spawn/spawn-direct.py "Analyze token metrics" --mission token-analysis --wave 1 --team data-analyst,research-analyst,code-reviewer,knowledge-synthesizer`
2. Parse the 4 JSON lines returned → 4 directives
3. Call Agent() 4 times (in parallel, same message):
   ```
   Agent(subagent_type="data-analyst", prompt="[bundle for agent 1]", model="haiku", run_in_background=False)
   Agent(subagent_type="research-analyst", prompt="[bundle for agent 2]", model="haiku", run_in_background=False)
   Agent(subagent_type="code-reviewer", prompt="[bundle for agent 3]", model="haiku", run_in_background=False)
   Agent(subagent_type="knowledge-synthesizer", prompt="[bundle for agent 4]", model="haiku", run_in_background=False)
   ```
4. Wait for TaskNotification from all 4 agents
5. Read manifests from `$SWARMY_FORENSICS/2026-MM-DD/token-analysis/` to understand what they found
6. Return dashboard_line (≤80 chars) summarizing results

---

**Full procedure:** Read `~/.claude/skills/spawn/BODY.md`
