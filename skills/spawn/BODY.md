# /spawn — Stigmergic Agent Spawner (Flywheel Orchestrator)

**Direct wrapper for multi-wave stigmergic agent spawning.** Renders context bundle + spawns agents in parallel (W1 LIFTOFF) with zero dispatcher latency. Agents discover follow-up work via manifest chaining (investigation_label + compass edges). No messaging, no polling—pure filesystem coordination.

## How This Skill Works

**The model (you, main context) IS the harness.** Here's the execution flow:

1. User invokes: `/spawn "semantic intent" [flags]`
2. Model calls `spawn.py` with args → returns JSON directives (one per agent)
3. Model parses JSON directives from stdout
4. **For each directive, model invokes Agent() tool directly:**
   ```
   Agent(
     subagent_type=directive["subagent_type"],
     prompt=directive["prompt"],
     model=directive["model"],
     run_in_background=directive["run_in_background"]
   )
   ```
5. Agents run in parallel (W1), sequentially (W2), or background (W3)
6. Main reads manifests from `forensics/manifests/{YYYY-MM-DD}/`; never reads transcripts

**Why this works:** No external harness needed. The model orchestrates agents directly via the Agent() tool. spawn-direct.py only assembles context bundles (deterministic, cheap assembly). Inference (agent reasoning, discovery, synthesis) happens in agent context, not in main.

## Quickstart

```bash
/spawn data-analyst "Analyze token ledger and compute FFMx breakdown" --investigation-label force-multiplier-index-44.4-breakdown

/spawn documentation-engineer "Synthesize all prior lane outputs" --wave 3 --run-background --investigation-label ffmx

/spawn research-analyst "Gather peer-reviewed sources on bee swarm intelligence"
```

## Full Usage

```
/spawn [<agent_type>] [<task_description>] [--wave 1|2|3] [--run-background] [--investigation-label LABEL] [--model haiku|sonnet|opus]
```

**Contextual Invocation:** If invoked without arguments, /spawn infers intent from immediately preceding assistant output (bundles, work descriptions, manifests). No clarification ask—semantic matching determines agent_type + investigation_label. See CLAUDE.md § Contextual Skill Invocation (mth00102) for inference rules.

## Examples

```
# Spawn data-analyst on current investigation
/spawn data-analyst "Analyze token ledger and compute FFMx breakdown" --investigation-label force-multiplier-index-44.4-breakdown

# Spawn in background (W3 insertion)
/spawn documentation-engineer "Synthesize all prior lane outputs into final report" --wave 3 --run-background --investigation-label force-multiplier-index-44.4-breakdown

# Model override (default: haiku — only override for non-swarm synthesis tasks)
/spawn research-analyst "Gather 12 peer-reviewed sources on bee swarm intelligence" --model haiku --investigation-label force-multiplier-index-44.4-breakdown
```

## Agent Types

- `data-analyst` — metrics, formula breakdowns, numerical analysis
- `research-analyst` — literature, hypothesis, investigation
- `ai-engineer` — LLM/ML systems, prompting, model optimization
- `documentation-engineer` — narrative synthesis, publication-ready output
- `fullstack-developer` — end-to-end system design
- `python-pro` — production Python code, type-safety
- `code-reviewer` — code review, technical debt, quality
- `knowledge-synthesizer` — cross-domain integration, pattern recognition
- `security-auditor` — forensics, compliance, vulnerability assessment
- `frontend-design` — UI/UX, components, styling
- `data-engineer` — pipelines, ETL, data architecture
- `data-scientist` — modeling, statistics, analysis
- `evidence-curator` — deep archive, forensic synthesis
- `stigmergy-scout` — discovery, classification, routing

## Flags

| Flag | Values | Default | Notes |
|------|--------|---------|-------|
| `--wave` | 1, 2, 3 | 1 | W1=LIFTOFF (4-5 parallel haiku), W2=CRUISE (2-3 haiku), W3=INSERTION (1-2 background haiku) |
| `--run-background` | flag | false | Set true for W3 async spawn (don't wait) |
| `--investigation-label` | string | "default" | Clusters related work; read by `/run --missions` for coherent batching |
| `--model` | haiku, sonnet, opus | haiku | Model override (default haiku for cost) |
| `--name` | string | auto-generated | Agent name for internal tracking |

## Context Injection

`/spawn` automatically:
1. Reads `~/.claude/HONEY.md` (global facts)
2. Reads project `.claude/HONEY.md` (repo-scoped facts)
3. Tails `~/.claude/NECTAR.md` (recent findings, HIGH items)
4. Reads `forensics/manifests/{YYYY-MM-DD}/` (recent agent outcomes)
5. Extracts `investigation_label` context (discovery hints from prior agents)
6. Renders bundle via `0x_spawn_template.py`
7. Spawns `Agent(subagent_type=..., prompt=bundle, ...)`

Result: agent receives full contextual picture + cross-references to prior work in same investigation_label cluster.

## Stigmergic Coordination (Zero Messaging)

When spawning multiple agents on same `investigation_label`:
- All agents receive same bundle (parallel spawn)
- Each agent writes to unique artifact path + manifest in `forensics/`
- Agents discover next work via manifest compass edges (N/S/E/W bearings)
- No direct inter-agent messaging needed

**Example:** `/spawn lane-1 "data" --investigation-label ffmx` + `/spawn lane-2 "literature" --investigation-label ffmx` creates 2 parallel agents that coordinate through manifest chaining, not messaging.

## Output Paths

Agents write to:
- **Artifact:** `forensics/artifacts/{YYYY-MM-DD}/{TIMESTAMP}_{task}_{agent-type}_{counter}.{ext}`
- **Manifest:** `forensics/manifests/{YYYY-MM-DD}/{TIMESTAMP}_manifest_task-{task-id}_{agent-type}_{counter}.json`
- **COC entry:** `forensics/coc.jsonl` (auto-logged by hook)

Main reads only manifest (≤5KB, <100 tokens), not full transcript (50KB+, hundreds of tokens).

## Prescan Gate (Prevent Duplicate Work)

Before spawning, `/spawn` checks:
```bash
if [ -f "$TARGET_ARTIFACT" ]; then
  MTIME=$(stat -c%Y "$TARGET_ARTIFACT")
  CUTOFF=$(date -d "24 hours ago" +%s)
  if [ "$MTIME" -gt "$CUTOFF" ]; then
    echo "SKIP: artifact exists, modified <24h ago"
    exit 1
  fi
fi
```

Prevents wasteful re-spawning if work completed recently.

## Force Multiplier Efficiency

Using `/spawn` with bundled context achieves **FFMx 44.4** (44× force per token, 0.54× cost):
- **Parallel dispatch:** Multiple agents launched simultaneously (O(1) latency per agent)
- **Bundle-driven coordination:** Agents discover next work through manifest edges, not central dispatcher
- **Fresh context per agent:** No transcript accumulation; each agent gets ~30K tokens of focused context
- **Reputation-aware routing:** Agents see composite_score in bundle, self-select based on health

Contrast: vanilla sequential agent loop (no parallel, no stigmergy, no reputation) achieves FFMx ≈ 1.0 (1× force per token, 1.0× cost).

## Integration with /run

`/run` uses `/spawn` under the hood:
1. Query compass graph (read manifests from forensics/)
2. Identify open edges (N/S/E/W bearings)
3. Cluster by `investigation_label`
4. Call `/spawn` for each open edge cluster

So `/spawn` is the atomic action; `/run` is the navigator that discovers **when** to spawn.
