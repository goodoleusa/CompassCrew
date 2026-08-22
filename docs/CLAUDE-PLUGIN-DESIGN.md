# CompassCrew for Claude Code — Design

Status: design + initial scaffold. Companion to the Obsidian plugin in this repo — same
product story, different host. Where the Obsidian plugin is a vault-native client, this is a
Claude Code plugin: skills, a subagent, and slash commands that call out to the same reckon MCP
server. Scaffold lives at [`claude-plugin/`](../claude-plugin/) in this repo.

## 0. The one hard constraint

> "make sure all secret sauce is protected behind mcp or other server on vps" — operator directive.

Concretely: blueprint rendering internals, the custody/signing implementation, mission-graph/COC
algorithms, and the corpus/PDF pipeline internals are real IP. None of it may ship as code inside
the distributed plugin. The plugin's `skills/`, `agents/`, and `commands/` are markdown and thin
argument-shaping — every place they touch real logic, they do it by calling a `reckon_*` MCP
tool over HTTP, exactly the way `reckon-contract.ts` in this repo's Obsidian client already does,
and exactly the way the existing `reckon` Claude Code plugin at
`/home/user/reckon/plugins/reckon` already does for orchestration. Nothing here builds parallel
infra — it reuses the same server, the same `.mcp.json` HTTP-transport shape, and the same free
endpoint (`https://mcp.reckon.systems/free`).

**One deliberate divergence from the Obsidian client, worth naming explicitly:** the Obsidian
plugin's `coc-verify.ts` re-implements custody verification *in the client* (reachability
resolution, both hash-recipe recomputation, the historical alias set — ~450 lines of real logic,
see `src/coc-verify.ts`). That was a legitimate choice for a vault plugin that has to work
offline. It is the wrong choice here: verification logic is exactly the kind of thing this task's
constraint forbids shipping client-side in a distributed plugin. The Claude Code plugin calls
`reckon_coc verb=verify` / `reckon_coc_v2_proof_get` and reports what the server says. No local
reimplementation.

## 1. Feature parity map

Source: `/home/user/reckon-vault-plugin/src/*.ts` (Obsidian) and `TUTORIAL.md`/`README.md` for
the user-facing pitch. Backing tools: verified live in
`/home/user/reckon/runtime/mcp-server/tools/REGISTRY.json` (2026-07-28, 76 tools) and each
tool's own module.

| CompassCrew (Obsidian) feature | Claude Code surface | Backing MCP tool | Tier | Status |
|---|---|---|---|---|
| Blueprint apply/render (`blueprint-engine.ts`, vendored Nunjucks, 85 templates) | `skills/blueprints/` | `reckon_blueprint` (list\|render\|apply) | free | wired — see §3 |
| Breadcrumbs threading (N/S/E/W frontmatter links) | `skills/compass/`, `/compass-graph` | `reckon_mission_graph` (snapshot\|walk\|trace\|stats), `reckon_manifest` (verb=add, bearing field) | free | wired |
| Compass overlay / relationship graph (`compass-overlay.ts`, mermaid + ExcaliBrain) | `agents/cartographer.md`, `/compass-graph` | `reckon_mission_graph`, `reckon_dashboard` (verb=mission_control) | free | wired |
| Chain-of-custody / signing status (`coc-identity.ts`, `coc-verify.ts`, `token-grabber.ts`) | `skills/custody/`, `/custody-status` | `reckon_coc` (tail\|for_charter\|for_session\|verify\|append_human), `reckon_sign` (sign\|verify\|fingerprint), `reckon_pubkey` (register\|revoke\|verify), `reckon_coc_v2_block_get`/`proof_get` | free | wired |
| PDF export / corpus tooling (`pdf-export.ts`, `native-pdf-export.ts`, 1298 lines local rendering) | `skills/corpus/` | `reckon_corpus` (buckets\|ingest\|texts\|manifest\|toc\|read\|search\|bibliography\|thread) | free | wired |
| — raw PDF ops (extract/ocr/merge/split/md_to_pdf) | same skill, gated path | `reckon_pdf` | **pro** | wired, tier-gated server-side (see §4) |
| Ontology management (`ontology-commands.ts`, `ontology-loader.ts`) | `skills/ontology/` | `reckon_vocab` (propose\|ratify\|derive), `reckon_manifest` | mixed (propose free, ratify likely gated server-side) | wired |
| Charter framing (bonus — load-bearing for everything above) | `skills/custody/` references it | `reckon_charter` (list\|get\|update\|declare\|create_from_intent\|close) | free | wired |
| Token / identity bootstrap (`token-grabber.ts`) | `.mcp.json` `userConfig.api_key`, no plugin code | `reckon_token` | admin (rotate/mint) | N/A — see §4, no client-side token minting |

