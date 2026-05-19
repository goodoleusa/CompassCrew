# /eval — Agent Evaluation Command Surface

Unified interface for baselining, running, training, comparing, and repeating agent evaluations.
Delegates all work to `~/.claude/scripts/eval_harness.py` via Bash — no logic is inlined here.

## Forward-Compatibility Note

Every `/eval` subcommand writes a COC v2 manifest to `~/.claude/hooks/state/eval-{subcmd}-{SESSION_ID8}-{AGENT_ID16}.json`.
If `coc_manifest_builder` is importable in eval_harness.py, it is used automatically.
If not, the local `_build_coc_manifest()` helper in eval_harness.py provides an identical schema.
COC v2 required fields: session_id, agent_id, agent_type, spawn_ts, complete_ts,
parent_finding_hash, trace_path, trace_hash, prev_entry_hash, entry_hash.

Every invocation is also appended to `~/.claude/hooks/state/eval-config-history.jsonl`
(append-only, one JSON object per line) so `/eval repeat` can replay the last config.

---

## Subcommands

### 1. baseline

**Usage:** `/eval baseline {agent_type} [--rubric path]`

Establish or refresh an agent's zero-point reference score.
Uses evalbot's 6-dimension rubric (Correctness, Completeness, Clarity, Safety, Efficiency, Velocity).
Writes result to `~/.claude/hooks/state/evals/baseline-{agent_type}-{date}.jsonl` (hash-chained).
Updates `## Last Training` section in `~/.claude/agents/{agent_type}.md` with source=evalbot.
Records invocation in eval-config-history.jsonl.

**Example:**
```
/eval baseline evidence-curator
/eval baseline security-auditor --rubric ~/.claude/rubrics/tier1-rubric.json
```

**Bash delegate:**
```bash
python3 ~/.claude/scripts/eval_harness.py baseline {agent_type} [--rubric path]
```

---

### 2. run

**Usage:** `/eval run {agent_type} --task {task_id} [--synthetic]`

One-shot eval on a given task. Accepts a real pending queue task ID or a synthetic
held-out test (--synthetic generates a rubric-matched test case). Scores all 6 dimensions.
Records delta vs baseline. Updates Last Training in agent card ONLY if new score beats baseline.
Writes result manifest to `~/.claude/hooks/state/eval-run-{SESSION_ID8}-{AGENT_ID16}.json`.

**Example:**
```
/eval run evidence-curator --task train-016
/eval run report-writer --synthetic
```

**Bash delegate:**
```bash
python3 ~/.claude/scripts/eval_harness.py run {agent_type} --task {task_id} [--synthetic]
```

---

### 3. train

**Usage:** `/eval train {agent_type} --on-job [--n {N}]`

Enables MINI_LEARNING mode for the agent's next N real spawns (default N=3).
After those spawns, observations are collected and promoted to durable learnings in the
agent card — but ONLY after a beat-baseline check (source=evalbot or source=self OTJ).
Sets `MINI_LEARNING=true` in the agent's next spawn context via a tagged queue entry.
Progress logged to training-queue.json and training-log.jsonl.

**Example:**
```
/eval train evidence-curator --on-job
/eval train security-auditor --on-job --n 5
```

**Bash delegate:**
```bash
python3 ~/.claude/scripts/eval_harness.py train {agent_type} --on-job [--n N]
```

---

### 4. compare

**Usage (A/B):** `/eval compare --a {run_id_1} --b {run_id_2}`
**Usage (cohort):** `/eval compare --agent {agent_type} --runs last-{N}`

A/B or cohort comparison with stats. Pre-registers hypotheses before reading data (anti-HARKing).
Uses data-scientist rubric: all results reported (null and significant), no cherry-picking.
Reads from eval-history.jsonl to find run records by run_id.
Outputs side-by-side table (all 6 dimensions + composite), delta, confidence label (establishing/emerging/stable).

**Example:**
```
/eval compare --a run_20260418T194321 --b run_20260417T103045
/eval compare --agent evidence-curator --runs last-3
```

**Bash delegate:**
```bash
python3 ~/.claude/scripts/eval_harness.py compare --a {run1} --b {run2}
python3 ~/.claude/scripts/eval_harness.py compare --agent {agent_type} --runs last-{N}
```

---

### 5. repeat

**Usage:** `/eval repeat [--seed {s}]`

Re-runs the most recent /eval config (any subcommand) from eval-config-history.jsonl.
Preserves reproducibility: same agent_type, same subcommand, same flags.
New seed (--seed) for synthetic tasks to avoid identical test replay.
Records the repeat as a new entry in eval-config-history.jsonl (not an overwrite).

**Example:**
```
/eval repeat
/eval repeat --seed 42
```

**Bash delegate:**
```bash
python3 ~/.claude/scripts/eval_harness.py repeat [--seed N]
```

---

## Output Paths

| Subcommand | Primary output |
|------------|----------------|
| baseline   | `~/.claude/hooks/state/evals/baseline-{agent_type}-{date}.jsonl` |
| run        | `~/.claude/hooks/state/eval-run-{SID8}-{AID16}.json` |
| train      | training-queue.json + training-log.jsonl entries |
| compare    | `~/.claude/hooks/state/eval-compare-{SID8}-{AID16}.json` |
| repeat     | Same as the replayed subcommand |
| all        | `~/.claude/hooks/state/eval-config-history.jsonl` (always appended) |

## Scoring Authority

- `source: evalbot` — authoritative. Hash-chained, court-admissible. Used for tier promotion.
- `source: self` — directional only. Not auditable. Used for OTJ redemption tracking.
- Evalbot NEVER reads its own prior scores before scoring (anti-bias rule).
- Tier graduation: sustain >=0.90 x3 consecutive evalbot runs → tier up (see rules/agents.md Section 4).
