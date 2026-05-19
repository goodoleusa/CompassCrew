
/faerie = self-orienting session orchestrator. Read → launch → brief in 1 turn.

**What it does:** Reads the latest handoff/brief, runs Wave 1+2 agents **synchronously**
(inline, awaited), then responds ONCE with a completed dashboard. Wave 3 fires after response.
No "launching agents" status lines. User sees nothing until work is done.

## Modes

| Invocation | Role | Behavior |
|---|---|---|
| `/faerie` | DRILL | W1+W2 on cwd project via compass graph (default) |
| `/faerie start` | SWEEP | All-project morning sweep Phase 1-3 |
| `/faerie good morning` | SWEEP | Alias for start |
| `/faerie drill <proj>` | DRILL | Explicit project drill |
| `/faerie all` | SWEEP | Force sweep even if warm session |
| `/faerie phase2` | SURF | Surface existing crumbs, no re-sweep |
| `/faerie focus on H2` | WORK + FOCUS | Drill with semantic intent filter |
| `--train` | TRAIN | Load training queue, run autotune, skip investigation tasks |
| `--train evidence-analyst` | TRAIN + TARGET | Train a specific agent type |
| `--review` | REVIEW | Red-team top findings, no tasks launched |
| `--queue` | ORCHESTRATE | Queue manager only — add/reorder/reprioritize |
| `--explain` | DRY RUN | Show what /faerie WOULD do without doing it |

### Mode Routing (2026-04-26 — Project-Centric Default)

**Default changed:** `/faerie` now drills cwd project via compass graph. Morning sweeps require explicit `start` or `good morning`.

**Drill mode data flow:**
```
detect_cwd_project()
    ↓
read_compass_bundles(project)     # ~/.claude/hooks/state/bundles/*.json
    ↓ W1 JSONL to stdout
read_manifest_edges(project)      # forensics/ next_task_queued + compass_edge
    ↓ W2 JSONL to stdout
Agent() callers parse JSONL → spawn in parallel
```

Implementation: `~/.claude/skills/faerie/daily_rhythm.py` — `drill_mode()` + `sweep_mode()`.

**Session boundaries:** `/faerie` = session START. `/handoff` = session END (inverse).
`/crystallize` = explicit memory crystallization round (any time).
Pass natural language after any flag — it becomes the session focus/filter.

---

## TURN 0 COMPLETION PATTERN (non-negotiable)

**The rule: Do not respond until Wave 1 AND Wave 2 are complete.**

The user sees NOTHING until both waves return. This means:

- Wave 0: bash reads (non-blocking, run while reading context files)
- Wave 1: spawn ALL fast agents WITHOUT run_in_background — faerie waits inline
- Wave 2: spawn ALL medium agents WITHOUT run_in_background — faerie waits inline
- After both waves return: merge results, build dashboard, respond ONCE
- Wave 3: spawn WITH run_in_background: true AFTER the single response

**Why not background + poll:** Claude Code CLI Agent tool does not expose a TaskOutput
polling mechanism. The only reliable synchronous-await is spawning without run_in_background.
The wave completes when the Agent call returns. This is the correct pattern.

**Timeout handling (defensive):**
- If W1 individual agent stalls >5 min (rare): note partial, proceed to W2 anyway
- If W2 individual agent stalls >8 min total: mark partial, include in dashboard
- Partial result format: {agent} PARTIAL — still running in background
- Never skip the response. Partial dashboard is better than infinite wait.

---

## Execution Flow

### Step 0 — Context reads + bash Wave 0 (parallel, before any Agent spawn)

Run ALL simultaneously. These are bash-only — fast, cheap, no Agent tool:

```bash
python3 ~/.claude/hooks/state/faerie_turn1.py          # queue state + brief freshness + auto-patch
python3 ~/.claude/scripts/health_check.py 2>/dev/null  # system health flags
python3 ~/.claude/hooks/state/session_heartbeat.py read 2>/dev/null

# Cross-project registry scan — all active projects + their queue state
REGISTRY=$(cat ~/.claude/hooks/state/project-registry.json 2>/dev/null)
# For each active project, check local queue depth if local_queue is set
python3 - << 'REGISTRY_SCAN'
import json, os
from pathlib import Path
reg_path = Path.home() / ".claude" / "hooks" / "state" / "project-registry.json"
wsl_path = Path("/mnt/d/0LOCAL/.claude/hooks/state/project-registry.json")
for p in [reg_path, wsl_path]:
    if p.exists():
        reg = json.loads(p.read_text())
        active = [r for r in reg.get("projects", []) if r.get("active")]
        print(f"PROJECTS ({len(active)} active):")
        for proj in active:
            lq = proj.get("local_queue")
            depth = ""
            if lq and Path(lq).exists():
                try:
                    q = json.loads(Path(lq).read_text())
                    pending = sum(1 for t in q.get("tasks", []) if t.get("status") == "pending")
                    depth = f" [{pending} pending]"
                except Exception:
                    pass
            print(f"  [{proj.get('priority','?')}] {proj['name']}{depth} — {proj.get('sprint_goal','')[:80]}")
        break
REGISTRY_SCAN
python3 ~/.claude/scripts/batch_collect.py 2>/dev/null  # overnight batch results
ANNOTATION_RESULT=$(python3 ~/.claude/scripts/vault_annotation_sync.py --apply --limit 50 2>/dev/null)  # sync pending human annotations
python3 ~/.claude/scripts/queue_vault_sync.py --hook 2>/dev/null  # import vault queue annotations ([!]/[>]/[~]/[x])
cat ~/.claude/hooks/state/handoff-snapshot-summary.json 2>/dev/null  # FIX #3: lightweight summary, avoids 1009KB Read limit
cat ~/.claude/hooks/state/overnight-synthesis-results.json 2>/dev/null
EVAL_GAPS=$(python3 /mnt/c/Users/amand/.claude/scripts/eval_harness.py --gaps 2>/dev/null)  # structured gap data

# f(0) lean queries — single-value outputs, <5 tokens each (replaces verbose cat/json reads)
EVAL=$(python3 ~/.claude/scripts/9x_lean_query.py --get-eval 2>/dev/null)          # eval:0.38->
WAVE=$(python3 ~/.claude/scripts/9x_lean_query.py --get-wave 2>/dev/null)          # W1
QUEUE=$(python3 ~/.claude/scripts/9x_lean_query.py --get-queue 2>/dev/null)        # pending:2 queued:33...
FLAGS=$(python3 ~/.claude/scripts/9x_lean_query.py --get-flags 2>/dev/null)        # 0
DROPS=$(python3 ~/.claude/scripts/9x_lean_query.py --get-droplets 2>/dev/null)     # 4
STIG=$(python3 ~/.claude/scripts/9x_lean_query.py --get-stigmergy 2>/dev/null)     # 86

# PRINCIPLE: Index-first pattern
# faerie is a dispatcher, not a reader. Read shape (counts, flags), not content.
# Content stays with agents. This reduces Wave 0 context from ~200KB → ~5KB.
python3 ~/.claude/scripts/8x_faerie_brief_index_generator.py 2>/dev/null
python3 ~/.claude/scripts/8x_w1_completion_index_generator.py 2>/dev/null
python3 ~/.claude/scripts/8x_droplet_index_generator.py 2>/dev/null

# Read the lightweight indices (shape only — task counts, flags, completion rates)
BRIEF_INDEX=$(cat ~/.claude/hooks/state/faerie-brief-index.json 2>/dev/null)
W1_INDEX=$(cat ~/.claude/hooks/state/w1-completion-index.json 2>/dev/null)
DROPLET_INDEX=$(cat ~/.claude/hooks/state/droplet-index.json 2>/dev/null)

# Conditional full-content reads: only when index signals something unusual
if echo "$BRIEF_INDEX" | python3 -c "import sys,json; d=json.load(sys.stdin); exit(0 if d.get('brief_metadata',{}).get('priority_flags') else 1)" 2>/dev/null; then
  # Priority flags exist — read only HIGH entries from brief, not full content
  cat ~/.claude/hooks/state/faerie-brief.json 2>/dev/null | python3 -c "import sys,json; tasks=json.load(sys.stdin); tasks=tasks if isinstance(tasks,list) else tasks.get('tasks',[]); print(json.dumps([t for t in tasks if t.get('priority') in ('HIGH','CRITICAL','high','critical')][:10], indent=2))" 2>/dev/null
fi
```

**Read context in priority order while bash runs:**
1. **handoff-snapshot-summary.json** (~50KB, avoids 256KB Read limit) age < 12h -> use it (essential state for Turn 0)
2. **handoff-snapshot.json** (full, ~1009KB) -> fallback if summary missing or conditional deep reads
3. faerie-brief.json age < 12h -> lighter fallback
4. 7x_emergency_handoff.py output -> if no fresh snapshot
5. piston-checkpoint.json -> resume signals (last_wave_launched, agents_in_flight)
6. REVIEW-HOT.md -> active flags (last 48h only, critical blocking items)

**Fresh-start detection (>8h since last session):** If brief age > 8h or heartbeat > 8h:
```bash
python3 ~/.claude/scripts/7x_emergency_handoff.py  # collects all active project memories
```
Cross-project summary enters the dashboard under PROJECTS.

Write session presence:
```bash
python3 ~/.claude/hooks/state/session_heartbeat.py write --role WORK 2>/dev/null
```

Check overnight-synthesis-results.json — integrate Opus batch output before W2 if present.

Read annotation sync state (written by vault_annotation_sync --apply above):
```bash
cat ~/.claude/hooks/state/annotation-sync-state.json 2>/dev/null
```
If ``pending_found > 0`` and ``applied > 0``: include in dashboard as:
``Annotations applied: {applied} | Forensic receipts: {applied}  ({correction_types from ANNOTATION_RESULT if available})``
If ``pending_found > 0`` and ``applied == 0`` (dry-run or error): surface as FLAG.

### Step 1a — Agent Selection (Performance-Driven Routing)

Before executing static waves, infer task domain and select the optimal agent roster using
performance scores from `7x_select_agent.py`. Domain keywords are pre-mapped to agent types;
agent selection uses pre-computed performance cards (no LLM inference overhead).

```bash
# Infer domain from user brief or queue context
BRIEF="${user_input_or_prior_context:-}"
DOMAIN=$(python3 << 'DOMAIN_DETECT_EOF'
import sys, os
brief = os.environ.get("BRIEF", "").lower()
domains = {
    "forensics":      ["audit", "verify", "hash", "signature", "coc", "evidence", "security", "chain"],
    "eval":           ["score", "performance", "baseline", "beat", "improvement", "quality"],
    "infrastructure": ["deploy", "devops", "pipeline", "script", "sync", "ci/cd", "automation"],
    "frontend":       ["ui", "dashboard", "component", "visual", "design", "browser"],
    "data":           ["ingest", "etl", "csv", "json", "database", "sql", "data-engineer"],
    "api":            ["endpoint", "rest", "integration", "webhook", "http", "request"],
    "research":       ["analysis", "investigation", "osint", "deep-dive", "pattern"],
}
for domain, keywords in domains.items():
    if any(kw in brief for kw in keywords):
        print(domain)
        sys.exit(0)
print("general")
DOMAIN_DETECT_EOF
)

# Use 7x_select_agent.py to get performance-ranked agent roster for domain
SELECTED_AGENTS=$(python3 ~/.claude/scripts/7x_select_agent.py \
    --task "$DOMAIN $BRIEF" \
    --top-n 3 \
    --json 2>/dev/null || echo "[]")

# Show selection in dashboard (fast path — no LLM inference)
echo "AGENT SELECTION (domain=$DOMAIN):"
echo "$SELECTED_AGENTS" | python3 -c "
import sys, json
agents = json.load(sys.stdin)
for a in agents:
    print(f\"  {a['agent']:30s} score={a.get('score',0):.2f}  {a.get('reason','')[:60]}\")
" 2>/dev/null || true
```