## 2. What ships in the plugin vs. what's a server call

**Ships in the distributed plugin (generic, non-proprietary):**
- `.claude-plugin/plugin.json` — manifest metadata.
- `.mcp.json` — points Claude Code at `https://mcp.reckon.systems/free` (HTTP transport,
  optional `api_key` in `userConfig`, exactly the pattern in `/home/user/reckon/plugins/reckon/.mcp.json`).
- `skills/*/SKILL.md` — prose describing *which* `reckon_*` tool + verb to call for a given
  intent, argument shapes, and how to read the response. No rendering, no verification, no
  graph traversal, no signing math.
- `agents/cartographer.md` — a subagent whose entire job is "call `reckon_mission_graph` and
  `reckon_dashboard`, then format the result as a readable overlay." Formatting JSON into a
  legible tree/table is presentation, not algorithm — the graph itself, the bearing semantics,
  and the traversal (BFS walk, lineage trace) all happen server-side in `mission_graph.py`.
- `commands/*.md` — slash commands that are argument-hints plus "call this tool" instructions.

**Never ships client-side (the actual IP, stays on the VPS):**
- Blueprint template content and the rendering/merge engine.
- Custody chain verification (reachability resolution, hash-recipe selection, alias
  resolution) — `signing.py`, `coc_v2.py`.
- Mission-graph traversal algorithms (BFS walk, lineage trace, owner-scoping) — `mission_graph.py`.
- Corpus/PDF pipeline internals (OCR, extraction, chunking, bibliography synthesis) —
  `corpus.py`, `pdf_toolkit.py`.
- Signing key custody logic, PQ/ed25519 derivation — `auth.py` and the signing tool bodies.

## 3. `reckon_blueprint` — now real (was: VPS-side gap)

This section originally documented a gap: no blueprint-rendering MCP tool existed, and
`claude-plugin/skills/blueprints/SKILL.md` was written against a **proposed** contract with the
tool explicitly not called. That gap is now closed.

`runtime/mcp-server/tools/blueprint.py` (in the `reckon` repo) is a from-scratch Python port of
`blueprint-engine.ts` + `vendor/micro-njk.ts`: the same Nunjucks-subset tokenizer, filter set,
`{% if/else/endif %}` and `{% for/endfor %}` handling, and the same `BLUEPRINT-BEGIN:<section>` /
`BLUEPRINT-END:<section>` marker-splice merge. The 86 top-level `.njk` files from this repo's
`Blueprints/` directory were copied to `runtime/mcp-server/blueprints/` in the reckon repo (the
`partials/` subdirectory was intentionally not copied — the current renderer has no
`{% include %}`, so the client engine never loaded those files either; its `listBlueprints()`
only reads top-level directory entries).

Registered as `reckon_blueprint`, **free tier**, verb-dispatched exactly as proposed:

```
reckon_blueprint  verb=list                                              # -> {ok, blueprints: [{id, title, description}], count}
reckon_blueprint  verb=render  blueprint_id=...  context_json="{...}"    # -> {ok, rendered, section}
reckon_blueprint  verb=apply   blueprint_id=...  context_json="{...}"  existing_doc="..."
                                                                          # -> {ok, merged, rendered, section}
```

(Context and existing_doc travel as JSON-encoded strings rather than nested tool-call objects —
matching the `manifest_json`/`context_json`-style parameter convention already used by
`reckon_vocab`'s `w4w_derive` and similar tools in this MCP server, not a divergence from the
proposal above.)

