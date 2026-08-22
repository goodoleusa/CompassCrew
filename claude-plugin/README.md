# compasscrew — CompassCrew for Claude Code

Gives Claude Code users the same core capability CompassCrew gives Obsidian users — blueprint
templating (pending, see below), N/S/E/W bearing threading, a mission-graph/compass overlay,
chain-of-custody and signing status, corpus/PDF tooling, and vocabulary/ontology management —
as a thin client over the reckon MCP server. No proprietary rendering, custody-verification, or
graph-traversal logic ships in this plugin; every substantive call goes to
`https://mcp.reckon.systems/free`. Design rationale and the full feature-parity map:
[`../docs/CLAUDE-PLUGIN-DESIGN.md`](../docs/CLAUDE-PLUGIN-DESIGN.md).

## Install

```
/plugin marketplace add goodoleusa/CompassCrew
/plugin install compasscrew@CompassCrew
```
(Marketplace entry not yet published — see design doc §6.)

## Skills

| Skill | Backing tool(s) | Tier |
|---|---|---|
| `custody` | `reckon_coc`, `reckon_sign`, `reckon_pubkey`, `reckon_coc_v2_*` | free |
| `compass` | `reckon_mission_graph`, `reckon_dashboard`, `reckon_manifest` | free |
| `corpus` | `reckon_corpus` (free), `reckon_pdf` (pro, gated server-side) | mixed |
| `ontology` | `reckon_vocab` | mixed |
| `blueprints` | **none — not yet wired, see skill file** | — |

## Agents

- `cartographer` — read-only subagent that fetches and renders the mission-graph overlay so a
  large graph doesn't fill the main conversation's context.

## Commands

- `/custody-status [artifact_path | charter_id=... | session_id=...]`
- `/compass-graph [mission=... | anchor_task_id=...]`

## Free tier

`.mcp.json` points at `https://mcp.reckon.systems/free` with no required credential. Every
skill above except the pro-gated raw-PDF path in `corpus` works with nothing configured. See
the design doc §4 for the full boundary.