**Domain → Primary Agent mapping:**

| Domain | Primary Agent | Fallback |
|--------|--------------|---------|
| forensics | security-auditor | evidence-curator |
| eval | performance-eval | membot |
| infrastructure | python-pro | code-reviewer |
| frontend | fullstack-developer | documentation-engineer |
| data | data-engineer | data-scientist |
| api | research-analyst | python-pro |
| research | research-analyst | knowledge-synthesizer |
| default | stigmergy-scout | — |

**Hardening note (mth00091):** `general-purpose` removed from this table.
Bare `general-purpose` spawns are rejected by `scripts/0x_spawn_template.py`
(_reject_bare_general_purpose) and queue claim path (`_claim_validate_general_purpose`
in `scripts/7x_queue_ops.py`). When no specialist matches, route to `stigmergy-scout`
via prompt-injection prefix (see `docs/SCOUT-CONVENTION.md`), NOT direct general-purpose.
Pre-flight check required: scan task category/task_type/goal for specialist keywords
before any scout fallback.

This selection feeds into the `_pick_agent()` function (Step 1b) as a performance override.
If `select_agent.py` returns a valid agent with score >= 0.7, it replaces the static category map.

### Step 1b — Wave Planning via piston.py

Delegate wave assignment and orchestration to piston script infrastructure:

```bash
# Classify pending tasks into speed tiers (W1=fast/45s, W2=medium/180s, W3=deep/600s)
WAVE_PLAN=$(python3 ~/.claude/scripts/piston.py plan --queue-file ~/.claude/hooks/state/sprint-queue.json)
# Returns: {"waves": {"W1": [tasks], "W2": [tasks], "W3": [tasks]}, "stats": {...}}

# Extract wave assignments
W1_TASKS=$(echo "$WAVE_PLAN" | jq -r '.waves.W1')
W2_TASKS=$(echo "$WAVE_PLAN" | jq -r '.waves.W2')
W3_TASKS=$(echo "$WAVE_PLAN" | jq -r '.waves.W3')
```

**Speed tier assignment (piston.py):**
- **W1 (fast, 45s):** Explore, security-auditor, admin-sync, token-optimizer, context-manager, claude-code-guide, trail-finder (2x parallel, cold-start auto)
- **W2 (medium, 180s):** data-engineer, data-scientist, code-reviewer, knowledge-synthesizer, report-writer, evidence-analyst, memory-keeper
- **W3 (deep, 600s):** Complex synthesis, multi-source correlation, final narrative

If queue empty: piston assigns default triage team (context-manager + membot).

### Step 1c — Baseline Capture (before any Agent spawn)

After piston.py returns wave assignments, capture baseline metrics for every task:

```bash
# Pipe wave plan directly into baseline capture — reads done_looks_like from each task
echo "$WAVE_PLAN" | python3 ~/.claude/skills/run/faerie_baseline_capture.py --stdin
# Returns: {"captured": N, "skipped": N, "baselines": [...]}
# Writes: ~/.claude/hooks/state/task-baselines/{task_id}.json per task
```

**Why here:** This is the only moment where we know (a) which tasks are about to run, (b) their wave assignment, and (c) their done_looks_like criteria. Once agents spawn, the opportunity to capture a clean pre-run baseline is gone.

**Idempotent:** Tasks with a fresh baseline (<2h old) are skipped — safe to re-run.

**Integration with auto_eval.py:** When agents complete, the PostToolUse hook (`auto_eval_hook.py`) reads the baseline written here and scores the output. No baseline = no score. This step is what enables quality tracking across sessions.

### Step 2 — Execute Wave 1 (via TeamCreate + Agent spawns)

**Create W1 team** (shared task list, stigmergic coordination):

```python
# Pseudo-code: run this before any W1 agent spawn
TeamCreate({
  "team_name": f"wave1-{CLAUDE_SESSION_ID[:8]}",
  "description": f"Wave 1 triage agents — {len(W1_TASKS)} fast tasks (45s timeout)"
})
```

**Ensure vault output folder is set for today:**

```bash
python3 ~/.claude/scripts/set-vault-output.py --reset
VAULT_OUTPUT_FOLDER=$(cat ~/.claude/hooks/state/vault-output-config.json | python3 -c "import sys,json; print(json.load(sys.stdin)['vault_output_folder'])")
```

**Cold-start W1 mandatory agents (always spawn, regardless of queue state):**

Trail-finder runs 2x parallel at every cold-start W1 to surface abandoned work before task selection.
Spawn before queue-derived W1 agents. Manifest return path pattern:
`~/.claude/hooks/state/wave1-trail-finder-{A|B}-{SESSION_ID8}-result.json`

