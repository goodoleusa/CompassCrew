---
model: sonnet
effort: high
---

**/faerie** = one command for "where we were, what we did, and get ready to run a session." Run immediately; then work with the user to fill the session template and either add to the queue or produce the prompt for /new.

## Verbose Step Reporting (REQUIRED — user is watching to finetune)

At each step, print a status line BEFORE doing the step and a result line AFTER:

```
[faerie] Step 1/4 — Running roundup + learn...
  → Reading: ~/.claude/memory/REVIEW-INBOX.md (N items), KNOWLEDGE-BASE.md (N items), scratch-*.md (N files)
  → Running continual-learning on /mnt/d/0LOCAL/gitrepos/cybertemplate...
  ✓ Roundup written: ~/.claude/hooks/state/cybertemplate-context-1.md
  ✓ Continual-learning: N bullets merged into AGENTS.md (N new)

[faerie] Step 2/4 — Briefing context...
  → Top areas: [area1, area2, area3]
  → Outstanding: N items in REVIEW-INBOX, N [SPRINT] items
  ✓ Brief complete

[faerie] Step 3/4 — Filling session template...
  → Template: SESSION_INPUT_TEMPLATE.md (or _OSINT if investigation)
  → Pulling from: roundup, run-benchmarks.json (last KPIs), ARCHITECTURE.md
  → Need from user: [what's still missing]
  ✓ Template written: ~/.claude/hooks/state/sprint-queue/sprint-YYYYMMDD-NNN.md

[faerie] Step 4/4 — Queue or hand off...
  → Mode: [add to queue / hand off to /new]
  ✓ Queue entry added — run /new with no args to pick this up
```

This reporting is for calibration and transparency. Do not suppress steps or summarize only at the end.

## Explain Mode (--explain)

When `--explain` is passed, faerie narrates what each subsystem does as it runs.
This is for users learning the system — NOT default behavior.

Status messages in explain mode:
```
[faerie --explain] MEMORY SYSTEM
  → Checking ~/.claude/memory/REVIEW-INBOX.md for unprocessed items...
  → REVIEW-INBOX is the human-review queue. HIGH flags auto-promote here.
  → Checking KNOWLEDGE-BASE.md for validated facts...
  → KNOWLEDGE-BASE holds ground truth that all agents share.
  → Reading scratch-*.md files from this project...
  → Scratch files are per-session working notes. Agents write <!-- MEM --> blocks here.
  → Memory-keeper (membot) promotes important items from scratch → REVIEW-INBOX → KNOWLEDGE-BASE.

[faerie --explain] TRAINING QUEUE
  → Reading training-queue.json...
  → Training queue holds agents that need improvement. /autotune consumes these.
  → N agents queued for training: [list agent names]
  → vs WORK queue (sprint-queue.json) which holds investigation/code tasks.
  → /run consumes work queue. /autotune consumes training queue.

[faerie --explain] WORK QUEUE
  → Reading sprint-queue.json...
  → N tasks queued, N completed, N in-progress
  → /run claims and executes the next queued task with full context bundle.

[faerie --explain] CONTEXT ROUNDUP
  → Building context from: AGENTS.md, KNOWLEDGE-BASE, REVIEW-INBOX, last handoff, queue state
  → This becomes the "champagne pyramid" — context flows down to each agent's cup.
  → Roundup written to: [path]

[faerie --explain] CONTINUAL LEARNING
  → Extracting durable facts from session memory into AGENTS.md...
  → Only facts that will be true in 3 months get promoted. Ephemeral state stays in scratch.
  → N new bullets added to AGENTS.md
```

Without `--explain`, faerie runs silently with just the step progress lines it already has.

## What to do

### 0. Multi-session live bridge (do first — ~5 seconds, gives you live intel)

Faerie can't reach *into* a running session directly, but she can read everything those sessions write in near-real-time. Run all four probes in parallel:

```bash
# 1. agent_state.json — updated every turn by presend hook (near-live)
python3 - << 'PYEOF'
import json, time
from pathlib import Path
state_file = Path("/mnt/d/0LOCAL/.claude/hooks/agent_state.json")
try:
    d = json.loads(state_file.read_text())
    main = d.get("main_session", {})
    active = d.get("active_agents", [])
    age_s = time.time() - state_file.stat().st_mtime
    print(f"agent_state.json (age: {age_s:.0f}s ago):")
    print(f"  session: {main.get('session_id','?')[:12]}  turn: {main.get('turn_count','?')}  ctx: {main.get('estimated_ctx_k','?')}K  model: {main.get('model','?')}")
    if active:
        for a in active:
            print(f"  AGENT RUNNING: {a.get('type','?')} started {a.get('started_at','?')[:16]}")
    else:
        print("  No active agents in that session")
except Exception as e:
    print(f"  not found or unreadable: {e}")
PYEOF

# 2. Sprint queue — claimed tasks = other sessions' live work
python3 ~/.claude/hooks/state/queue_ops.py list 2>/dev/null

# 3. Recent scratch files — agents write these mid-session (live discoveries)
ls -t /mnt/d/0LOCAL/gitrepos/cybertemplate/.claude/memory/scratch-*.md 2>/dev/null | head -5 | while read f; do
  echo "=== $f ($(date -r "$f" +%H:%M:%S)) ==="
  tail -20 "$f"
done

# 4. Last session handoff — most recent clean summary
head -30 /mnt/c/Users/amand/.claude/hooks/state/last-session-handoff.md 2>/dev/null
```

**Report format:**
```
LIVE BRIDGE REPORT
──────────────────────────────────────────
Other sessions : [N active / none] — [agent types if active]
Their progress : turn [N], ctx [N]K, [N]s since last turn
Claimed tasks  : [task IDs being worked, goals]
Live discoveries: [top 2-3 lines from scratch files, if recent < 30min]
Last handoff   : [sprint from handoff, ended at timestamp]
Task lineage   : [show spawned_by chains if any — e.g. "task-X → task-Y → task-Z (queued)"]
──────────────────────────────────────────
```

This is faerie's "live eye" — she reads the shared file system that all sessions write to. Near-real-time (updated every turn via presend hook). Tell the user what the other session is working on so they don't duplicate or conflict.

**Task lineage:** Read `spawned_by` fields from sprint-queue.json to show dependency chains:
```python
for t in sorted_tasks:
    chain = [t["id"]]
    cur = t
    while cur.get("spawned_by"):
        chain.insert(0, cur["spawned_by"])
        cur = next((x for x in all_tasks if x["id"] == cur["spawned_by"]), {})
    if len(chain) > 1:
        print(" → ".join(chain) + f" ({t['status']})")
```

**Cross-thread connection detection (PROACTIVE):** After reading scratch files and REVIEW-INBOX, look for `cat=CONNECTION` entries or any observations that reference a different project/repo than the current one. If found:
1. Surface it gently — one line in the brief: `✨ Connection: [short description of the link between X and Y]`
2. Do NOT nag or repeat — mention once, let it sit
3. If actionable (needs a task): auto-add it to the work queue with `--next-on-success` and `--next-on-failure` set

Format of the connection hint (casual, not alarmist):
```
✨ faerie noticed: [Project A]'s [finding X] may connect to [Project B]'s [finding Y] — worth a look when you have a moment.
```

**Cross-project queuing rule:** When faerie encounters something during roundup that is:
- Important but NOT relevant to the current session's project
- From a different repo, different thread, or a different investigation track

...faerie MUST queue it rather than mention it inline and forget it. Use:
```bash
python3 ~/.claude/hooks/state/queue_ops.py add \
  --goal "[brief goal: what to investigate or do]" \
  --priority MED \
  --source "faerie:cross-project" \
  --project "[target project]" \
  --next-on-success "[what to do if this confirms the connection]" \
  --next-on-failure "[what to try if this doesn't pan out]"
```
Then tell the user: `📥 Queued cross-project item: [goal] (task-XXXX)` — one line, no explanation needed unless asked.

