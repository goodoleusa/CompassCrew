---
description: "System consolidation engine — lock config mutations, retire stale hooks/agents, consolidate docs to canonical, apply downst pressure via mission graph. Post-session only."
argument-hint: "[--dry-run] [--config-lock] [--agent-debloat] [--hook-retire] [--doc-consolidate] [--all]"
model: sonnet
effort: high
disable-model-invocation: true
user-invocable: true
---

# /crystallize — System Consolidation Engine

**TL;DR:** Post-session pressure point. Reads readiness queue from /evolve, locks proven config mutations, retires underperforming agents, debloats hooks/scripts, consolidates docs to canonical paths. Emits consolidation tasks to mission graph.

**/crystallize ≠ memory compression.** It's system-wide equilibrium: agent roster tight, hook footprint minimal, docs canonical (not sprawl), scripts lean. Pressure points: measured fitness wins (from /evolve), counter-evidence on stale artifacts, budget constraints on infrastructure.

**The fitness function is live.** Crystallize reads from `/evolve` output: `genotype-fitness-*.json` artifacts
containing measured fitness deltas, observation windows, and agent performance rankings. Candidates
whose claimed impact does NOT correlate with measured movement in their claimed metric are rejected — narrative
cannot substitute for measurement. Natural selection (genetic algorithm): fitness-ranked variants compete; winners
lock into system, losers retire, enabling system renewal without bloat.

Droplets rise when inspiration strikes (judgment, instinct).
NECTAR accumulates as findings validate (append-only truth).
HONEY crystallizes when a pattern has survived the gauntlet:
  repeated across 3+ sessions → used by multiple agents → confirmed by human review
  → improves measurable system metrics → earns its 200-line slot.

**Zero main-session reads.** Membot owns all file work.

## Execution (1 turn)

Use the **Agent tool** with `subagent_type: "membot"`:

```
Agent tool:
  subagent_type: membot
  run_in_background: true
  prompt: |
    Crystallize — evaluate + integrate.

    Phase 0: LIVE METRIC SNAPSHOT (the fitness function)
    Read these THREE sources in parallel — they are the substrate for verification + RAP:

    a) MEMBENCH SUBSTRATE (dev-eval M1-M11):
       Read ~/.claude/hooks/state/system-eval.json -> membench section.
       M1=memory_recall, M2=routing_fidelity, M3=context_continuity,
       M4=cross_session_persistence, M5=evidence_grounding, M6=hallucination_rate,
       M7=manifest_completeness, M8=bearing_alignment, M9=spawn_cost_drift,
       M10=token_efficiency, M11=emergence_quality. Snapshot current values.
       Also read prior 5 windows from eval-history.jsonl to compute trend
       (slope per metric over the trailing window).

    b) LIVE SESSION METRICS:
       Read ~/.claude/hooks/state/session_metrics.jsonl tail-50.
       Extract: FFMx composite, surgical_efficiency, clobber_rate, throughput,
       agent_returns, context_fill. Compare against the trailing 7-day baseline
       in eval-history.jsonl. Identify any metric that has moved >5% — that
       movement is the empirical fingerprint candidates must match.

    c) SPRINGBOARD EFFICACY (per springboard-efficacy.md global rule):
       Read most recent forensics/{date}/springboard-efficacy-*.json.
       Note the 4 signals: context_continuity, task_survival, latency, mission_routing.
       A method claiming compaction-resilience improvement must show in these signals.

    Bind {membench_snapshot, session_metric_movement, springboard_signals} to
    the candidate evaluation context — Phase 2.5 will require candidates to map
    their claimed impact to ONE OR MORE of these measurable axes.

    Phase 1: ASSESS PRESSURE
    1. Budget-check: HONEY.md (≤200L), active agent cards (≤80L), CLAUDE.md (≤30L)
    2. Scan TWO candidate pools (unified):
       a) NECTAR.md — patterns/methods appearing 3+ times across sessions/dates
       b) Native memory: ~/.claude/projects/*/memory/feedback_*.md
          - Parse frontmatter: originSessionId, recurrence_count, promoted_to_honey
          - HONEY candidate if: recurrence_count >= 3 OR originSessionId spans 3+ distinct sessions
          - SKIP files already stamped promoted_to_honey (already absorbed)
       
       Also scan project_*.md and user_*.md for context, but with stricter universality bar
       (project facts rarely universal; user identity handled via separate protocol).
       
    3. Check agent streams: python3 ~/.claude/scripts/memory_bridge.py --stream-status
       Collect any uncollected streams first.

    Phase 2: EVALUATE CANDIDATES
    For each HONEY candidate, score:
    - Recurrence: how many sessions/agents independently produced this pattern?
    - Impact: does it measurably improve equilibrium/flow/quality?
    - Universality: true across all future sessions, or context-specific?
    - Budget fit: is there room in HONEY, or must something be displaced?
    If a candidate displaces an existing HONEY entry, the displaced entry must
    be LESS universal/impactful. HONEY entries are not FIFO — they earn their place.

    Phase 2.5: EVIDENCE VERIFICATION GATE (anti-fabrication, mandatory)
    For ANY candidate with proposed confidence >= 0.75:
    - REQUIRE evidence_sources[] in the candidate manifest with >= 2 distinct manifest_path citations
    - For each cited manifest_path: VERIFY (a) the file exists, (b) it actually contains the
      claimed finding (not just topic-adjacent prose). Use grep/jq, not narrative reading.
    - METRIC CORRELATION CHECK (uses Phase 0 snapshot):
        Each candidate must declare `claimed_metric_axis` (one of M1-M11, FFMx, surgical_eff,
        clobber, throughput, springboard signals). Crystallize verifies that the relevant
        metric actually moved in the claimed direction during the candidate's
        observation_window. If the metric is flat (delta <2%) or moved opposite the claim
        → REJECT regardless of citation count. Narrative cannot override measurement.
    - Cross-check claimed metrics against forensics: if candidate claims "FFMx improved 0.X%",
      verify against eval-history.jsonl. If no entry → REJECT regardless of confidence.
    - If candidate claims a charter cycle completed, verify charter_archiver.py log shows it.
    - REJECT outcomes (cycles ran, metrics improved) when evidence is only target/intent statements.
    - Reference precedent: 2026-05-04 quarantine episode (forensics/.../QUARANTINE.json) —
      mth00511/mth00512 fabricated cycle data without evidence_sources; this gate would have caught.
    - VERIFICATION OUTCOME for each candidate:
        verified: candidate proceeds to Phase 3 at proposed confidence (citations + metric correlation present)
        verified_partial: drop confidence by 0.10 per missing evidence source OR per absent
                          metric correlation, proceed
        rejected: do not promote; log to native-to-honey-coc.jsonl as "rejected_unverified"
                  with the specific claim that lacked evidence or metric movement

    For native-sourced candidates specifically:
    - recurrence_count (frontmatter) is the automatic recurrence signal — no re-count
    - originSessionId list length confirms cross-session spread
    - Check pattern_sig against existing HONEY content to avoid duplicate absorption
    - If the native memory is already a structured rule, integration may be one-shot
      (copy structured rule into HONEY section) rather than deep merge

    Phase 3: INTEGRATE (only entries that passed Phase 2)
    - Merge candidate into HONEY — not appending, INTEGRATING against everything known.
      Related entries merge. Contradictions resolve. Cross-references form.
    - For any over-budget file: integrate (merge duplicates into richer unified entries,
      retire superseded — never truncate, never summarize away meaning, never compress).
      Integration is enrichment, not reduction.
    - Promote HIGH pollen flags → NECTAR.md inline (pri=HIGH MEM blocks)

    Phase 3b: PROMOTION STAMP (native-sourced only)
    - For each native-sourced candidate that was absorbed into HONEY:
      Write promotion stamp to source file's frontmatter (atomic temp+rename):
        promoted_to_honey: <YYYY-MM-DD>
        honey_section: <section name where it landed>
      Preserve body content unchanged — only update frontmatter.
      Source native file stays as pointer; HONEY carries the integrated form.
    - Append hash-chained COC entry to
      ~/.claude/hooks/state/native-to-honey-coc.jsonl:
      {ts, source_path, source_sig, honey_section, recurrence_at_promotion,
       session_id, prev_entry_hash, entry_hash}

    Phase 4: METRICS SYNC
    - Write metrics to ~/.claude/hooks/state/crystallization-metrics.json:
      candidates_evaluated, promoted (with scores), displaced, budget_state,
      nectar_patterns (recurring items not yet ready), agent_stream_health,
      native_candidates_evaluated, native_promoted [{path, honey_section,
      recurrence_count}], native_pending [{path, recurrence_count, reason}],
      verification_rejected [{path, reason, missing_evidence, metric_correlation_check}],
      supersessions_emitted [{honey_method, superseded_artifacts[]}],
      demotions_applied [{honey_method, prior_confidence, new_confidence, counter_evidence}],
      rap_cycles_run [{family_id, anchor_variant, fitness_margin, retired_siblings[]}],
      live_metric_snapshot {membench: {M1..M11}, session: {FFMx, surgical_eff, clobber,
                            throughput}, springboard: {context_continuity, task_survival,
                            latency, mission_routing}}
    - Update faerie-brief.json with current HONEY health

    Phase 4.5: RAP — SCRIPT-VARIANT NATURAL SELECTION (governs mutation analysis)
    Crystallize is the official engine of Retroactive Anchor Promotion for script variants.
    For any mission tagged `mission_type: script-consolidation` (or candidate with
    `kind: script-variant-family`):
    - Read the variant family manifest (e.g. forensics/.../mission-script-consolidation-rap/)
    - For each variant, compute fitness:
        fitness = (frequency × quality_score × citations) / complexity
        × metric_lift_factor(variant, Phase 0 snapshot)
      where metric_lift_factor is the observed delta in the variant's claimed_metric_axis
      across its in-flight observation window. A variant that ran but did NOT move its
      claimed axis gets a lift factor of 1.0 (no penalty, no boost). A variant that moved
      the axis positively gets >1.0; opposite movement gets <1.0.
    - Rank variants. Highest fitness = ANCHOR (winner). Promote that variant's pattern as
      a HONEY method entry at confidence proportional to (fitness margin × evidence count),
      capped at 0.85 for first-cycle / 0.95 for survived 3+ cycles.
    - Sibling variants are emitted to Phase 5 as supersession targets with
      `consolidation_action: archive` (they tried, lost, but the attempt is recorded).
    - The RAP record itself appends to forensics/rap-history/{YYYY-MM}/rap_{family_id}.json
      so future cycles can inspect prior natural-selection outcomes.

    Phase 5: SUPERSESSION + CONSOLIDATION PRESSURE (downstream side-effect)
    Crystallization is not just a HONEY append — when a method crystallizes, it should
    APPLY PRESSURE to obsolete the legacy artifacts it supersedes. Otherwise winners and
    losers coexist forever and consolidation never finishes.
    For each newly-promoted method entry:
    - Identify what it SUPERSEDES (script variant, agent role, prior method, hook).
      Look for `supersedes:` field in candidate frontmatter, or infer from semantic match.
    - For each superseded artifact, write a supersession record to
      forensics/supersessions/{YYYY-MM-DD}/supersession_{honey_method_id}.json:
        {
          "honey_method": "<mth_id>",
          "promoted_at": <ts>,
          "supersedes": [
            { "path": "<file>", "kind": "script|agent|hook|method",
              "consolidation_action": "delete|redirect|stub-shim|archive",
              "earliest_action_date": "<honey_promoted_at + 7d>",
              "evidence_required_to_act": "this method survives 1 more session without regression" }
          ]
        }
    - Append a "consolidation pressure" entry to mission graph (compass bearing=S):
        mission: mission-consolidation-followthrough
        task_id: retire-{superseded_path}
        bearing: S
        unblocked_by: <honey_method_id> reaching confidence >= 0.85
      This makes consolidation a first-class downstream of crystallization, not a separate manual job.

    Phase 6: DEMOTION ON COUNTER-EVIDENCE (HONEY garbage collection)
    Existing HONEY entries are not immortal. If counter-evidence has accumulated
    (the method failed in 2+ subsequent sessions, or a higher-confidence successor
    was crystallized), DEMOTE rather than silently keep stale doctrine.
    For each existing HONEY method entry:
    - Scan recent forensics manifests for FAILURE markers tied to that mth_id
      (manifest field: `method_id_failed: <mth>`, or `counter_evidence: [<mth>]`)
    - Apply demotion delta from charter-crystallization rules
      (counter-example -0.15; held with no failures cap +0.10 to 0.95)
    - If new confidence drops below 0.55: archive entry to NECTAR.md with status=demoted,
      remove from HONEY.md, log demotion event with full counter-evidence chain.
    - If a successor method exists at higher confidence: cross-link old → successor
      in NECTAR archive entry so future sessions can trace the lineage.

    Phase 7: REPORT
    Report to caller: N candidates evaluated (N from NECTAR, N from native),
    N verified, N rejected (list reason per rejection),
    N promoted (list them + scores + source),
    N supersessions emitted (list path → honey_method),
    N demotions applied (list with counter-evidence summary),
    N not ready yet (list why), N over-budget files, budget state.
```

