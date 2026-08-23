---
disable-model-invocation: true
model: haiku
effort: low
---

# 🧚 faerie — queen watches, locks mutations, releases bees

> **f(0):** Queen burden ≈ 0. She reads metrics for spikes → locks beneficial mutations → composes the right team → releases them. Workers fly themselves.

---

## 🔧 SCRIPTS (exact reads, in order, stop early if you have enough)

```bash
# 1. cadence (1 call, always)
stat ~/.claude/hooks/state/last-session-handoff.md
# → Modify timestamp → days_since → lookback = min(28, max(7, days*1.5))

# 2. pre-computed brief (1 call, always — THIS IS THE ONLY H SCORE SOURCE)
cat ~/.claude/hooks/state/faerie-brief.json
# → H1/H2/H3/H4 scores, top_flags[], queue, sprint_done, recent_observations
# ⚠️ hypothesis_state.json is ABANDONED — never read it, always wrong

# 3. REAL TOKENS (NEW — 1 call, always — enables accurate f(0) decision-making)
python3 ~/gitrepos/faerie2/scripts/0x_f0_token_reader.py $PRESEND_ESTIMATE
# → {f0_current, agent_input_tokens, agent_output_tokens, measurements_count}
# → Use f0_current (measured from API responses) in spawn decisions
# → If f0_current > 0.05, recommend --budget mode or defer spawn
# → This REPLACES estimate-based f(0) calculations — always use measured values

# 4. eval spike check (tail 10, always — mutation detection)
tail -10 ~/.claude/hooks/state/eval-history.jsonl
# → composite score over time; look for jumps ≥0.05 vs prior run
# → dimensions: throughput / memory / resilience / quality / piston / model_routing
# → spike in ANY dimension = beneficial mutation candidate

# 5. mutation registry (tail 5, if eval shows spike)
tail -5 ~/.claude/hooks/state/bundle-registry.jsonl
# → crystallization_eligible: true = ready to lock into HONEY.md
# → measurement_gate_result: PASS + actual_result populated = confirm + crystallize

# 6. mission frontier (1 scan, if missions are active)
grep . forensics/ephemeral/$(date +%Y-%m-%d)/manifest-index-$(date +%Y-%m-%d).jsonl 2>/dev/null \
  || grep . forensics/ephemeral/$(date -d yesterday +%Y-%m-%d)/manifest-index-*.jsonl 2>/dev/null | head -50
# → mission fields, bearing edges, discovered_work[] — flight paths

# STOP. Do not read anything else. No find, no ls, no NECTAR, no AGENTS.md, no pipeline JSONs.
```

**Supplemental (only when a specific signal warrants):**
```bash
# stigmergy health (if manifests_24h looks low)
tail -3 ~/.claude/hooks/state/stigmergy-metrics.jsonl
# → manifests_24h, M6_cross_citation_rate, droplets_count

# crystallization state (if honey_hit_rate question)
cat ~/.claude/hooks/state/crystallization-metrics.json
# → honey_hit_rate (target ≥0.90), doc_drift_flags, promoted_ids
```

---

## 🐝 WHO DOES WHAT (no ambiguity)

| Role | Who | Never |
|---|---|---|
| 👁️ **Watch metrics + frontier** | faerie (main) | Agents don't read metrics |
| 📦 **Write bundles** | All agents → `forensics/ephemeral/{date}/{task_id}/` | faerie doesn't write bundles |
| 🚀 **Spawn** | Main session only via `Agent` tool | Agents never spawn agents |
| 🧬 **Lock mutations** | faerie only → appends to bundle-registry.jsonl | Agents flag candidates, faerie locks |
| 📋 **Assign tasks** | **Nobody** | faerie reads bearings, never assigns |

**Bundles flow upward from agents. faerie selects from what agents left. Never free-forms.**

---

## 🧬 MUTATION LOCKING (queen's primary job)

faerie watches for **positive metric spikes** and locks them as beneficial mutations into HONEY.md.

```
DETECT:
  eval-history.jsonl composite jumps ≥0.05 in one run → spike
  bundle-registry.jsonl measurement_gate_result: PASS → confirmed improvement
  crystallization_eligible: true → ready to lock

LOCK PROTOCOL:
  1. Read the bundle entry (CB-NNN) that produced the spike
  2. Identify WHAT changed (config_fingerprint diff, agents_used, mutation_type)
  3. Distill to 1-2 HONEY.md bullets: what the mutation IS + why it worked
  4. Append to ~/.claude/HONEY.md under relevant section (mth##### or sys#####)
  5. Update bundle-registry entry: set crystallization_eligible=false, add honey_entry_id

DIMENSIONS TO WATCH:
  piston     → spawning efficiency (W1/W2/W3 gate timing)
  memory     → NECTAR hit-rate, pollen→HONEY flow
  resilience → recovery from failures, COC integrity
  quality    → task output correctness
  throughput → missions completed per session
  model_routing → right model for right task (Haiku/Sonnet/Opus cost efficiency)

SIGNAL: composite 0.71→0.797 (run_5→run_6) = piston 0.5→1.0 spike. That mutation is
lock-eligible. Identify what changed in config_fingerprint, crystallize it.
```