```python
# Trail-finder cold-start spawn (2 parallel, always at W1)
# Proxy: research-analyst with trail-finder proxy_context from custom-agent-registry.json
TRAIL_FINDER_CONTEXT = (
    "You are acting as trail-finder agent. "
    "Role: stigmergy scout — scan state/, pollen/, and forensics/ for abandoned work. "
    "Scan categories: "
    "(1) ~/.claude/hooks/state/ files with status=in-progress but mtime > 30min, "
    "(2) {repo}/.claude/memory/pollen-*.md with open THREAD/BLOCKER MEM blocks, "
    "(3) {repo}/forensics/ manifests with status=draft/in-progress older than 30min. "
    "Lookahead depth: 2 (direct dependency only). "
    "Render ranked trail list (newest abandoned first). "
    "Do NOT re-execute — identify and report only. "
    f"MANIFEST_RETURN: ~/.claude/hooks/state/wave1-trail-finder-{{slot}}-{CLAUDE_SESSION_ID[:8]}-result.json"
)
for slot in ("A", "B"):
    Agent(
        subagent_type="research-analyst",
        team_name=f"wave1-{CLAUDE_SESSION_ID[:8]}",
        name=f"trail-finder-{slot}",
        prompt=TRAIL_FINDER_CONTEXT.format(slot=slot),
    )
```

**Spawn all W1 agents in parallel** (using deterministic template rendering):

```python
import subprocess, json, os
from pathlib import Path

CLAUDE_HOME = Path.home() / ".claude"
SPAWN_TEMPLATE_ROOT = os.environ.get("SPAWN_TEMPLATE_ROOT", str(CLAUDE_HOME / "spawn-templates"))

# For each task in W1_TASKS, render boilerplate via 0x_spawn_template.py, then spawn:
for task in W1_TASKS:
  # Call template renderer (deterministic, ~50 tokens overhead)
  template_result = subprocess.run([
    "python3", str(CLAUDE_HOME / "scripts" / "0x_spawn_template.py"), "render",
    "--template", f"w1-{task['assigned_agent']}",
    "--params", json.dumps({
      "task_id": task['task_id'],
      "task_goal": task['goal'],
      "vault_output_folder": VAULT_OUTPUT_FOLDER,
      "session_id": CLAUDE_SESSION_ID[:8],
      "wave": 1
    })
  ], capture_output=True, text=True, env={**os.environ, "SPAWN_TEMPLATE_ROOT": SPAWN_TEMPLATE_ROOT})
  
  RENDERED_PROMPT = template_result.stdout.strip()
  
  Agent({
    "subagent_type": task["assigned_agent"],
    "team_name": f"wave1-{CLAUDE_SESSION_ID[:8]}",
    "name": f"{task['assigned_agent']}-{task['task_id'][:8]}",
    "prompt": RENDERED_PROMPT  # ← deterministic template output, not inline boilerplate
  })
```

**Token overhead reduction:** Template rendering ~50 tokens vs inline boilerplate ~10,300 tokens per spawn = **99.5% reduction per agent spawn** (200K+ tokens/faerie cycle → ~250 tokens).