Return immediately: "membot spawned — crystallizing. Results incoming."

## When to use

- When the pressure has built up: budget nearing limit, patterns recurring, insights ripening
- When human says "this is ready" — explicit promotion request
- After a dense investigation session that produced many NECTAR entries
- `--dry-run`: Phase 1+2+2.5 only (evaluate + verify, don't integrate) — see what's ready and what gets rejected
- `--evaluate`: score all HONEY candidates, report metrics, don't write
- `--verify-only`: run Phase 2.5 against an existing HONEY entry to recheck evidence (drift detection)
- `--demote-stale`: run Phase 6 only — scan existing HONEY for counter-evidence, demote what's failed

## What's changed from mechanical crystallization

Old: "run at handoff, compress over-budget files." Mechanical, scheduled, lossy — discards meaning.
New: "apply when pressure has built naturally." Evaluative, intentional, enriching — denser but richer.

/handoff does NOT crystallize. It collects (scratch→NECTAR, streams→forensic).
/crystallize is the explicit act of forging — nectar through the gauntlet into honey.
The pressure to crystallize forms naturally (budget, recurrence, validation) OR
is invoked explicitly by human or faerie when the system signals readiness.

## Marriage with Native Auto-Memory

Claude's native auto-memory (`projects/*/memory/{type}_*.md`) is a FIRST-CLASS citizen of this pipeline, not a parallel system. The gauntlet sees BOTH NECTAR and native memory as ONE candidate pool.

**Why:** Native memory persists across sessions via platform auto-load. HONEY persists across sessions via faerie Step Zero. Both serve the same function — cross-session long-term memory. The marriage makes recurring patterns — wherever they first appear — eligible for the same gauntlet.

**Directionality:** Native → HONEY (promotion). Not reverse. HONEY entries don't descend back to native.

**Audit trail:** Every native→HONEY absorption writes:
1. `promoted_to_honey: <date>` to source frontmatter
2. `honey_section: <section>` to source frontmatter
3. Hash-chained entry to `native-to-honey-coc.jsonl`

Dedup guarantee (skip already-promoted on next run) + forensic reproducibility.

**Recurrence detection:** `memory_collector.py` v4 hashes pattern-signatures on every native write and increments `recurrence_count` automatically. Crystallize reads this — agents never manually count recurrence across native memory.

**Active retrieval:** `9x_memory_retrieve.py` ranks hits across native + HONEY + NECTAR + pollen. Used when retrieval triggers fire (domain match, hesitation). Updates `last_accessed` on native files that got read — informs future retention decisions.

**What is NOT happening here:** integration does not mean shrinking. Crystallization is integration + contextualization — situating new knowledge against everything known to produce denser, richer statements. Fewer lines carrying more meaning. Any process that merely shrinks without understanding is forbidden in this pipeline.