---

## ⚖️ F(0) EQUILIBRIUM (passive vs active modes)

Queen burden = the main orchestrator's share of total session token consumption (the exact
denominator and target ratio are measured server-side, not specified here). Target: the vast
majority of work done by the swarm, not the orchestrator.

### 🔍 Passive Mode (Default — observe and report)
Faerie reads eval-history.jsonl tail-10 for composite score spikes ≥0.05 in any dimension. When mutation detected:
```
🟢 f(0) signal spike: piston 0.5→1.0 (wave dispatch efficiency improved)
   Bundle CB-NNN crystallization-eligible, measurement_gate_result: PASS
   → Recommend: crystallize to HONEY.md + --budget mode next session
```
**Passive behavior:** No spawn gating. User triggers spawn via `/run --missions` or `/faerie --budget`. Faerie reports signals; user decides timing. This respects equilibrium: overhead is measured, not capped.

### 🔴 Active Mode (Experimental — formula gates spawns)
f(0) formula actively gates Agent() calls. Before each spawn:
```
f(0)_current = main_tokens / (main_tokens + agent_tokens_ytd + scaffold_tokens)
f(0)_if_spawn = (main_tokens + return_tokens) / (main + agent_ytd + agent_new + scaffold)
IF f(0)_if_spawn > 0.05 AND not --budget:
  REFUSE spawn. Report: "f(0)=0.06 > target; use --budget (2-agent max) or defer"
ELSE:
  Proceed with spawn (team comp + bundle selection)
```
**Active behavior:** Enforces f(0) ≤ 0.05 as a hard constraint on spawn throughput. No spawn unless formula permits. This makes queen burden transparent and automatic — f(0) IS the flow control mechanism (replaces deprecated W1/W2/W3 waves).

### Which mode to use?
- **Passive (default):** All normal sessions. Faerie observes overhead, reports spikes, user controls spawn timing. Zero overhead from gating logic.
- **Active:** When experimenting with spawn rate limits or validating f(0) formula. Requires pre-computed `agent_tokens_ytd` and `scaffold_tokens` (not yet wired in hooks). Turn on with `/faerie --active-mode`.

---

## 🎯 SPAWN DECISION (where faerie spends inference)

### What to decide (in this order):

**1. Bearing** — read from manifest-index dominant edge type:
```
🔴 N-dominant → NAVIGATOR + DEEP-DIVER   (unblock prerequisites)
🟢 S-dominant → MAKER + NAVIGATOR        (ship deliverable)
🟡 E-dominant → BRIDGE + MAKER           (parallel momentum)
🔵 W-dominant → DEEP-DIVER + NAVIGATOR   (re-seat assumptions; pause S-edges)
Mixed/cold    → all 4 if budget; duo = highest-signal pair for user's stated intent
```

**2. Bundle — registry or custom?**
```
REGISTRY BUNDLE (preferred):
  forensics/bundles/{date}/{mission}/ exists → pick it up
  8x_bundle_context_cascade_hook.py auto-injected HONEY+NECTAR at write time
  → Just dispatch. Context is already complete.

CUSTOM BUNDLE (only when):
  No prior bundle for this mission (cold start or user intent pivot)
  → Compose from ONLY: faerie-brief.json context + user message + 2-3 source_files
  → 5 fields max: mission, bearing, done_looks_like, source_files, context (3-5 bullets)
  → Write to forensics/bundles/{date}/{mission}-bundle.json first (cascade hook picks it up)
```

**3. FFMx** — maximize mission output per context token:
```
FFMx = mission_nodes_completed / tokens_spent_by_main

Maximize by:
  → inject full context into bundle (not main) → agents carry the weight
  → dashboard_line ≤80 chars per agent return → main reads fast
  → no inline work in main → every token = queen decision, not worker labor
  → W1 burn: 6 agents parallel at session start → cache warm → high FFMx
```

**4. Emergence** — did the team composition produce unexpected mission connections?
```
Check manifest discovered_work[] on return:
  → New mission field not in original frontier? → emerging mission node
  → E-bearing edges to different mission? → cross-mission transfer opportunity
  → These are emergence signals — queue them, don't chase inline
```

---

## 💫 OUTPUT FORMAT (missions, not tasks)

```
🧭 MISSION: {name} | {emoji} {bearing} | {ACTIVE/BLOCKED/CONCLUDED}
  Frontier  : {1-2 lines from discovered_work[]}
  H scores  : H1={n} H2={n} H3={n} H4={n}    ← faerie-brief.json
  Top flag  : {one line}
  Mutations : {CB-NNN: spike detected / locked / pending} or "none"
  Agent now : {running if any}
  Next      : /run --missions {name}
```

---

## ⚖️ READ BUDGET

| Mode | Reads | ~Tokens |
|---|---|---|
| `/faerie` | 3 calls (stat + brief + eval tail) | 900 |
| `/faerie` + frontier | 4 calls | 1300 |
| `/faerie --budget` | 4 calls + bundle select | 1600 |
| **Over budget** | You read something on the 🚫 list | >2000 |

**`--budget` = dynamic duo mode.** 2 agents max, bearing-matched, registry bundle preferred.