**Verified for parity, not just "it runs":** every one of the 86 templates was rendered through
both the new Python port and the actual TS `vendor/micro-njk.ts` (compiled with `tsc` and run
under `node`) against the same empty context, plus a populated-context case against a real
blueprint (`Honey-Crystal`) with a `{% for %}` loop and an `{% if %}` branch — byte-identical
output on every template. Two real divergences turned up and were fixed in the port (not
pre-existing in the TS original): Python's `str(True)` → `"True"` vs JS's `String(true)` →
`"true"` (fixed with a JS-semantics string-coercion helper used everywhere a value is
stringified), and Python raising `TypeError` on an over-arity filter call that a
quote-escaping edge case in one template (`Pollen-Lead.njk`) produces, where JS silently ignores
extra positional arguments (fixed by making every filter tolerant of extra args, matching JS).
The regression suite that runs this comparison lives at
`reckon/scripts/shoots/suites/reckon-blueprint-tool.py` — rerun it after any change to either
`blueprint.py` or `vendor/micro-njk.ts` to catch the next drift immediately instead of in
production.

`claude-plugin/skills/blueprints/SKILL.md` has been rewritten to describe the real contract (the
"NOT YET WIRED" stub language and disclaimer are gone).

## 4. Free-tier boundary

Requirement: usable by a Claude Code user on a free/no-cost tier; any AI-assisted cost (bearing
suggestions, embeddings, etc.) lives on the VPS/operator side.

- `.mcp.json` points at `https://mcp.reckon.systems/free` with no required credential —
  `userConfig.api_key` is optional, matching `/home/user/reckon/plugins/reckon/.mcp.json`
  verbatim. A user with nothing configured still gets `reckon_mission_graph`, `reckon_dashboard`,
  `reckon_coc`, `reckon_sign`, `reckon_pubkey`, `reckon_corpus`, `reckon_vocab`, `reckon_charter`
  — everything in the parity table except raw PDF ops and admin verbs, per the live
  `REGISTRY.json` tier column (`free` for all of those; only `reckon_pdf`,
  `reckon_chat`, `reckon_eval_metrics`, `reckon_evolve` are `pro`; only `reckon_token`,
  `reckon_consolidate`, `reckon_coc_pipeline`, `reckon_ops`, `condense_now` are `admin`).
- Where the Obsidian client falls back to a `DEMO_BEARER` public token when no local token file
  exists (`reckon-contract.ts::resolveToken`), the Claude Code plugin doesn't need an equivalent
  client-side fallback at all — the `/free` endpoint itself *is* the no-signup tier, gated
  server-side by `auth.py`, not by anything the plugin carries.
- Tier gating (`{error_type: "tier_gate"}`) is a server response, not a client check. Skills
  say plainly "this needs a paid tier — sign in at https://mcp.reckon.systems" when a call comes
  back gated, mirroring `TierGateError` in `reckon-contract.ts`, but the plugin never encodes
  which tools are gated — that list can change server-side without a plugin update.
- No AI/LLM cost is incurred by the plugin's own skills or agent — `cartographer` (the one
  subagent) only calls read-only `reckon_*` tools and formats their JSON; it runs on whatever
  model the user's Claude Code session is already using, same as any other subagent. Any
  AI-assisted work inside the MCP server itself (e.g. a future bearing-suggestion tool) is the
  operator's compute cost, not the plugin consumer's.

## 5. What's genuinely done vs. stubbed

Done (scaffolded, wired to real free-tier tools, no local secret logic):
- `.claude-plugin/plugin.json`, `.mcp.json`
- `skills/custody/SKILL.md` — custody/signing status surface (adapted from this repo's own
  `commands-canonical/coc.md`, which already documents the exact same live tool surface)
- `skills/compass/SKILL.md` + `agents/cartographer.md` + `/compass-graph` command — mission
  graph / relationship overlay
- `skills/corpus/SKILL.md` — corpus search/read/toc (free) with the pro-gated raw-PDF path
  named explicitly
- `skills/ontology/SKILL.md` — vocab propose/ratify/derive
- `commands/custody-status.md`, `commands/compass-graph.md`

