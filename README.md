# CompassCrew — Steer Your AI Fleet From Your Vault

> You're not giving your vault to AI. You're giving AI a chair at your table.

CompassCrew is an Obsidian plugin that gives you **mission control for AI** — right inside your vault. Draw your system on a canvas, spawn agent crews to work it, drill into anything, and steer with a click. One plugin. Zero magic.

**You prompt once. The fleet executes. You see everything.**

---

## At A Glance

- 🎮 **Spawn an agent crew** — a researcher, a fact-checker, a writer. Give each one a bearing: who is upstream, who is downstream, what is parallel.
- 🗺️ **Draw your knowledge** on an Excalidraw canvas — boxes for notes, colored lines for relationships. Double-click any box to drill down into that note's canvas. Navigate your whole vault spatially.
- ✍️ **Steer in real-time** while your crew works — annotate, redirect, kill a bad thread. Or queue up notes at midnight for morning-you to review.
- 📋 **Auto-generate structured docs** — charters, reports, timelines, findings — from 74 templates that render right into your notes.
- 🔍 **Everything stays yours** — plain markdown, git-tracked, no lock-in. Uninstall and your notes still work.

---

## How It Works

**Your vault is the bridge. Your agents are the crew.** You set the heading. Watch the instruments. Grab the helm anytime.

### Assemble a Crew
Pick a mission. Spawn agents — each with a role, a bearing, and a mandate. One researches upstream sources, one synthesizes, one stress-tests. They read each other's output. You read theirs.

### Draw the Map
Right-click any folder → **Pollinate**. Every note becomes a box on an Excalidraw canvas. Drag things around. Color the lines. Hit **commit** and the structure writes itself into your notes.

Double-click any box: now you're looking at that note's canvas. Its sources, descendants, siblings, assumptions. Drill down forever.

### Steer the Fleet
While your crew works, you read. Anything you annotate feeds back in real time. Your judgment becomes their next instruction. Working alone at 2am? Your notes load as steering at the next session.

### Watch the Instruments
The **Live Panel** shows what every agent is doing — mission graph, active charters, eval scores. Click anything to open the work.

---

## Bearings — Your Navigation System

Every connection in your vault has a direction:

```
  ↑ N (north)     Prerequisites, foundations, what feeds this
  ↓ S (south)     Deliverables, descendants, what follows
  → E (starboard) Parallels, siblings, same-level context
  ← W (port)      Baselines, assumptions, what came before
```

Color a line to declare its bearing. The commit step reads colors back into frontmatter. The auto-layout step uses colors to position boxes on the next canvas open.

---

## Use Cases

**Writing a research paper** — Spawn a researcher, a synthesizer, a fact-checker. Draw the paper on a canvas. Drill into any section to see its evidence chain.

**Building a second brain** — Pollinate your entire vault. See your intellectual geography. Navigate by clicking through canvases.

**Running an investigation** — Spawn OSINT agents. One traces the money, one maps the network, one checks alibis. The canvas shows the whole case.

**Managing a project** — Pollinate your project folder. Drag deliverables south, blockers upstream, parallel tracks to starboard. The canvas is your Gantt chart you can click through.

**Reading at midnight** — Annotate as you go. Queue your margin notes. In the morning, your crew loads your annotations as its briefing.

---

## Features

### 🎯 Agent Crews
Create and manage AI agent crews from inside Obsidian. Each agent has a role, reads the vault, posts results as notes. Single agents or coordinated waves.

### 🗺️ The Recursive Canvas
Every note has a canvas showing its neighborhood. Every box on a canvas has its own canvas. Navigate your knowledge by clicking through — not searching, not scrolling. See the whole system at a glance; drill into any part.

### ✍️ Live Steering
Annotate while your crew works. Your edits sync in real time. Working alone? Queue annotations — they load as steering at the next session.

### 📋 Blueprints (74 templates)
Charters, reports, dashboards, timelines, findings — auto-rendered from templates. Your content lives in the note; the structure renders around it. Your edits are sacred.

### 🧵 Smart Threading
Auto-detects parents, siblings, children. One-click thread creation. Inline navigation pills at the top of every note. No YAML editing.

### 📄 PDF Export
Pandoc + xelatex with smart diagrams and styled typography. Native print-dialog fallback — no WSL needed.

### 🛡️ Forensic Audit Trail
Every AI artifact and every human annotation is hashed and tracked. Two parallel chains-of-custody. Your vault, your evidence.

---

## Quick Clone-and-Go

```bash
git clone https://github.com/goodoleusa/reckon-vault-plugin /path/to/your-vault/.obsidian/plugins/compasscrew
```

1. Open Obsidian
2. Settings → Community plugins → disable Restrict mode → enable **CompassCrew**
3. Run **CompassCrew: doctor** (command palette) → installs companion plugins

That's it. The plugin ships pre-built. No npm, no Node, no compilation.

---

## Optional Companion Plugins

| Plugin | Why |
|--------|-----|
| **Excalidraw** | The recursive canvas. Without it, no visual topology. |
| **ExcaliBrain** | Enhanced graph view. Without it, falls back to built-in mermaid. |

---

## All Commands

Open command palette (⌘+P / Ctrl+P), type `compasscrew`:

| Command | What it does |
|---------|-------------|
| **CompassCrew: doctor** | Check your setup, install what's missing |
| **CompassCrew: pollinate** | Draw any folder as a canvas |
| **CompassCrew: draft excalibrain** | Open current note's canvas |
| **CompassCrew: commit excalibrain draft** | Save canvas to frontmatter |
| **CompassCrew: scan and propose bearings** | AI suggests who connects to who |
| **CompassCrew: auto-layout** | Snap canvas to clean layered layout |
| **CompassCrew: compass overlay** | See bearing graph for current note |
| **CompassCrew: suggest threads** | Auto-detect note relationships |
| **CompassCrew: grab MCP token** | One-click OAuth for AI features |
| **CompassCrew: install canonical configs** | Linter + Breadcrumbs + visual CSS |
| **CompassCrew: lint current file** | Vendored linter |
| **CompassCrew: lint entire vault** | Vendored linter |
| **CompassCrew: export as PDF** | Pandoc or native print |
| **CompassCrew: breadcrumbs tutorial** | In-vault threading guide |
| **CompassCrew: rotate MCP token** | Token management |

---

## Go Deeper

- [Draw → AI → System: The Recursive Canvas](docs/DRAW-AI-SYSTEM.md) — the core idea, in detail
- [Architecture](docs/ARCHITECTURE.md) — how the canvas, bearings, and agent crews fit together
- [Concepts](docs/CONCEPTS.md) · [Comparison](docs/COMPARISON.md) · [Philosophy](docs/PHILOSOPHY.md)
- [`main.ts`](main.ts) — the plugin entry point, if you'd rather read code
- [Install guide](INSTALL.md) and [tutorial](TUTORIAL.md) — full setup + shortcuts

---

## License

MIT. Fork it, ship it, credit the bees.

🐝 → 🌼 → 🍯 → 📜 → ⚓
