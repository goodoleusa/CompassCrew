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
| Blueprint apply/render (`blueprint-engine.ts`, vendored Nunjucks, 85 templates) | `skills/blueprints/` | **none exists** | — | **GAP — see §3** |
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

## 3. VPS-side gap: no `reckon_blueprint` tool

Grepped the live registry and every `tools/*.py` module — there is no blueprint-rendering MCP
tool. `blueprint_resolver.py` and related hook scripts exist only under `archive/` in the reckon
monorepo (dead code, not registered on any FastMCP instance). The 85 Nunjucks blueprints
themselves live in this repo's `Blueprints/` and `templates/` dirs and are currently rendered
**client-side in the Obsidian plugin** (`blueprint-engine.ts`, vendored micro-Nunjucks).

Per the task's explicit instruction, this is **not** stubbed by porting that renderer into the
Claude Code plugin — that would be exactly the client-side secret-sauce leak the constraint
forbids (the blueprint library and merge/stamp logic are real product IP). Instead:

- `claude-plugin/skills/blueprints/SKILL.md` is written against a **proposed** contract and
  clearly marked not-yet-wired: `reckon_blueprint` with verbs `list | render | apply`, roughly:
  - `list` → `{blueprints: [{id, title, description}]}`
  - `render(blueprint_id, context)` → `{rendered: "<markdown>"}`
  - `apply(blueprint_id, context, existing_doc)` → `{merged: "<markdown>"}` (server does the
    `BLUEPRINT-BEGIN/END` marker merge that `mergeRendered()` currently does locally)
- The skill tells Claude to say so plainly ("blueprint tooling isn't available from this MCP
  server yet") rather than improvising a local render, if the tool 404s.
- **Follow-up work, not done here:** stand up `runtime/mcp-server/tools/blueprint.py` on the
  VPS, register `reckon_blueprint` in the FastMCP instance + `REGISTRY.json`, move the 85
  `.njk` templates (or a curated subset) server-side, port the merge-marker logic from
  `blueprint-engine.ts`'s `mergeRendered()`. Until that lands, blueprint parity is the one
  feature this plugin cannot deliver.

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

Explicitly stubbed with a named TODO, not faked:
- `skills/blueprints/SKILL.md` — describes the intended `reckon_blueprint` contract, states
  clearly that the tool does not exist on the server yet, and points back to §3 of this doc.
  No template content, no renderer, ships in the plugin.

## 6. Distribution

Follows the existing `reckon` marketplace pattern
(`/home/user/reckon/.claude-plugin/marketplace.json`): once ready to publish, add an entry
there (or a CompassCrew-specific marketplace in this repo) pointing `path` at `./claude-plugin`
here. Not done in this pass — scaffold only, per the task's step ordering (design → scaffold →
flag gaps, not design → publish).