### 1. Run roundup + learn (continual-learning is automatic here — no separate step)

Run the context-roundup script **with --learn**. The `--learn` flag calls the continual-learning
script internally, extracting durable facts from scratchpads + REVIEW-INBOX + launch/ into AGENTS.md.
**Do NOT run `/continual-learning` separately — it is folded into this step.**

**WSL / Bash:**
```bash
python3 "/mnt/c/Users/amand/.claude/skills/context-roundup/run.py" --learn
```
If the workspace is a repo, add `--repo-root`:
```bash
python3 "/mnt/c/Users/amand/.claude/skills/context-roundup/run.py" \
  --repo-root /mnt/d/0LOCAL/gitrepos/cybertemplate --learn
```

**PowerShell (Windows fallback):**
```powershell
python "C:\Users\amand\.claude\skills\context-roundup\run.py" --repo-root "D:\0LOCAL\gitrepos\cybertemplate" --learn
```

Report: roundup file(s) written + N bullets merged into AGENTS.md (this IS the continual-learning step).

**If context-roundup --learn fails or the skill is unavailable,** run continual-learning directly
(these steps are embedded here so faerie works even if the `/continual-learning` skill is deleted):

```bash
# Continual learning — extract durable facts from session memory into AGENTS.md
python3 "/mnt/c/Users/amand/.claude/skills/continual-learning/run.py" \
  --repo-root /mnt/d/0LOCAL/gitrepos/cybertemplate
```

If the script is also unavailable, do it manually:
1. Read `~/.claude/memory/REVIEW-INBOX.md` and `~/.claude/memory/KNOWLEDGE-BASE.md`
2. Read `.claude/memory/scratch-*.md` in the current project
3. Extract bullets that represent **durable preferences or facts** (not one-off tasks or temp state)
4. **COMPRESSION PASS FIRST** — before adding anything, check `~/.claude/AGENTS.md` line count:
   - If >150 lines: compress existing content first (merge duplicate bullets, drop stale one-time facts, remove project-specific data that belongs in project `.claude/AGENTS.md`)
   - Hard cap: **200 lines max** — never exceed this
5. Add new bullets under the correct section:
   - Preferences (how user wants Claude to behave) → "## Learned User Preferences"
   - Facts (workspace, tech stack, investigation state) → "## Learned Workspace Facts"
