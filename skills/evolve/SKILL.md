---
description: "Live fitness monitor — read in-flight metrics, steer agent variants, detect crystallization readiness, emit steering signals. The operational mirror to /crystallize. Runs async during team/team."
argument-hint: "[--watch-interval 30s] [--mutation-family FAMILY] [--steering-only] [--readiness-check]"
model: haiku
effort: low
disable-model-invocation: true
user-invocable: false
---

# /evolve — Live Fitness Monitor & Steering Engine

**TL;DR:** Runs in-flight during team/team, watches live fitness signals (eval-history, manifests, membench), detects mutation winners, emits steering signals to forensics, and flags readiness for crystallization. Mirror to /crystallize (intentional pressure at rest).

**f(0) principle:** Queen watches metrics in real-time → locks beneficial mutations → releases them. Evolve surfaces what's working NOW; crystallize locks it permanently.

---

## 🔧 SCRIPT CHEATSHEET (invoke in order)

```bash
# 1. LIVE FITNESS SNAPSHOT (3 parallel reads — substitute $DATE with today's date)
python3 ~/.claude/scripts/0x_piston_metrics.py --window 2h                              # piston dimension trend
python3 ~/.claude/scripts/3x_eval_mutation.py --tail 50 --format json                   # membench M1-M11 + delta
python3 ~/.claude/scripts/9x_dual_location_manifest_reader.py --in-flight --date $DATE # manifests in-flight

# 2. MUTATION DETECTION (from Phase 1 data)
python3 ~/.claude/scripts/9x_mutation_metrics_gates.py --check --output-json            # current state vs baseline
python3 ~/.claude/scripts/9x_mutation_course_correction.py --emit-steering              # emit steering signals

# 3. BOTTLENECK DETECTION (scanning manifests for N-edge blocks)
grep -E '"bearing":\s*"N"' forensics/ephemeral/$DATE/manifest-index-*.jsonl | wc -l    # count N-edges
grep -E '"discovered_work"' forensics/ephemeral/$DATE/manifest-*.json | head -20       # recent discoveries

# 4. READINESS DETECTION (check if mutation observation window closed + fitness confirmed)
python3 ~/.claude/scripts/5x_vault_mutation_tracker.py --readiness-check --output-json  # track mutation lifecycle

# 5. EMIT ARTIFACTS (write steering signals + readiness queue to forensics)
#    → outputs to: forensics/ephemeral/{$DATE}/steering-signals-{ts}.json
#    → and: forensics/ephemeral/{$DATE}/genotype-fitness-{ts}.json
#    See Phase 3 + 4 below for formats
```

**Running all phases (typical loop):**
```bash
DATE=$(date +%Y-%m-%d)
python3 ~/.claude/scripts/0x_piston_metrics.py --window 2h
python3 ~/.claude/scripts/3x_eval_mutation.py --tail 50 --format json
python3 ~/.claude/scripts/9x_dual_location_manifest_reader.py --in-flight --date $DATE
python3 ~/.claude/scripts/9x_mutation_metrics_gates.py --check --output-json
python3 ~/.claude/scripts/9x_mutation_course_correction.py --emit-steering
python3 ~/.claude/scripts/5x_vault_mutation_tracker.py --readiness-check --output-json
# → all outputs written to forensics/ephemeral/$DATE/
```

---

## What It Does

### Phase 1: LIVE FITNESS SNAPSHOT (in-flight substrate)
Read 3 signals in parallel (same as crystallize Phase 0, but LIVE):

1. **MEMBENCH STREAM** — live eval output from in-flight agents
   - Read `~/.claude/hooks/state/eval-history.jsonl` tail-50 (last 30 min)
   - Extract M1-M11 per run, compute per-dimension trend (slope)
   - Watch for spikes ≥0.05 vs baseline (mutation candidate)