- `skills/blueprints/SKILL.md` — list/render/apply against the now-real `reckon_blueprint` tool
  (§3). No template content, no renderer, ships in the plugin — same non-negotiable as every
  other skill here.

Nothing left explicitly stubbed as of this pass — §3 was the one open gap.

## 6. Should the Obsidian plugin migrate `blueprint-engine.ts` off local rendering?

Now that `reckon_blueprint` exists, `src/blueprint-engine.ts` in *this* repo's Obsidian client
could, in principle, delegate to it instead of running `vendor/micro-njk.ts` locally.
Recommendation: **not by default — keep local rendering as the Obsidian plugin's permanent
design, and treat server delegation as an optional mode, not a migration.**

Reasoning, worked through rather than assumed:

- **Offline is a load-bearing feature for this specific client, not an accident of how it was
  first built.** An Obsidian vault is a local-first, filesystem-backed note store — people use it
  specifically so their notes work on a plane, in a bunker, on a laptop with no signal. The
  blueprint engine fires from `file-open` (auto-rerender-on-stale-template) and from commands a
  user expects to work instantly with no spinner. Making every blueprint apply a network
  round-trip would silently downgrade a currently-offline-capable feature to
  online-required, for a plugin whose whole pitch is vault-native operation. That is a real
  regression, not a neutral refactor.
- **The Claude Code plugin has no equivalent offline constraint** — a Claude Code session is
  already talking to a model over the network; adding one more HTTP call to
  `mcp.reckon.systems/free` costs it nothing architecturally. That is exactly why §0's "one
  deliberate divergence" already draws this same line for `coc-verify.ts`: a vault plugin
  re-implementing something client-side for a legitimate offline reason is a different judgment
  call than a *distributed, network-native* plugin doing the same thing to avoid a server round
  trip. Blueprint rendering is the same shape of decision as custody verification was, and reaches
  the same answer for the same reason.
- **The secret-sauce directive's target is *distribution*, not *duplication*.** The operator
  directive in §0 is about not shipping real IP inside a plugin bundle handed to third parties.
  `blueprint-engine.ts` and the 85 `.njk` templates already ship inside the Obsidian plugin today
  and have since before this task — that boat sailed at the Obsidian plugin's original design
  time, independent of whether `reckon_blueprint` exists. Standing up the server-side tool does
  not retroactively make the existing Obsidian-side copy a leak; it makes the copy *redundant en
  route to a network call*, which is a maintenance-cost question, not a policy violation.
- **Maintenance cost is real and should be tracked, not ignored.** Two implementations of the
  same renderer can drift (see §3's parity-testing note — it already caught two real divergences
  once, from a from-scratch port done carefully; an unmonitored drift over months is a different
  risk profile). If `reckon_blueprint`'s Python renderer gains a filter or tag the TS one lacks
  (or vice versa), the two clients would silently disagree about what the same blueprint against
  the same context produces. Mitigation that doesn't require picking a side: keep
  `scripts/shoots/suites/reckon-blueprint-tool.py`'s TS-vs-Python parity check running (e.g. in
  CI, or manually before either renderer changes) so drift is caught immediately instead of
  discovered by a user.

Concrete recommendation: leave `blueprint-engine.ts` as the Obsidian plugin's default renderer
unchanged. If online-mode convenience is ever wanted for the Obsidian client specifically (e.g. to
guarantee identical output to the Claude Code plugin's renders, or to avoid maintaining the vendor
copy at all), the right shape is an **opt-in setting** — "render via server when online, fall back
to local `micro-njk` when offline" — never a hard cutover that removes the local path. That is a
separate, later decision for whoever owns the Obsidian plugin's roadmap; nothing in this task
requires making it now, and nothing here should be read as scheduling it.

## 7. Distribution

Follows the existing `reckon` marketplace pattern
(`/home/user/reckon/.claude-plugin/marketplace.json`): once ready to publish, add an entry
there (or a CompassCrew-specific marketplace in this repo) pointing `path` at `./claude-plugin`
here. Not done in this pass — scaffold only, per the task's step ordering (design → scaffold →
flag gaps, not design → publish).
