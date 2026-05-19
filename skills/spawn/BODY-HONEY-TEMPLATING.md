# /spawn — Context-Aware Agent Dispatch with HONEY Templating

**Goal:** Spawn agents with rich, role-specific context. Use HONEY templating to render 3-5K excerpt instead of full 50K.

## Usage (Minimal — No Args Required)

```
/spawn
```

System reads immediate context (prior assistant output, mission graph state, investigation_label) and spawns.

## How HONEY Templating Works

Instead of bloating every bundle with full 50K HONEY:
- **Before:** 50K HONEY + NECTAR + manifests + task = 55K tokens per spawn
- **After:** 3K HONEY excerpt (role-specific) + NECTAR + manifests + task = 7K tokens

Saves 48K tokens per spawn × 4-5 spawns per W1 = **240K tokens per LIFTOFF wave freed**.

### Template Selection by Agent Role

HONEY.md entries are tagged with scope in frontmatter:
```
[mth00090 | method | permanent | 1.0] **TOUCH-OWNS-COMPLETION EQUILIBRIUM**
scope: [task-ownership, equilibrium]
...
```

When spawning an agent, renderer pulls sections matching agent's role scope tags:
- `vault-architect` → pull sections tagged [vault-architecture]
- `data-scientist` → pull [data-analysis, statistics]
- `python-pro` → pull [code, python, refactoring]
- `code-reviewer` → pull [code-review, quality]
- `general-purpose` → pull [universal] always

### Bundle Composition (Templated)

```
1. HONEY excerpt (role-specific scope tags, 3-5K)
2. Inject-rules discipline reminder (relevant to agent role, 0.5K)
3. NECTAR.md tail-30 (recent HIGH findings, 1-2K)
4. Recent manifests from same investigation_label (2-3K)
5. Task directive (goal + done_looks_like + judgment_envelope, 1-2K)
```

Total: 7-13K per bundle (vs 55K without templating).

## Context Inference (No Args)

When user types `/spawn`:
1. Read prior assistant output (what did I just complete?)
2. Query manifests: recent 5 from `forensics/manifests/{YYYY-MM-DD}/`
3. Extract investigation_label + compass_edge + next_task_queued
4. If compass_edge=S: next_task_queued is ready to spawn
5. Match agent role to task type (from task_id or role metadata)
6. Render HONEY excerpt with role scope tags
7. Assemble bundle
8. Spawn with Agent(subagent_type=..., prompt=bundle, run_in_background=true)

Example:
```
Prior output: "eval-harness-v2-prep manifest written, S-bearing, ready"
next_task_queued: rerun-baseline-against-v2
Inference: 
  investigation_label = evidence-synthesis-eval
  task = rerun-baseline-against-v2
  role = data-scientist (inferred from task type)
Render: 
  HONEY sections tagged [data-analysis, eval-methodology] = 3K
  + discipline reminder [testing, measurement] = 0.5K
  + NECTAR [recent HIGH eval findings] = 1K
  + manifests [evidence-synthesis-eval cluster] = 2K
  + task [rerun-baseline-against-v2] = 1K
  = 7.5K bundle
Spawn: Agent(subagent_type=data-scientist, prompt=bundle, ...)
```

## Activation Checklist

- [ ] HONEY.md entries have scope tags in frontmatter
- [ ] 0x_spawn_template.py supports `--honey-templated` flag
- [ ] scope-to-role mapping defined in spawn config
- [ ] settings.json routes `/spawn` → 0x_spawn_template.py → Agent()
- [ ] Test: spawn one agent with templating, verify token count ~7K

## HONEY Tagging Protocol

Every crystallized entry needs scope tags:
```
[mth00090 | method | permanent | 1.0] **PRINCIPLE_NAME**
scope: [tag1, tag2, tag3]
...
```

Available tags:
- `universal` — all agents (always included)
- `vault-architecture` — vault-specific
- `code` — code-focused (python-pro, frontend-design, code-reviewer)
- `data-analysis` — data agents (data-scientist, evidence-analyst)
- `eval-methodology` — evalbot, performance-monitor
- `orchestration` — stigmergy-scout, workflow-orchestrator
- `task-ownership` — anyone claiming tasks
- `manifest-discipline` — manifest writing, compass edges
- `equilibrium` — f(0) balance, script tiering
- `memory-topology` — HONEY/NECTAR/pollen
- `spawn-discipline` — Agent() protocol, bundle emission