2. **MANIFEST FRONTIER** — discovery + steering signals from last 2 hours
   - Scan `forensics/ephemeral/{date}/manifest-index-{date}.jsonl` (today + yesterday)
   - Filter by `status: "in_flight"` (only agents still running)
   - Extract mission, bearing, discovered_work[], dashboard_line
   - Identify bottleneck patterns (N-edges blocking S-edges)

3. **SPRINGBOARD EFFICACY** — real-time signal health
   - Read most recent `~/.claude/hooks/state/springboard-efficacy.json`
   - Note: context_continuity, task_survival, latency, mission_routing
   - Compare against Phase 0 baseline (do these signals match expected impact?)

### Phase 2: DETECT STEERING OPPORTUNITIES
For each in-flight mission (status == in_flight in manifest-index):

1. **Variant Detection** — is this agent exploring a mutation?
   - Check manifest `mutation_family` field (if present + non-null)
   - Look for sibling agents in same mission (same mutation_family)
   - Compare fitness: which variant is outperforming?

2. **Bottleneck Detection** — are N-edges blocking critical S-edges?
   - Scan `discovered_work[]` from recent manifests
   - Look for pattern: "task X waiting on task Y" (unblocking chain)
   - If Y is in-flight and X is critical-path (leads to deliverable), FLAG for N-priority

3. **Latency Anomalies** — is an agent slow relative to historical baseline?
   - Compare manifest `elapsed_time` vs ETA
   - If elapsed > 1.5 × ETA, flag for steering or cancellation

### Phase 3: EMIT STEERING SIGNALS (mutation coordination)
Write steering records to **forensics artifact location** (COC-tracked, immutable):

```
forensics/ephemeral/{YYYY-MM-DD}/steering-signals-{HHMMSS}.json
```

Format (MANDATORY for downstream crystallize Phase 2.5):
```json
{
  "timestamp": "2026-05-05T12:34:56Z",
  "type": "steering_signal",
  "target_agent_id": "<agent_id_from_manifest>",
  "target_mission": "<mission>",
  "steering_action": "accelerate|pause|pivot|explore_variant|consolidate",
  "rationale": "<≤80 chars>",
  "fitness_signal": {
    "current_score": 0.75,
    "baseline_score": 0.68,
    "delta": 0.07,
    "dimension": "M3 | throughput | clobber_rate"
  },
  "variant_family": "<family_id, if mutation>",
  "sibling_performance": {
    "variant_a": { "fitness": 0.73, "agent_id": "..." },
    "variant_b": { "fitness": 0.82, "agent_id": "..." }
  },
  "precedent_mth": "<if applicable, e.g., mth00099>",
  "evidence_sources": ["forensics/ephemeral/{date}/manifest-*.json", "~/.claude/hooks/state/eval-history.jsonl"]
}
```

**COC entry automatically written by 0x_coc_writer.py hook.**

Steering signals are advisory — agents can ignore them. If an agent continues despite low-fitness steering, that's data (resistance pattern).

### Phase 4: DETECT CRYSTALLIZATION READINESS
A mutation is ready for crystallization when:

1. **In-flight observation window closed** (agent returned, manifest final)
2. **Fitness confirmed** (metric delta ≥0.05 in claimed direction, 3+ measurement cycles)
3. **Sibling variance resolved** (if multi-variant, winner is clear)
4. **No counter-evidence** (didn't regress in any dimension)
5. **Mutation gates pass** (via `9x_mutation_metrics_gates.py --check`)

Emit readiness to **forensics artifact location** (genetic candidates ready for propagation):

```
forensics/ephemeral/{YYYY-MM-DD}/genotype-fitness-{HHMMSS}.json
```

Format (MANDATORY for downstream crystallize):
```json
{
  "timestamp": "2026-05-05T12:45:00Z",
  "type": "genotype_fitness",
  "mutation_family": "<family_id>",
  "anchor_variant": "<winning_agent_id>",
  "claimed_metric_axis": "M6 | FFMx | piston",
  "observed_delta": 0.087,
  "confidence": 0.82,
  "observation_window": "3 sessions",
  "observation_runs": ["run-5", "run-6", "run-7"],
  "sibling_count": 2,
  "mutation_gates_status": "PASS",
  "ready_for_crystallization": true,
  "crystallize_action": "lock_config | promote_method | retire_variant",
  "evidence_sources": [
    "~/.claude/hooks/state/mutation-metrics-phase2.json",
    "~/.claude/hooks/state/eval-history.jsonl (tail 50)",
    "forensics/ephemeral/*/manifest-*-{family_id}.json"
  ]
}
```

**COC entry automatically written. Crystallize reads this during Phase 2.5 evidence verification gate.**

### Phase 5: SPAWN FEEDBACK (governance signal)
Evolve can influence next spawn decisions by ranking variant fitness. Emit spawn-influence signal:

```
forensics/ephemeral/{YYYY-MM-DD}/spawn-influence-{HHMMSS}.json
```

Format (read by context-pressure sigmoid before next spawn):
```json
{
  "timestamp": "2026-05-05T12:56:00Z",
  "type": "spawn_influence",
  "active_variants": [
    {
      "variant_id": "config-piston-overlap-v1",
      "fitness_rank": 1,
      "observed_delta": 0.087,
      "agent_count_active": 3,
      "recommendation": "spawn_more (fitness leader)"
    },
    {
      "variant_id": "config-piston-sequential-v0",
      "fitness_rank": 2,
      "observed_delta": 0.045,
      "agent_count_active": 2,
      "recommendation": "maintain (baseline)"
    },
    {
      "variant_id": "config-piston-aggressive-v2",
      "fitness_rank": 3,
      "observed_delta": -0.012,
      "agent_count_active": 1,
      "recommendation": "retire_variant (regressing)"
    }
  ],
  "bottleneck_alerts": [
    {
      "bearing": "N",
      "count_active": 5,
      "recommendation": "spawn_N_priority (unblock predecessors)"
    }
  ],
  "context_pressure_adjustment": {
    "current_sigmoid_c_mid": 50,
    "recommended_c_mid": 48,
    "rationale": "High-fitness variants ready earlier; tighten spawn trigger"
  }
}
```

### Phase 6: REPORT + DECISION
Return to main:

```
🧬 EVOLUTION WATCH — <elapsed>
├─ in_flight_agents: N
├─ mutations_active: N (families, ranked by fitness)
├─ steering_signals_emitted: N
├─ genotype_fitness_ready: N (ready for crystallize)
├─ bottlenecks_detected: N (N-edges blocking)
├─ spawn_influence_emitted: [yes/no]
└─ next_action: [spawn_variant | wait_for_returns | crystallize_ready]
```

---

## Execution (runs async in background)

**Who spawns it:** Main session, continuously during agent activity (triggered by context-pressure sigmoid spawn decisions).

**How to invoke (from main):**
```python
Agent(
  subagent_type: "stalwart",
  prompt: |
    Run /evolve continuously while agents are in-flight.
    
    EXECUTE SCRIPT LOOP:
    DATE=$(date +%Y-%m-%d)
    while true; do
      python3 ~/.claude/scripts/0x_piston_metrics.py --window 2h
      python3 ~/.claude/scripts/3x_eval_mutation.py --tail 50 --format json
      python3 ~/.claude/scripts/9x_dual_location_manifest_reader.py --in-flight --date $DATE
      python3 ~/.claude/scripts/9x_mutation_metrics_gates.py --check --output-json
      python3 ~/.claude/scripts/9x_mutation_course_correction.py --emit-steering
      python3 ~/.claude/scripts/5x_vault_mutation_tracker.py --readiness-check --output-json
      
      # All outputs written to forensics/ephemeral/{$DATE}/
      # Steering signals → steering-signals-{ts}.json
      # Readiness queue → genotype-fitness-{ts}.json
      
      sleep 30
    done
    
    STOP CONDITIONS (exit gracefully):
    - No in_flight agents remaining (all missions terminal)
    - Crystallization triggered (lock mutations, exit)
    - >90 min elapsed (session context decay)
    
    MANIFEST READS (Phase 1):
    - forensics/ephemeral/{$DATE}/manifest-index-{$DATE}.jsonl (in_flight filtering)
    - ~/.claude/hooks/state/eval-history.jsonl (membench M1-M11)
    - ~/.claude/hooks/state/springboard-efficacy.json (signal health)
  ,
  run_in_background: true
)
```

**Output location:** All forensic artifacts go to `forensics/ephemeral/{YYYY-MM-DD}/`
- `steering-signals-{ts}.json` — per-agent steering recommendations
- `genotype-fitness-{ts}.json` — mutations ready for promotion
- COC entries auto-written for each via `0x_coc_writer.py` hook

---

## When to Use

- **While agents are in-flight** — metrics flowing, manifest frontier active (DEFAULT: spawn /evolve continuously during agent activity)
- **Mutation validation periods** — when 2+ variants active in same family
- **High-churn discovery phases** — manifest frontier busy (discovered_work[] growing fast)
- **Pre-crystallization verification** — confirm fitness before system-wide lock

**NOT for:**
- Replacing crystallize (different pressure point — evolve is in-flight, crystallize is system consolidation)
- Manual steering (agents should self-route; steering signals are advice only)
- Direct spawn control (context-pressure sigmoid is primary; evolve emits fitness feedback to inform sigmoid, not override it)

---

## Steering Actions Decoded

| Action | Meaning | Example |
|--------|---------|---------|
| **accelerate** | Keep going; fitness trending well | "M3 trending +0.08, continue current bearing" |
| **pause** | Something's wrong; wait for clarity | "Latency spike; pause spawning until clarified" |
| **pivot** | Current bearing blocked; try N/S/E/W variant | "S-path blocked by N; pivot E to unblock parallel" |
| **explore_variant** | Try mutation sibling; compare fitness | "Variant B fitness 0.82 vs A's 0.73; explore B" |
| **consolidate** | Winner clear; retire losers | "Variant A fitness plateau; consolidate to A, retire B/C" |

---

## Integration with Crystallize (System Consolidation)

**Evolve ↔ Crystallize feedback loop:**

1. **Evolve (in-flight, team/team):** Watches mutations, emits steering + readiness signals to `forensics/ephemeral/{date}/`
2. **Crystallize-queue accumulates:** `genotype-fitness-{ts}.json` entries (mutations + agent roster + hooks to retire)
3. **Session end, /crystallize runs:** Reads queue, applies system-wide consolidation:
   - **Lock config mutations** (piston settings, model routing)
   - **Debloat agent roster** (retire underperforming agents, promote proven archetypes)
   - **Retire stale hooks** (scripts that ran but didn't move metrics)
   - **Consolidate docs** (canonical paths, retire sprawl)
4. **Consolidation pressure emitted:** Mission-graph tasks for post-session cleanup
5. **Evolve picks up baseline in Phase 1 of next session** (loop closes)

**No blocking.** Evolve and crystallize are async. Evolve doesn't wait for crystallize approval; it surfaces what's ready and moves on. Crystallize happens post-session (full context available for system-wide decisions).

---

## What Changed from Manual Steering

**Old:** Human manually checks metrics, decides mutations.  
**New:** Evolve watches continuously, flags readiness, steers via advisory signals.

**Result:** Mutation validation happens in-flight (6x faster), winners are clear by session end, crystallization is rubber-stamp (not deliberation).

---

## Measurement Discipline

Evolve outputs must be verifiable:
- Every steering signal cites its fitness source (manifest path + metric)
- Every readiness claim includes observation window (N sessions)
- Every sibling comparison includes all variant fitness scores
- Counter-evidence blocks readiness (not silenced)

Fitness fabrication is impossible — all signals traced back to live metric substrate.
