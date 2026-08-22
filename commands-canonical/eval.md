# `/eval` — agent evaluation over the reckon MCP surface

Baseline, run, compare and replay agent evaluations. **Every subcommand is one MCP tool call.**
There is no local harness script, no parallel state directory, and no second scoring path.

> **This file was rewritten 2026-08-22.** The previous version delegated every subcommand to
> `~/.claude/scripts/eval_harness.py` and described a hand-rolled COC v2 manifest written into
> `~/.claude/hooks/state/`, with a local `_build_coc_manifest()` fallback described as producing
> "an identical schema" if the real builder was not importable. Three things were wrong with that,
> and each is a pattern rather than a typo:
>
> 1. **The harness is not part of this plugin and never shipped with it.** A command that
>    delegates to a file the user does not have fails at the Bash layer with a missing-file
>    error, which reads as a broken command rather than as an unmet dependency.
> 2. **A fallback that claims schema parity is a fork.** "Use the real builder if importable,
>    otherwise this local copy with an identical schema" is two implementations of one contract
>    with nothing comparing them. In this ecosystem that exact shape has already caused silent,
>    key-shaped failures — see the drift ledger at the top of
>    `reckon-lite/tools/revenant_vendor_sync_lite.py`.
> 3. **It wrote eval state to a second home.** `~/.claude/hooks/state/evals/*.jsonl` plus
>    `eval-config-history.jsonl` duplicated what the reckon server already keeps on the COC
>    spine. Two homes for one fact, and no answer for which one is real.
>
> The reckon MCP server exposes all of this as first-class tools whose results land on the COC
> chain automatically. Calling them is strictly less code and strictly more custody.

---

## The tools this maps onto

Names are verbatim from `runtime/mcp-server/tools/REGISTRY.json`. These are verb-dispatchers:
the verb is an argument, not part of the tool name.

| Tool | Verbs used here | Tier |
|---|---|---|
| `reckon_metrics` | `eval`, `eval_compare`, `evolve`, `membench`, `read`, `emergence`, `usage`, `vibe_test` | free (`log` = pro) |
| `reckon_evolve` | mutate → measure → keep/rollback | pro |
| `reckon_metabolism` | fused eval intake ⇄ evolve adaptation | free |
| `reckon_econ` | the live EvalHomeBase feed | free |
| `reckon_coc` | `tail`, `for_charter` — read the custody trail an eval left | free |
| `reckon_agent` | `team_status`, `spawn` | mixed |

---

## Subcommands

### `/eval baseline {agent_type}`

Establish or refresh an agent's zero-point reference.

```
reckon_metrics  verb=eval  mode=full
```

The run lands on the COC chain server-side. Read its custody trail back with
`reckon_coc verb=tail` — that trail *is* the record, which is why there is no longer a
`~/.claude/hooks/state/evals/baseline-*.jsonl` to keep in sync with it.

### `/eval run {agent_type}`

One-shot eval. `mode=quick` is the default; `probes` narrows the probe set.

```
reckon_metrics  verb=eval  mode=quick  probes=all
```

### `/eval membench`

Universal memory-comparison probes (M1/M3/M8/M11/M12).

```
reckon_metrics  verb=membench  probes=all
```

### `/eval compare --a {run} --b {run}`

A/B or cohort comparison. Hypotheses are pre-registered server-side before the data is read
(anti-HARKing); null results are reported alongside significant ones.

```
reckon_metrics  verb=eval_compare  runs="<a>,<b>"  baseline="<baseline_id>"
```

### `/eval emergence [--days N]`

Bearing diversity and mission velocity over a window — the emergence half of the metabolism.

```
reckon_metrics  verb=emergence  days=7
```

### `/eval fitness`

Live M1–M11 fitness monitoring.

```
reckon_metrics  verb=evolve  evolve_metrics="M1,M3,M8,M11"
```

### `/eval vibe {mission}`

Dry-run a proposed mission change before committing to it.

```
reckon_metrics  verb=vibe_test  mission="<name>"  change_type="<kind>"  change_details={…}
```

### `/eval usage [--range today]`

The caller's own telemetry. Scope is explicit so a session read is never mistaken for a
fleet-wide one.

```
reckon_metrics  verb=usage  scope=session  scope_id=current  range=today
```

---

## Reading the results

**Three verdicts, never two.** PASS · FAIL · UNMEASURED-with-the-obstacle-named. A probe that
could not run is a *different fact* from a probe that ran and scored zero, and the two must not
be collapsed. A false RED costs exactly what a false GREEN costs, so a check that goes quiet
when it cannot see is the worse of the two.

**Scoring authority.**

- `source: evalbot` — authoritative, hash-chained, admissible. Used for tier promotion.
- `source: self` — directional only, not auditable. Used for on-the-job redemption tracking.
- Evalbot never reads its own prior scores before scoring (anti-bias).

**Custody.** Every eval that mutates state appends to the COC chain server-side. To see what an
eval actually left behind:

```
reckon_coc  verb=tail  n=20
reckon_coc  verb=for_charter  charter_id="<id>"
```

From inside Obsidian, **CompassCrew: verify chain of custody** runs that same read and verifies
the returned chain locally — by REACHABILITY, not by file adjacency. Shards are storage; the
chain is order. A verifier that requires line *N*'s `prev_entry_hash` to equal line *N−1*'s
`entry_hash` is making a stronger claim than the chain ever made, and is false by construction
for any shard whose storage order is not its link order.
