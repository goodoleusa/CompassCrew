# 🐝 Hive — Cultivate Your Knowledge Garden *Alongside* AI

> You are not giving your vault to AI. You are giving AI a chair at your table.

Hive is an Obsidian plugin that turns your vault into a **collaborative substrate** where you and AI work side-by-side. AI proposes — drafts, mission graphs, evidence trails, evaluations. You curate, annotate, redirect, ignore. Both contributions are first-class. Neither overwrites the other. Every change is forensically tracked.

The point isn't to automate your thinking. It's to **see** what AI is doing in your work, **shape** it with your judgement, and **keep** the audit trail forever.


## What this is NOT

- ❌ A "send my notes to an LLM" plugin
- ❌ A chat interface bolted onto Obsidian
- ❌ A system that overwrites your notes with AI output
- ❌ A black-box assistant you have to trust blindly

## What this IS

- ✅ **Sketch your system, commit it, iterate.** Open Excalidraw, drag colored shapes around for your N/S/E/W bearings, hit *commit topology* — the plugin reads the colors back, writes the new structure into your frontmatter. **Vibe-code your knowledge graph the way you'd vibe-code a UI.** Re-sketch tomorrow if it doesn't feel right. Your second brain literally evolves on your canvas.
- ✅ **A free AI tool with a visible, editable customization layer.** The vault IS the customization. Want to change how the AI thinks? Edit a markdown file. Save. Done.
- ✅ **Steering, not telling.** Annotate while the AI works (live sync) OR while you read alone at midnight (queues for the next session). Either way, your edits land as first-class steering input.
- ✅ A **two-layer canvas**: AI artifacts flow in as immutable forensic record; your annotations live in parallel, fully editable. Neither overwrites the other.
- ✅ **Yours, forever**: the vault is plain markdown. Uninstall the plugin and everything keeps working as plain notes.


## Quickstart (2 commands, no build step)

The plugin ships with `main.js` pre-built. No npm, no Node, no compilation.

```bash
# 1. Clone into your vault's plugins dir
git clone https://github.com/Persistech/swarmy-hive-plugin /path/to/vault/.obsidian/plugins/hive

# 2. Open Obsidian → Settings → Community plugins → enable Hive
```

That's it. Open the command palette and run **`faerie: doctor`** — it'll tell you which companion plugins (Dataview, Meta Bind, QuickAdd, Breadcrumbs, ExcaliBrain) you should add. Click "Install recommended" when offered.

Optional (only if you want AI features beyond local templates):

- Get a faerie MCP bearer token from https://faerie.retrofuture.tech (free, GitHub OAuth)
- Drop it in `<vault>/.faerie-token` (gitignored, stays on your machine)
- Run **`faerie: install canonical configs`** to drop in linter rules + Breadcrumbs setup + visual-language CSS


## What you get

### 🐾 Trail-Refs — Latticework, with bearings