The team handles:
- Shared task list at `~/.claude/tasks/wave1-{session_id_8}/` (all agents see same queue)
- Manifest collection via task list updates (no orchestrator needed)
- Stigmergic coordination (agents discover each other's work via task status + manifests)
- Auto-checkpointing via task completion callbacks
- Return to faerie when all W1 tasks complete OR timeout (45s per spec)

Required fields in every W1 agent prompt (piston_orchestrator injects these):
```
PRIMARY TASK: {goal from queue task — specific, actionable}
TASK ID: {task_id for queue status update on completion}
QUEUE CONTEXT: {up to 5 adjacent tasks same category}
MANIFEST RETURN: write JSON summary to ~/.claude/hooks/state/wave1-{agent_type}-result.json
  Required format: {"agent": "{type}", "ts": "{iso}", "wave": 1,
                    "findings": N, "output_path": "~/.claude/hooks/state/wave1-{agent_type}-full.json",
                    "dashboard_line": "...", "files_written": [...], "next": "...",
                    "builds_on": ["prior-manifest-id-or-path"],
                    "contradicts": ["prior-manifest-id-or-path"]}
  Return the manifest path, not full content. Full output goes to output_path (parent reads only on explicit need).
  dashboard_line: ONE-line summary for Turn 0 dashboard (~50 tokens max).
STREAMING + STIGMERGY:
  - Stream reasoning to scratch MEM blocks (private trail)
  - Write output to manifest path progressively — draft at milestones, not just final
  - Use frontmatter status: in-progress -> draft -> final
  - If manifest already exists at that path: READ IT FIRST, build on it
VAULT OUTPUTS: check agent card ## Vault Outputs for blueprint type.
  Required frontmatter: type, blueprint, agent_type, session_id, doc_hash: sha256:pending, status: draft
  Map: ~/.claude/agents/BLUEPRINT-MAP.md
```

Wait for ALL Wave 1 Agent calls to return before Step 2.5.

### Step 2.5 — Post-Wave 1: Collect Manifests + Stream Observations

After all W1 agents return (teams self-coordinate via task list), collect results:

```bash
# Collect W1 manifests and stream observations to pollen
python3 ~/.claude/scripts/7x_auto_handoff.py \
  --wave 1 \
  --session-id "$CLAUDE_SESSION_ID" \
  --stream  # ← emits to pollen via 9x_memory_bridge.py

# Result: W1 findings summarized to pollen, manifests aggregated
```

**What this does:**
- Reads all wave1-*-result.json manifests from teams
- Streams key findings to pollen (via 9x_memory_bridge.py)
- Logs to forensics/agent-traces/ (COC record of wave completion)
- Returns aggregated W1 findings for dashboard

### Step 2.7 — Wave Boundary: Read Today's Droplets (tight W1→W2 feedback loop)

At the seam between W1 completion and W2 spawn, scan **today's droplets only** for synchronous insights:

```bash
# Droplet cadence: wave boundary mode — today only (tight feedback, no archive noise)
python3 ~/.claude/scripts/9x_droplet_cadence.py --mode wave-boundary --json 2>/dev/null > ~/.claude/hooks/state/droplet-wave-boundary.json
# (Read today's LIVE-*.md if it exists; inject any novel connections into W2 context)
```

This ensures W2 agents inherit not just W1 artifacts but also W1's real-time insights captured in droplets during the same session.

### Step 3 — Execute Wave 2 (via TeamCreate + Agent spawns with W1 context)

**Create W2 team** (shared task list, inherits W1 findings):

```python
# Read W1 manifests to pass findings context
W1_FINDINGS=$(head -10 ~/.claude/hooks/state/wave1-*-result.json | jq -s 'map(.findings)' | head -50)

# Optionally inject today's droplets if they exist (rich sessions)
W1_DROPLETS=$(cat ~/.claude/hooks/state/droplet-wave-boundary.json 2>/dev/null | jq -s 'map(.snippets[])' | head -20)

TeamCreate({
  "team_name": f"wave2-{CLAUDE_SESSION_ID[:8]}",
  "description": f"Wave 2 research agents — {len(W2_TASKS)} medium tasks (180s timeout, building on W1 findings + droplets)"
})
```

**Spawn all W2 agents in parallel** (using deterministic template rendering + W1 context):

```python
import subprocess, json, os
from pathlib import Path

CLAUDE_HOME = Path.home() / ".claude"
SPAWN_TEMPLATE_ROOT = os.environ.get("SPAWN_TEMPLATE_ROOT", str(CLAUDE_HOME / "spawn-templates"))

# For each task in W2_TASKS, render boilerplate via 0x_spawn_template.py, then spawn:
for task in W2_TASKS:
  # Call template renderer with W1 findings context (deterministic, ~50 tokens overhead)
  template_result = subprocess.run([
    "python3", str(CLAUDE_HOME / "scripts" / "0x_spawn_template.py"), "render",
    "--template", f"w2-{task['assigned_agent']}",
    "--params", json.dumps({
      "task_id": task['task_id'],
      "task_goal": task['goal'],
      "vault_output_folder": VAULT_OUTPUT_FOLDER,
      "session_id": CLAUDE_SESSION_ID[:8],
      "wave": 2,
      "upstream_findings": W1_FINDINGS[:1000]  # ← template includes this in context
    })
  ], capture_output=True, text=True, env={**os.environ, "SPAWN_TEMPLATE_ROOT": SPAWN_TEMPLATE_ROOT})
  
  RENDERED_PROMPT = template_result.stdout.strip()
  
  Agent({
    "subagent_type": task["assigned_agent"],
    "team_name": f"wave2-{CLAUDE_SESSION_ID[:8]}",
    "name": f"{task['assigned_agent']}-{task['task_id'][:8]}",
    "prompt": RENDERED_PROMPT  # ← deterministic template output
  })
```

The team handles:
- Shared task list with W1 context pre-loaded
- W2 agents read W1 manifests to inform their angles
- Stigmergic coordination (agents see each other's W2 progress + W1 findings)
- Return to faerie when all W2 tasks complete OR timeout (180s per spec)

### Step 3.5 — Post-Wave 2: Collect Manifests + Stream Observations

After all W2 agents return (teams self-coordinate via task list), collect results:

```bash
# Collect W2 manifests and stream observations to pollen
python3 ~/.claude/scripts/7x_auto_handoff.py \
  --wave 2 \
  --session-id "$CLAUDE_SESSION_ID" \
  --stream  # ← emits to pollen via 9x_memory_bridge.py

# Result: W2 findings summarized to pollen, manifests aggregated
```

**What this does:**
- Reads all wave2-*-result.json manifests from teams
- Streams key findings to pollen (via 9x_memory_bridge.py)
- Logs to forensics/agent-traces/ (COC record of wave completion)
- Returns aggregated W2 findings for dashboard

### Step 4 — Dashboard + Respond (faerie layer — LIGHTWEIGHT)

After W1+W2 complete (orchestrator signals completion), **delegate dashboard generation to subprocess**:

```bash
# Build dashboard from wave results in subprocess (cheap, disposable)
python3 ~/.claude/scripts/build_dashboard.py --wave 1 2 3 --session $CLAUDE_SESSION_ID
# Writes: ~/.claude/hooks/state/dashboard-turn-final.md (pre-formatted, one-shot)
```

Faerie responds once with **three things only**:
1. **Read dashboard** — `cat ~/.claude/hooks/state/dashboard-turn-final.md` (50 tokens, no synthesis)
2. **Vault status** — `echo "SESSION: {timestamp} | status: complete" >> $CT_VAULT/00-SHARED/Dashboards/system/session-status.md`
3. **Signal W3** — Return control to user; W3 spawns in background after response

**Why:** Dashboard synthesis (reading manifests, extracting, formatting) is 800-1500 tokens of synthesis work. Moving it to subprocess (expires after one use) frees faerie's persistent context for actual orchestration decisions.

### Step 5 — Wave 3 Spawn (background, after dashboard response)

**Create W3 team** (shared task list, deep synthesis with W1+W2 context):

```python
# Read W1+W2 manifests for synthesis context
W1_W2_CONTEXT=$(cat ~/.claude/hooks/state/wave{1,2}-*-result.json | jq -s 'map(.)' | head -400)

TeamCreate({
  "team_name": f"wave3-{CLAUDE_SESSION_ID[:8]}",
  "description": f"Wave 3 synthesis agents — {len(W3_TASKS)} deep tasks (600s background, multi-angle analysis)"
})
```

**Spawn all W3 agents in background** (using deterministic template rendering + W1+W2 context):

```python
import subprocess, json, os
from pathlib import Path

CLAUDE_HOME = Path.home() / ".claude"
SPAWN_TEMPLATE_ROOT = os.environ.get("SPAWN_TEMPLATE_ROOT", str(CLAUDE_HOME / "spawn-templates"))

# For each task in W3_TASKS, render boilerplate via 0x_spawn_template.py, then spawn in background:
for task in W3_TASKS:
  # Call template renderer with W1+W2 synthesis context (deterministic, ~50 tokens overhead)
  template_result = subprocess.run([
    "python3", str(CLAUDE_HOME / "scripts" / "0x_spawn_template.py"), "render",
    "--template", f"w3-{task['assigned_agent']}",
    "--params", json.dumps({
      "task_id": task['task_id'],
      "task_goal": task['goal'],
      "vault_output_folder": VAULT_OUTPUT_FOLDER,
      "session_id": CLAUDE_SESSION_ID[:8],
      "wave": 3,
      "synthesis_context": W1_W2_CONTEXT[:2000],  # ← template includes for multi-wave synthesis
      "droplet_folder": f"$CT_VAULT/00-SHARED/Droplets/"
    })
  ], capture_output=True, text=True, env={**os.environ, "SPAWN_TEMPLATE_ROOT": SPAWN_TEMPLATE_ROOT})
  
  RENDERED_PROMPT = template_result.stdout.strip()
  
  Agent({
    "subagent_type": task["assigned_agent"],
    "team_name": f"wave3-{CLAUDE_SESSION_ID[:8]}",
    "name": f"{task['assigned_agent']}-{task['task_id'][:8]}",
    "run_in_background": true,  # ← fires after faerie's response
    "prompt": RENDERED_PROMPT  # ← deterministic template output
  })
```

W3 runs async in background while user types their next prompt. Droplets auto-flow to vault (anti-evaporation). Manifests auto-complete via task-completion-handler.py on session stop. Next /faerie cycle reads W3 droplets via the droplet scan (Step 0, line 74) and includes them as context for the next piston loop.

### Step 6 — Dashboard format (the single Turn 0 response)

**Pre-built by build_dashboard.py, faerie just cats it:**

```
FAERIE 2026-04-07 15:05 | TURN 0 COMPLETE
================================================================================
EVAL: 0.64→  T:0.75  M:0.67  R:0.67
GAPS: QUALITY=0.35 → write NECTAR for today's work (also stamps citations ↑Q) | MODEL_ROUTING=0.59 → tag spawns w1-/w2- (every session ↑F)
[VANILLA: baseline is estimated — run /vanilla after a hard task for real delta]

WAVE 1  (4 agents)
  context-manager       → Loaded HONEY + NECTAR (120 items, 15KB)
  evidence-analyst      → Analyzed 8 findings, 3 gaps identified
  fullstack-developer   → Dashboard built (2 new views)
  admin-sync            → Coverage: admin.html + api_server.py (2 new features)

WAVE 2  (3 agents)
  data-engineer         → Pipeline clean, 50K rows ingested
  memory-keeper         → Promoted 12 findings to NECTAR
  knowledge-synthesizer → Cross-project synthesis: 4 connections

QUEUE: 10 HIGH | 5 MED | 2 LOW
MEMORY: brief fresh | scratch 3 files | HONEY 2.1K
INFLIGHT: W1⚡context-m… W1⚡evidence-… (2 running)
================================================================================
NEXT: /run to claim tasks | /handoff to close session
```

**GAPS line rules (mandatory when gap_count > 0):**
- Parse `$EVAL_GAPS` JSON from Step 0
- Show each gap as: `DIM=score → dual_task hint (also ↑X)`
- If `vanilla_suggest.suggest == true`: append `[VANILLA: {reason}]`
- If no gaps: omit GAPS line entirely (don't show "all healthy" noise)
- Gaps with priority=HIGH appear first, then MED
- Max 2 gaps inline; if more, collapse to `+N more — /dev-eval for full breakdown`

**Key insight:** Dashboard is built by `build_dashboard.py` (subprocess, 50 tokens, expires).
Faerie just reads the file via `cat ~/.claude/hooks/state/dashboard-turn-final.md`.
**Cost reduction:** 1500 tokens of synthesis → 50 tokens of file I/O. Faerie reclaims 30% of context budget for actual decisions.

### Step 7 — Faerie Cycle End: Vault Sync + COC Synthesis

At session end (user types `/handoff` or CLI exits), run cycle-end operations:

```bash
# Sync vault with agent findings (two-way: pull latest, push session results)
python3 ~/.claude/scripts/9x_sync_obsidian_vault.py --execute

# Build master COC (hash-chained audit trail of all agent runs + droplet writes)
python3 ~/.claude/scripts/4x_synthesize_master_coc.py --session-id "$CLAUDE_SESSION_ID"

# Trigger memory promotion (pollen → NECTAR, findings → vault documents)
python3 ~/.claude/skills/handoff/BODY.md
```

**What this does:**
- Syncs all agent outputs to $CT_VAULT/00-SHARED/ONBOARDING/ daily folder
- Logs droplet writes + agent-run-ids to forensics/coc.jsonl (append-only hash chain)
- Promotes W3 background results as they complete (async safe via task-completion handler)
- Triggers /handoff skill to promote pollen observations to NECTAR

**Timing:** Step 7 runs automatically via session_stop_hook (before CLI exits) or manually via `/handoff` command.

---

## Intent-driven piston launch (advanced: `/faerie --unblock`, `/faerie focus on X`)

Parse intent from `/faerie` args, call `queue_analyzer.py`, assign wave targets, spawn waves.

```python
import sys, json, subprocess
from pathlib import Path

SCRIPTS_DIR = Path.home() / ".claude" / "scripts"
QUEUE_FILE = Path.home() / ".claude" / "hooks" / "state" / "sprint-queue.json"

# Intent flag parsing — --unblock, --deep, --momentum (default: balanced)
INTENT_FLAGS = {"--unblock": "unblock", "--deep": "deep", "--momentum": "momentum"}
intent = next((v for k, v in INTENT_FLAGS.items() if k in sys.argv), "balanced")

# Invoke queue_analyzer.py — returns JSON with wave_target on each task
analyzer_output = subprocess.check_output(
    ["python3", str(SCRIPTS_DIR / "queue_analyzer.py"),
     "--queue-file", str(QUEUE_FILE),
     "--intent", intent,
     "--output-json"],
    text=True
)
analysis = json.loads(analyzer_output)
# analysis["tasks"]: list of task dicts with wave_target field assigned
# analysis["stats"]: {intent, total_queued, wave_counts: {W1, W2, W3, background}}

# Print dashboard to stderr (integrated into Step 5 QUEUE line)
dashboard_txt = subprocess.check_output(
    ["python3", str(SCRIPTS_DIR / "queue_analyzer.py"),
     "--queue-file", str(QUEUE_FILE),
     "--intent", intent,
     "--print-dashboard"],
    text=True
)

# Category → agent type routing
CATEGORY_AGENT_MAP = {
    "investigation": "research-analyst",
    "infrastructure": "python-pro",
    "meta": "context-manager",
    "meta-dev": "python-pro",
    "review": "code-reviewer",
    "publishing": "documentation-engineer",
    "training": "membot",
    "analysis": "data-scientist",
    "forensic": "evidence-analyst",
    "vault": "memory-keeper",
    "admin": "membot",
}

# Free model agent map — category -> free agent slug (used when task qualifies via _check_free_model_eligible)
FREE_AGENT_MAP = {
    "training": "llama-fast",
    "admin": "llama-fast",
    "meta": "llama-fast",
    "review": "qwen-coder",
    "publishing": "mistral-bulk",
    "analysis": "mistral-bulk",
    "infrastructure": "llama-fast",
    "vault": "mistral-bulk",
}

def _pick_agent(task):
    """Return (agent_slug, spawn_method) for a task.

    spawn_method values:
      "bash"       — spawn via Bash: python3 ~/.claude/scripts/openrouter_agent.py --tier free
      "agent_tool" — spawn via Agent tool as normal

    Free model eligibility is checked first (imported from faerie_turn1).
    Falls back to standard CATEGORY_AGENT_MAP if not eligible.
    """
    # Import eligibility check from faerie_turn1 (available in hooks/state/)
    try:
        import sys as _sys
        _sys.path.insert(0, str(Path.home() / ".claude" / "hooks" / "state"))
        from faerie_turn1 import _check_free_model_eligible
        free_eligible = _check_free_model_eligible(task)
    except Exception:
        free_eligible = False

    if free_eligible:
        category = task.get("category", "")
        slug = FREE_AGENT_MAP.get(category, "llama-fast")
        return (slug, "bash")

    # Standard agent tool routing
    # mth00091: never default to bare general-purpose / generalPurpose.
    # Unknown categories route to stigmergy-scout (prompt-injection convention).
    category = task.get("category", "misc") if isinstance(task, dict) else task
    agent_type = CATEGORY_AGENT_MAP.get(category, "stigmergy-scout")
    if agent_type in ("generalPurpose", "general-purpose"):
        agent_type = "stigmergy-scout"
    return (agent_type, "agent_tool")

tasks = analysis["tasks"]
w1_tasks = [t for t in tasks if t.get("wave_target") == "W1"]
w2_tasks = [t for t in tasks if t.get("wave_target") == "W2"]
w3_tasks = [t for t in tasks if t.get("wave_target") == "W3"]
bg_tasks  = [t for t in tasks if t.get("wave_target") == "background"
             and t.get("status") == "queued"]

# W1: inline sync — faerie waits (see Step 2 for prompt spec)
# _pick_agent now returns (slug, spawn_method). Handle both paths:
#   spawn_method == "bash"       -> Bash: openrouter_agent.py --tier free
#   spawn_method == "agent_tool" -> Agent tool as normal
if w1_tasks:
    slug, method = _pick_agent(w1_tasks[0])
    if method == "bash":
        # Free model path — Bash spawn via OpenRouter
        for t in w1_tasks:
            manifest = f"~/.claude/hooks/state/wave1-{slug}-{t['id']}-result.json"
            spawn_bash_free(slug, t, manifest_path=manifest)
    else:
        spawn_inline(slug, w1_tasks, chaining=True)

# W2: inline sync — faerie waits after W1 returns (see Step 3)
if w2_tasks:
    slug, method = _pick_agent(w2_tasks[0])
    if method == "bash":
        for t in w2_tasks:
            manifest = f"~/.claude/hooks/state/wave2-{slug}-{t['id']}-result.json"
            spawn_bash_free(slug, t, manifest_path=manifest)
    else:
        spawn_inline(slug, w2_tasks, chaining=True)

# W3: background — fired after dashboard response (see Step 4)
if w3_tasks:
    slug, method = _pick_agent(w3_tasks[0])
    if method == "bash":
        for t in w3_tasks:
            manifest = f"~/.claude/hooks/state/wave3-{slug}-{t['id']}-result.json"
            spawn_bash_free(slug, t, manifest_path=manifest)
    else:
        spawn_background(slug, w3_tasks, chaining=True)

# Fire-and-forget background tasks — skip already running/completed
for task in bg_tasks:
    slug, method = _pick_agent(task)
    if method == "bash":
        manifest = f"~/.claude/hooks/state/bg-{slug}-{task['id']}-result.json"
        spawn_bash_free(slug, task, manifest_path=manifest)
    else:
        spawn_background(slug, [task], chaining=False)

# Helper: free model spawn via Bash
def spawn_bash_free(slug, task, manifest_path):
    """Spawn a free-tier model via openrouter_agent.py (Bash path).

    Bash command:
      python3 ~/.claude/scripts/openrouter_agent.py \
        --tier free \
        --agent {slug} \
        --task "{task.goal_one_line}" \
        --task-id {task.id} \
        --output-path {manifest_path}
    """
    import subprocess
    goal = task.get("goal_one_line", "")
    task_id = task.get("id", "unknown")
    cmd = [
        "python3", str(Path.home() / ".claude" / "scripts" / "openrouter_agent.py"),
        "--tier", "free",
        "--agent", slug,
        "--task", goal,
        "--task-id", task_id,
        "--output-path", manifest_path,
    ]
    # Non-blocking fire: result checked at manifest_path after return
    subprocess.Popen(cmd)
```

**Intent → wave assignment (enforced by queue_analyzer.py):**

| Intent | W1 | W2 | W3 |
|---|---|---|---|
| `--unblock` | blocker=true tasks | blocks>2 tasks | score>0.2 |
| `--momentum` | complexity=easy | complexity=medium | rest |
| `--deep` | complex, dep-free | score>0.5 | synthesis |
| default | HIGH blockers | score>0.5 mix | everything else |

W1 cap: 2 tasks. W2 cap: 2 tasks. Overflow spills down: W1→W2→W3→bg.

---

## Ongoing Session Rule

After Turn 0, every user message -> spawn first, respond second.
Main = switchboard. Subagents = workers. Never do substantive work inline.
If message is pure conversation: respond directly. Everything else: spawn.
Rule of thumb: response would take >3 reasoning sentences -> subagent.

---

## Intent Parsing (every user message)

`detect_focus.py` runs automatically via `UserPromptSubmit` hook -- faerie NEVER asks the
user to type `/focus`. Focus is detected from natural language silently.

**Read focus before spawning W1/W2:**
```bash
cat ~/.claude/hooks/state/session-focus.json 2>/dev/null
```
If `{"active": true, "focus": "equilibrium"}`: pass `--focus equilibrium` to
`queue_analyzer.py` so it surfaces matching tasks first.

**Dashboard line when focus active:**
```
FOCUS: 'equilibrium' (auto-detected) | 3 matching tasks queued
```

**Auto-clear conditions:**
- All tasks matching focus topic are claimed/done
- User says "clear focus" / "back to normal" / "all tasks" (hook handles it)
- Bare `/faerie` with no args resets focus (treated as new unfiltered session)

**Confidence thresholds:**
- >= 0.85: apply silently, note in dashboard
- 0.70-0.84: apply, but note in dashboard as "possible focus"
- < 0.70: do not apply (no false positives on normal conversation)

**`/focus` command = explicit override only** (still works, sets the same file).

---

## Atomized Brief Architecture

Briefs are atomized checkpoints, not a single file:
- handoff-snapshot.json -- mechanical roundup (written by script, <2s)
- Session brief atoms -- written by briefgen.py at pipeline boundaries
  (00-SHARED/Session-Briefs/atoms/ as JSON, rendered via Blueprints)
- faerie-brief.json -- lightweight cold-start pointer (never sole source)

/faerie reads LATEST snapshot first, assembles from atoms only if needed.
No single file is the source of truth -- the collection of atoms IS the truth.

---

## Auto-Queue Rules

When any finding strengthens/challenges a hypothesis: auto-queue follow-up task.
Set --next-on-success and --next-on-failure when continuation is known.
Cross-project items: queue with --source faerie:cross-project.

---

## Context Bundles

Every queued task MUST have context_bundle:
  {"highest_value": "...", "done_looks_like": "...", "source_files": [...]}

faerie_turn1.py auto-patches missing bundles on every /faerie launch.

---

## Memory Delegation

Spawn membot for mechanical memory work -- never inline.
At session end: membot promotes scratch -> NECTAR, writes brief atoms.
faerie_turn1.py queues recovery task automatically if brief is stale.

---

## Post-Compact Piston Restart

Auto-compact = flywheel stutter, NOT cold start. Compact summary IS context.
1. Read ~/.claude/hooks/state/piston-checkpoint.json
2. Check which wave completed last (wave_num field)
3. Launch the next wave immediately (no re-reading summarized files)

SEAMLESS RULE: Never say "resuming after compaction." Just do the next thing.

---

## System Separation

| System | Script | When it runs |
|---|---|---|
| Context phases | context_phase.py | Continuous (statusline) |
| Surfacing | 7x_surfacing_scheduler.py | /faerie launch + calibrate on Stop |
| Metrics | 9x_session_metrics.py | Stop hook (hash-chained KPIs) |

Closed loop: metrics -> surfacing-calibration.json -> better surfacing next session.
Statusline: ctx:42%^ ORB r:3 d:2 (phase, rounds left, agents in flight)

---

## References

- Snapshot: ~/.claude/hooks/state/handoff-snapshot.json
- Brief: ~/.claude/hooks/state/faerie-brief.json
- Queue: ~/.claude/hooks/state/sprint-queue.json via queue_ops.py
- W1 manifests: ~/.claude/hooks/state/wave1-*-result.json
- W2 manifests: ~/.claude/hooks/state/wave2-*-result.json
- Checkpoint: ~/.claude/hooks/state/piston-checkpoint.json
- Agents: ~/.claude/hooks/state/subagent-options.json
- Scripts: ~/.claude/scripts/piston.py, 7x_emergency_handoff.py, memory_router.py
- Phase: ~/.claude/hooks/state/context-phase.json
- Surfacing: ~/.claude/scripts/7x_surfacing_scheduler.py
- Metrics: ~/.claude/scripts/9x_session_metrics.py
- Calibration: ~/.claude/hooks/state/surfacing-calibration.json
