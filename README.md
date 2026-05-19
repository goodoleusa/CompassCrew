# Hive — Faerie Obsidian Orchestrator (v2.0.0)

The vault-side counterpart to the Faerie hive-mind. Turns Obsidian into a
creative cognitive substrate: blueprint engine, compass-bearings, marginalia
loop, MCP bridge, plugin-only light sessions, OSINT report generator, and
a beautifully styled visual language of droplets, charters, anchors, waggles
and honey.

Evolution of `hive-pdf` v1 — the PDF export feature is preserved unchanged.

## Why this exists

A vault should not be a passive dumping ground. It should be a substrate where
human and agent stigmergy combine: agents drop manifests as pheromone trails,
humans annotate them as margin notes, and the loop closes via the MCP bridge
back into the faerie codebase. This plugin is the membrane.

## Feature list (10 capabilities)

1. **PDF export** — preserved from v1 (mermaid + pandoc + xelatex via WSL).
2. **Dependency doctor** — checks required plugins; refuses Templater.
3. **Blueprint engine** — Nunjucks-flavored; markers preserve human edits.
4. **Trail-refs** — bearing-tagged links (N/S/E/W) + Breadcrumbs threading.
5. **Marginalia → MCP loop** — margin notes POSTed to `faerie_record_marginalia`.
6. **Compass overlay** — Juggl filtered to current note's N/S/E/W neighbours.
7. **Visual language callouts** — droplet, charter, anchor, waggle, honey,
   brood, propolis (see `styles.css`).
8. **MCP bridge side panel ("Faerie Live")** — dashboard, metrics, charters.
9. **File decorator** — 🐝 next to AI-authored files; honey-glow if <1h old.
10. **QuickAdd macro library** — preset macros for charter/manifest/anchor/
    honey workflows (no Templater).

Plus a few bonuses that emerged during scoping:

- **Faerie Chat panel** — full plugin-only light session via MCP; explicit
  "push to vault" button (nothing leaves automatically).
- **System-prompt round-trip** — import faerie2's system prompt into vault,
  annotate, push edits back as a PR via MCP.
- **SpiderFoot integration** — install/repair via uv venv, run scan, render
  beautiful OSINT report from blueprint, CSV sidecar (no JSON in Obsidian).
- **Pollen-lead handling** — unverified OSINT findings thread into the
  mission graph as dotted edges (`bearing: "?"`).

## Canonical Blueprints

The repo-root `Blueprints/` folder is the canonical, plugin-bundled blueprint
library — 74 templates gathered from faerie-vault, CyberOps-UNIFIED, and
hand-authored creative-output blueprints:

- `Session-Report.njk`, `Eval-Report.njk`, `Narrative-Design-Doc.njk`
- `Charter.njk`, `Manifest.njk`, `FFFF-Dashboard.njk`
- `Agent-Output-Prettify.njk` (raw → readable transform)
- `OSINT-Spiderfoot-Report.njk`, `Pollen-Lead.njk`
- `System-Prompt-Round-Trip.njk`
- Plus all OSINT entity templates (`Person`, `Organization`, `Domain`,
  `IP-Address`, `Investigation-Case`, `Intelligence-Report`, `Network-Map`,
  `Source-Assessment`, `Shadow-Operation`, `Financial-Trail`, etc.) — these
  are deliberately preserved as **agent-facing templates**: when an OSINT
  agent needs to produce a Person dossier, it reads this template and
  matches its structure.

User overrides live in `vault/00-SHARED/Blueprints/` (same `.njk` filename
wins over the bundled version).

## Build & install

```bash
cd faerie-hive-plugin
npm install
npm run build        # emits main.js
```

Symlink the built plugin into your vault:

```bash
ln -s "$(pwd)" "/path/to/vault/.obsidian/plugins/hive"
```

Then in Obsidian: Settings → Community plugins → enable **Hive**.

Run `Faerie: doctor` (command palette) to check that the required peer
plugins are installed.

## MCP server expectations

The plugin POSTs to `${mcpUrl}/tools/<tool_name>` with JSON body. Tools it
calls (all optional; gracefully degrade if absent):

- `faerie_dashboard`, `faerie_metrics`, `faerie_charters` (Live pane)
- `faerie_chat`, `faerie_session_finalize` (Chat panel)
- `faerie_record_marginalia` (margin note loop)
- `faerie_anchor_promote` (QuickAdd macro)
- `faerie_update_system_prompt` (system-prompt round-trip)

Bearer token loaded from vault-relative `.faerie-token` (gitignored).

## Plugin-only light session

Open the Chat panel (`Faerie: open chat panel`). Talk to Faerie. Every reply
renders into the panel; nothing touches the vault filesystem until you click
**Push session to vault**, at which point the conversation graduates into a
session report via `faerie_session_finalize`. Fully air-gapped chat → vault
flow, no surprises.

## Repo

Configured remote: `git@github.com:Persistech/faerie-hive-plugin.git`
(not yet pushed — `git push -u origin main` when you're ready).

See `TUTORIAL.md` for end-user usage and `vault/00-SHARED/HELP/hive-plugin-tutorial.md`
for the long-form walkthrough.