Highlight any passage. Press `CMD+Shift+H`. Pick a bearing. The plugin drops a typed, colored reference link. `CMD+Hover+Click` peeks the destination in an adjacent pane *without* navigating away. Inspired by [Latticework](https://www.matthewsiu.com/Latticework) (Siu & Matuschak, 2024) — extended with compass typing so every reference carries semantic direction.

### 📝 Human/ — Your annotations. Steer anytime. Live or queued.

Annotations land in `<vault>/Human/{date}/` — your own forensic record, separate from the AI's. Hash-tracked, append-only, exactly like the AI's chain-of-custody. If MCP is configured, annotations also post to the faerie server for live-or-queued steering.

**Two steering modes, both first-class:**

- 🔄 **Live** — If an AI session is running while you annotate, your edit syncs in real-time. The agent's next turn sees your note. Pace your reading against the AI's working speed; they read each other as the work unfolds.
- 🌙 **Queued** — Working alone at midnight? Annotations queue in `00-SHARED/Annotations/{date}/`. The next conversation that starts (yours or another agent's) loads them as steering input via the system prompt template's `{{ human_annotations }}` variable.

You don't have to "tell" the AI — your reading IS the telling.

### 🧭 Compass Overlay — Typed graph view (ExcaliBrain-powered)

Run `faerie: compass overlay for current note`. An [ExcaliBrain](https://github.com/zsviczian/excalibrain) view opens showing the note's N/S/E/W neighborhood as a hierarchical bearing tree — jasper for unblockers, emerald for deliverables, coral for parallels, amber for baselines. The native Obsidian graph can't show typed edges; this can.

### ✏️ Excalidraw round-trip — the headline feature

The **draw → AI → code** loop has been the standout pattern for visual UI scaffolding all year. Hive applies the same idea to **knowledge structure**: draw → AI → system. Sketch your relationships, commit the topology, work in it, re-sketch. Your second brain literally evolves on the canvas.

**The loop:**

1. Run `faerie: draft excalibrain` on any note → opens a fresh Excalidraw canvas pre-seeded with that note's bearings hierarchy as labeled, color-coded rectangles
2. Drag shapes around. Add new ones. Move connections. Brainstorm freely. Stay visual.
3. Run `faerie: commit excalibrain draft` — the plugin reads the colors back from the canvas, diffs against the source, **writes the new topology into your frontmatter as proper NSEW links**
4. Open the source note. The graph has changed to match your sketch.
5. Tomorrow you re-sketch. The cycle never ends.

**Vibe-code your knowledge graph the way you'd vibe-code a UI.** Most "second brains" force you to think in YAML upfront. Hive flips it: think visually, let the YAML follow.

### 🗺️ Point it at any folder — design any system, not just faerie's

The plugin doesn't care what the folder is. You can run the draw → commit cycle on:

- **A code repo's docs** — sketch how modules depend, commit the structure, the repo's `README.md`s land as N/S/E/W-linked nodes
- **A creative writing project** — chapters as boxes, "leads-to" / "callbacks" / "parallel-thread" as colored arrows, commit, your manuscript has its outline in frontmatter
- **A research paper** — citations as N (prerequisites), claims as S (supports), counter-arguments as W (questions), related work as E
- **A photo or media collection** — sketch the taxonomy you want, commit, the metadata flows
- **A list of contacts** — relationship graph as a draw-and-commit
- **Literally any folder in your vault** — open it in `faerie: pollinate`, see its current structure (or lack thereof), redraw, commit

The 4-bearing compass is structural; the labels are yours (per `ontology.yaml`). The folder is whatever you point at. The cycle is the same.

Ships with the **Architect** preset (smooth bold lines, no hand-drawn jitter, professional sans fonts: Inter / IBM Plex Sans / JetBrains Mono) and 20 curated Excalidraw automation scripts (Auto Layout, Connect Elements, Add Next Step in Process, Box Selected, etc.).

### 🍯 Visual Language Callouts

```markdown
> [!charter] My intent for this week
> [!droplet] A crystallized insight
> [!anchor] A baseline I'll defend
> [!waggle] A waggle dance — direction + magnitude
> [!honey] Capped knowledge
> [!brood] Active work
> [!propolis] Structural seal
```

Honeybee identity, consistent shape-color-motion language. Every callout types its content as a node in the apiary metaphor.

### 📋 Blueprints — Nunjucks templates, applied post-hoc

Basic Obsidian core templates create the bones. Blueprints (Nunjucks-subset) render structured sections *over* existing notes, between markers (`<!-- BLUEPRINT-BEGIN -->` / `<!-- BLUEPRINT-END -->`). Your edits outside the markers are sacred. The AI's structured content updates between them. **74 blueprints ship out of the box** — charter, manifest, dashboard, FFFF report, OSINT entity, eval report, narrative design doc, financial trail, chronology, and more.

**No Templater required.** Blueprints render with a vendored 303-LOC Nunjucks subset (`if`/`for`/`set`/filters); everything else uses Meta Bind + QuickAdd + Dataview from the official community registry. **Zero runtime npm dependencies.**

### 🧵 Breadcrumbs Onboarding — Threading without YAML pain

- **`CMD+Shift+T`** opens a quick-thread modal: fuzzy file picker + bearing dropdown. No YAML editing.
- **`faerie: suggest threads`** auto-detects parents (folder `_index`/`README`/`MOC`), siblings (mutual links in same folder), children. Confirm with checkboxes.
- **Inline thread widget** renders bearing-colored clickable pills at the top of every threaded note (↑ up · ↔ same · ↓ next · ＋ thread).
- **`faerie: breadcrumbs tutorial`** generates a vault-local tutorial in plain English explaining the 4-field model.

### 🐝 Faerie Live — Side panel with MCP data

Refreshes every 60s. Shows the current mission graph, eval dimensions, active charters from the faerie MCP server. Click any charter to open it in the vault.

### 📊 Dependency Doctor

`faerie: doctor` audits which companion plugins you have, which you should have, and which you should *never* have (Templater is on the don't list — Hive replaces it with vendored Nunjucks + QuickAdd macros + Meta Bind). One-click install for the canonical set.

### 📜 Glass-box Internals — *See it, then edit it*

`00-SHARED/Faerie-System-Internals/` (auto-synced from faerie source) surfaces every AI template, formula, spawn bundle, and system prompt as a real Obsidian note. Inspect variable bindings, formula math, current values, source-of-truth paths. **Nothing hidden, nothing read-only.**

This is the customization layer. Want to change how the queen agent thinks? Open `System-Prompts/queen-system-prompt.md`, edit the markdown, save. The plugin round-trips your edit back into `prompts/system/faerie.njk` (via `faerie_update_system_prompt`). Same for blueprints, formula thresholds, archetype briefs. **The vault is the cockpit.**

If you'd rather not edit the source-of-truth directly, the plugin uses BEGIN/END markers — you author in the vault, the AI re-renders between markers, your edits outside markers are sacred. Either workflow works.

### 📄 Hive PDF Export

Original feature from `hive-pdf` v1, preserved unchanged. Smart-sized mermaid diagrams, hive-styled typography, deterministic pandoc + xelatex pipeline.

### 🛡️ Forensic chain integrity

Every AI artifact carries a sha256 hash. Every human annotation gets the same. Two parallel chains-of-custody (`coc.jsonl` for AI, `coc-human.jsonl` for you), both append-only, hash-linked. The vault is markdown; the audit is forensic.


## Philosophy

Most "AI in Obsidian" plugins assume one of two failure modes:

- **Vault-as-input** — your notes become RAG fuel, the AI does the thinking, you read the output.
- **Vault-as-output** — the AI dumps generated content into your notes, you sift the wheat from the chaff.

Both reduce you to a *role*. Hive picks a third path: **vault-as-substrate**. The AI does the work it's good at (drafts, structured artifacts, mission-graph navigation, evaluation). You do the work you're good at (judgement, curation, redirection, intuition). Both contributions land in the same medium. Both are tracked. Neither overwrites the other.

This is the apiary model — bees forage, the keeper curates, the comb holds both. Workers waggle-dance their bearings; you read the dance and decide whether the next forage should follow it. The hive isn't yours OR theirs. It's the **medium where the work happens**.

The novelty argument is laid out in detail at [`docs/NOVELTY.md`](docs/NOVELTY.md) — *Hive: A Cognitive Substrate for Human–AI Co-Thinking*. If you want the academic framing, read it. If you want to just use the thing, you don't have to.


## Deeper docs

- **In-vault tutorial:** `<vault>/00-SHARED/HELP/hive-plugin-tutorial.md` (auto-installed when you first run `faerie: doctor`)
- **Visual language spec:** [`forensics/glossary/VISUAL-LANGUAGE.md`](https://github.com/Persistech/faerie/blob/main/forensics/glossary/VISUAL-LANGUAGE.md) in the faerie repo — every shape, color, and motion the plugin uses
- **Canonical paths:** [`CANONICAL-PATHS.md`](https://github.com/Persistech/faerie/blob/main/CANONICAL-PATHS.md) for developers wiring custom integrations
- **Faerie System Internals:** `<vault>/00-SHARED/Faerie-System-Internals/00-Home.md` after first sync — the inspectable mirror of every template, formula, system prompt, and spawn bundle
- **Latticework paper:** Siu & Matuschak, [matthewsiu.com/Latticework](https://www.matthewsiu.com/Latticework)
- **Novelty paper (this work):** [`docs/NOVELTY.md`](docs/NOVELTY.md)
- **Spawn bundle (for AI verification):** [`docs/SPAWN-BUNDLE.md`](docs/SPAWN-BUNDLE.md) — the 4-agent multi-bearing wave that empirically tests the plugin against a real vault
- **Companion plugins:** [Dataview](https://blacksmithgu.github.io/obsidian-dataview/) · [Meta Bind](https://github.com/mProjectsCode/obsidian-meta-bind-plugin) · [QuickAdd](https://github.com/chhoumann/quickadd) · [Breadcrumbs](https://breadcrumbs-wiki.netlify.app/) · [ExcaliBrain](https://github.com/zsviczian/excalibrain)


## MCP token management (admin reminder)

The MCP token is how the plugin authenticates against the faerie server. **Get one, drop it in your vault, you're done.** Two paths:

### One-click (recommended — requires plugin v2.1+)

Run command **`faerie: grab MCP token`** → opens GitHub OAuth in your default browser → after you approve, faerie redirects back with a one-time token download → plugin auto-saves to `<vault>/.faerie-token` (gitignored). Done.

### Manual (works today)

```bash
# Open the OAuth flow in your browser:
open https://faerie.retrofuture.tech
# (or visit it manually — sign in with GitHub, approve the app)

# After approval you'll see your token. Copy it, then:
echo "your-token-here" > /path/to/vault/.faerie-token

# Lock down permissions (optional but recommended):
chmod 600 /path/to/vault/.faerie-token
```

The token is a 200-char base64url string. Treat it like an SSH private key — never commit it, never paste in chat.

### Rotating tokens

```bash
# From the plugin (admin command):
# "faerie: rotate MCP token"  → invalidates the old token, issues a new one, auto-saves

# Or from the VPS as admin:
docker exec faerie2-mcp python3 deploy/scripts/manage-tokens.py rotate <user>
```

### Provisioning new users (admin only)

GitHub OAuth handles this — anyone in `GITHUB_ALLOWED_USERS` (set in faerie's `.env`) can sign in at `https://faerie.retrofuture.tech` and gets a token + an Ed25519 signing keypair (one-time download, zero-knowledge — faerie keeps only the public key).

```bash
# Add a new user to the allow list (VPS admin):
ssh faerie
nano /opt/faerie/.env
# Add their GitHub username to GITHUB_ALLOWED_USERS=...
docker compose restart mcp-server
```

For the full provisioning + key-rotation flow (B2 buckets, signing keys, customer-facing accounts), see `scripts/dev/customer/` in the faerie repo. The same zero-knowledge contract applies: faerie holds only public keys + URLs; user retains their private signing key.


## Configuration

Settings → Hive →

- **MCP URL** (default `https://api.retrofuture.tech/mcp`)
- **MCP token path** (default `.faerie-token` in vault root)
- **Daily folder** (default `00-SHARED/Daily/`)
- **Human folder** (default `Human/` — your annotations live here, separate from AI's chain of custody)
- **Blueprint folder** (default `Blueprints/`)
- **Visual language** (theme: full / minimal / off)

All settings are optional — the plugin works in a fully local mode (PDF export, blueprints, trail-refs, compass overlay, visual callouts, Excalidraw round-trip) with **zero network calls**.


## License

MIT. Use it, fork it, ship your own version. Credit Latticework and any other plugins you build on, like we did.


## A note on the name

A *hive* is the structure. *Faerie* is the larger orchestration system this plugin connects to. *Honey* is the crystallized knowledge. *Bees* are the agents — and you, the keeper. The metaphor isn't ornament; it's load-bearing. Read the visual language spec when you have time; the metaphor explains the plugin.

🐝 → 🌼 → 🍯 → 📜 → ⚓