6. Format: `- {one-line durable fact}` (no date prefix — facts don't expire, they compress)
7. Deduplicate — if a fact updates an existing bullet, replace it, don't append

**What belongs in global AGENTS.md:** universal preferences, machine environment, agent spawning rules, collaboration values, project list (with one-line description + WSL path)
**What does NOT belong:** investigation IPs/personnel/evidence (→ project `.claude/AGENTS.md`), one-time team compositions, completed task checklists, any fact that is only true for one project

**Signs a bullet is durable:** it will be true in 3 months. "User prefers concise responses" = durable.
"User is working on nav propagation" = ephemeral, skip. "IPs in Packetware Prisma DB" = project-specific, goes in cybertemplate's `.claude/AGENTS.md`, not global.

This embedded logic is the canonical behavior. The `/continual-learning` skill and `run.py` script are
convenience wrappers for the same extraction — not the source of truth.

### 1b. Performance + training brief (automatic — always runs)

Read both queues and the training log to build a combined status:

```bash
# Work queue status
python3 ~/.claude/hooks/state/queue_ops.py list 2>/dev/null

# Training queue status
cat ~/.claude/hooks/state/training-queue.json 2>/dev/null | python3 -c "
import json,sys
d=json.load(sys.stdin)
tasks=d.get('training_tasks',[])
queued=[t for t in tasks if t.get('status')=='queued']
print(f'Training queue: {len(queued)} agents need training')
for t in queued[:5]:
    print(f'  {t[\"agent\"]:25s} {t[\"priority\"]:4s}  {t[\"benchmark\"]}  ({t[\"current_score\"]}→{t[\"target_score\"]})')
"

# Recent training results
tail -5 ~/.claude/hooks/state/training-log.jsonl 2>/dev/null
```

**Report format:**
```
PERFORMANCE + TRAINING BRIEF
──────────────────────────────────────────
WORK QUEUE:
  Queued  : N tasks (HIGH: N, MED: N, LOW: N)
  Active  : [task IDs being worked]
  Done    : N completed this cycle

TRAINING QUEUE:
  Agents needing training: N
  → evidence-curator    HIGH  tier1_accuracy  (0.75→0.90)
  → data-scientist      HIGH  statistical_rigor (0.82→0.92)
  Redeemed on-the-job:  N (agents that improved during real work)

LAST RUN:
  Sprint : [run_name] | Score : [score] (prev: [prev]) [↑/↓/→]
  Key KPIs: [brief delta summary]
──────────────────────────────────────────
```

If training queue has HIGH priority items, mention: "HIGH-priority training available — run `/autotune` to train [agent-name]."

### 2. Brief and fill the session template

- **Brief** the user at a high level: what was rounded up (sources, counts), hottest areas (memory, launch, worktrees), top-priority tasks or projects from the roundup.
- **Cross-thread connections (gentle, one-time):** If any `cat=CONNECTION` entries were found in scratch files or REVIEW-INBOX, surface the most interesting one with `✨ faerie noticed: [one line]`. Do not list all of them — pick the most surprising. Never repeat across turns.
- **Fill the session input template** using the roundup (and launch/, memory, ARCHITECTURE.md, run-benchmarks.json). Use **SESSION_INPUT_TEMPLATE.md** or **SESSION_INPUT_TEMPLATE_OSINT.md** if the user passed `--osint` or context is investigation/OSINT.
- **Ask the user** any questions needed to complete the template: goal (one line), "done looks like", task type, priority (HIGH/MED/LOW), optional constraints. Pull from the roundup and REVIEW-INBOX where possible; only ask what’s missing.
- Populate: STABLE CONTEXT from roundup paths; GOAL and Done from user or roundup; PREVIOUS RUN from run-benchmarks.json for the task type; TEAM from subagent-options.json or default (workflow-orchestrator lead, memory-keeper support); SPAWN INSTRUCTIONS and SUCCESS CRITERIA from template.

**Significant-finding auto-queue rule (MANDATORY for agents too):** When any agent or faerie encounters a finding that meaningfully strengthens or challenges a hypothesis (new IP, new entity, new infrastructure link, new statistical signal), it MUST immediately queue a follow-up task — not just mention it in the summary. Use all fields:

```bash
python3 ~/.claude/hooks/state/queue_ops.py add \
  --goal "WHOIS + BGP investigation: 45.38.46.0/24 — operator identity" \
  --priority HIGH \
  --project cybertemplate \
  --hypothesis "H2,H4" \
  --seeking "ARIN/RIPE registrant matching Packetware, AS400495 peer, or known Packetware ASN 400495/26863" \
  --why-now "Seen in Shodan Monitor item 28 alongside 23.133.104.0/24 and 63.141.38.0/24 — third monitored Packetware range not in any pipeline data" \
  --next-on-success "Add 45.38.46.0/24 to AGENTS.md infrastructure list; cross-ref all IPs in range against pipeline_ip_crossref.json" \
  --next-on-failure "Search Censys for certs on 45.38.46.x — may surface operator via TLS"
```

**Rules for when to auto-queue (no human confirmation needed):**
- New IP/ASN/domain not in any existing pipeline data → always queue
- A standing open question from AGENTS.md gets partial evidence → always queue
- Hypothesis score changes (e.g. H4 goes from MEDIUM to HIGH-candidate) → queue statistical validation
- Any `cat=CONNECTION` memory entry that links two previously unconnected entities → queue

**Queue format for every task faerie adds (including cross-project ones):** Always set `--next-on-success` and `--next-on-failure` when the logical continuation is known. Example:
```bash
python3 ~/.claude/hooks/state/queue_ops.py add \
  --goal "Run Fisher’s exact test on .gov cert inflection at Jan 14" \
  --priority HIGH \
  --project cybertemplate \
  --next-on-success "Promote .gov cert inflection finding to Tier 1 — write report section" \
  --next-on-failure "Try chi-squared with wider date window (Jan 1–Feb 28) — check if inflection shifts"
```
If next steps aren’t obvious yet, omit them — but set them whenever you can see 1–2 moves ahead.

### 3. Build task context bundle (mandatory — for every task added to queue)

Before writing any task to the queue, build a **TASK CONTEXT BUNDLE** — a rich, task-specific block that every subagent claiming this task will receive verbatim. This is what enables agents to start working immediately without re-reading the whole history.

For each task, construct the bundle by pulling from the roundup:

```
TASK CONTEXT BUNDLE — [task goal, one line]
══════════════════════════════════════════
Goal        : [one-sentence goal]
Project     : [repo/project name]
Last session: [sprint from last-session-handoff.md — what was done, what was left]
Ended       : [session end timestamp]

Key facts (from KNOWLEDGE-BASE, relevant to THIS task):
  • [fact 1 — e.g. "Packetware IPs confirmed: 104.21.x.x, 172.67.x.x"]
  • [fact 2 — e.g. "B2 bucket key needs rotation before manifest write"]
  • [fact 3 — up to 5 facts most relevant to this specific task]

Open flags (from REVIEW-INBOX, relevant to this task):
  • [FLAG entry if relevant, e.g. "foreign .gov cert on SSH server — needs attribution"]
  • (or "none relevant")

Prior run (from run-benchmarks.json for this task_type):
  score=[N] | turns=[N] | agents=[N] | [one-line outcome note]
  (or "no prior run for this task_type")

Queue context (what else is claimed/in-flight):
  [1-2 lines: what other sessions are working on, so this agent doesn't duplicate]

Add follow-up tasks:
  python3 ~/.claude/hooks/state/queue_ops.py add --goal "..." --priority MED --source [agent-type] --project [project]

Write scratchpad before returning:
  File: .claude/memory/scratch-SESSION_ID.md — one <!-- MEM --> block minimum
══════════════════════════════════════════
```

**Sources for each field:**
- `Last session` + `Ended` → `~/.claude/hooks/state/last-session-handoff.md`
- `Key facts` → `~/.claude/memory/KNOWLEDGE-BASE.md` (grep for task keywords)
- `Open flags` → `~/.claude/memory/REVIEW-INBOX.md` (grep for task keywords, show HIGH priority only)
- `Prior run` → `~/.claude/hooks/state/run-benchmarks.json` (look up by task_type)
- `Queue context` → `queue_ops.py list` output (claimed tasks = other sessions' work)

Save the bundle to a file: `~/.claude/hooks/state/sprint-queue/context-{task-id}.md`

### 3b. Populate context_bundle JSON fields (MANDATORY — for every queue entry)

When writing the context bundle to the queue via `queue_ops.py add --context-file`, ensure the bundle file contains ALL of the following fields (used by `/run` as fallback if the .md template file is missing):

- **`highest_value`** — the single most important thing for the claiming agent to do first (one sentence). This is the agent's north star when no .md template exists.
- **`done_looks_like`** — concrete description of what completion looks like (2-4 sentences or bullet points). Used as success criteria by `/run` when reading from JSON fallback.
- **`source_files`** — list of key file paths the agent needs (absolute WSL paths). Used by `/run` to tell agents which files to read first.

These fields make the `.md` template file **optional** (human-readable only) rather than **required** for execution. `/run`'s `claim_task.py` will claim a task successfully if `context_bundle` is present, even when the `.md` file has been compacted, moved, or never written. A task with BOTH `.md` missing AND no `context_bundle` will be permanently skipped.

The bundle file format (saved to `context-{task-id}.md`) should include these fields explicitly:
```
Goal           : [one-sentence goal]
highest_value  : [the first thing the agent must do]
done_looks_like: [what completion looks like — concrete criteria]
source_files   : [/abs/path/file1.py, /abs/path/file2.md, ...]
```

The rest of the bundle (Last session, Key facts, Open flags, Prior run, Queue context) is bonus context that enriches agent prompts but is not required for `/run`'s fallback logic.

### 4. Queue or hand off for /new

- **If the user says "add to queue" or passed `--queue`:** Write the filled template to `~/.claude/hooks/state/sprint-queue/sprint-{YYYYMMDD}-{seq}.md`. Use `queue_ops.py add` with `--context-file` pointing to the context bundle file:
  ```bash
  python3 ~/.claude/hooks/state/queue_ops.py add \
    --goal "task goal one line" \
    --priority HIGH \
    --source faerie \
    --project cybertemplate \
    --context-file ~/.claude/hooks/state/sprint-queue/context-{task-id}.md
  ```
  Tell the user: "Added to queue with context bundle. Run **/new** to pick this up — agents will receive full cross-session context automatically."

- **Otherwise:** Output the **context bundle + filled template** so the user can launch **/new** with it. Write the filled template to `sprint-queue/sprint-{date}-{seq}.md`, then say: "**Paste-ready prompt for /new** is in: [path]. Paste contents when /new asks for the goal." Optionally offer: "Add this to the queue? (say 'yes')".

### 4. Memory delegation + W&B (mandatory — never inline)

**Always spawn `membot` for mechanical memory work — never do it inline in /faerie.**

At session END (when filling template from a completed sprint):
1. Spawn `membot` subagent first — it promotes scratchpads, runs run-eval, **logs sprint to W&B** (Phase 5b), updates project AGENTS.md
2. Read membot's output summary — it includes the W&B run URL
3. Use membot's run-eval and next-steps in the session template you fill for /new

**W&B project:** `wandb.ai/aegis-eternis/cybertemplate-ops` — membot owns the logging call via `~/.claude/scripts/wb_sprint_log.py`. Do NOT log from /faerie directly — membot has the KPIs. If membot is unavailable, run manually:
```bash
/mnt/d/0LOCAL/.local/share/pipx/venvs/wandb/bin/python3 ~/.claude/scripts/wb_sprint_log.py --goal "{sprint goal}" --score 0.9 --beat_last
```

At session START (context roundup only):
- Do NOT spawn membot — just read AGENTS.md + roundup file
- membot runs at END, not start

**Routing rule (enforce this):**
- Humans → `/faerie` (context, templates, session prep, human-readable briefing)
- Agents → `membot` (mechanical promotion, AGENTS.md updates, run-eval, pre-compact snapshot)
- faerie IS the human interface; membot IS the engine

If the user wants to run the session now: "Run **/new** and paste the contents of [path], or run /new with no args to pick from the queue."

## References

- **Templates:** `~/.claude/hooks/state/SESSION_INPUT_TEMPLATE.md`, `SESSION_INPUT_TEMPLATE_OSINT.md`
- **Queue:** `~/.claude/hooks/state/sprint-queue.json`; filled files in `sprint-queue/sprint-*.md`
- **Benchmarks:** `~/.claude/hooks/state/run-benchmarks.json`
- **Subagent options:** `~/.claude/hooks/state/subagent-options.json`

## Summary

**/faerie** = roundup + **learn (continual-learning auto-included)** → brief → fill template → **queue or /new**. No separate `/continual-learning` needed — it’s folded in. At session end, membot handles the final descent (Phase 9 = continual-learning) automatically.
