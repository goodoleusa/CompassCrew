# Draw → AI → System: The Recursive Canvas

> Your vault already has a topology. The chart is where you see it, shape it, and zoom into it — forever.

## The core idea: a recursive chart

Open an Excalidraw canvas. Every box on it is a note. **Double-click any box and you open that note's chart** — showing *its* N/S/E/W neighborhood as another layer of boxes. Drill down infinitely. Each note is a port; the chart shows you the routes. You navigate your knowledge spatially, by clicking through layers, the way you navigate a coastline by following bearings — not by reading a spreadsheet of coordinates.

This is the draw → AI → system loop, reinvigorated:

| Layer | What you see | What you do |
|-------|-------------|-------------|
| **Canvas** | Boxes = notes, arrows = bearings | Drag, recolor, add, delete |
| **Note** | The actual markdown content | Read, edit, annotate |
| **Canvas (again)** | That note's NSEW neighborhood | Drill deeper or jump sideways |

The canvas isn't a diagram *about* your knowledge. It **is** your knowledge — rendered as a navigable space.

## The loop: see → sketch → commit → navigate → re-sketch

1. **See** — `faerie: pollinate` scans any folder and seeds a canvas with one box per note. Existing wikilinks become gray arrows. You see the implicit structure you already wrote.
2. **Sketch** — Drag boxes into quadrants. Color strokes by bearing (jasper / emerald / amber / honey). Add missing boxes. Delete noise. The spatial arrangement *is* the structure.
3. **Commit** — `faerie: commit excalibrain draft` reads colors and positions, writes NSEW frontmatter into each note. The canvas becomes queryable by Dataview, navigable by Breadcrumbs, traversable by agents.
4. **Navigate** — Open any note's canvas (double-click, or `faerie: draft excalibrain`). See its neighborhood. Drill down into a child. Jump sideways to a parallel. The vault becomes a zoomable map.
5. **Re-sketch** — The structure feels wrong tomorrow. Re-pollinate, redraw, re-commit. The cycle is *meant* to repeat. A second brain that can't evolve is a fossil.

## The recursive canvas in practice

### Drilling down: a research corpus

You're studying Mesopotamian divination. Your `organ-divination/` folder has 15 papers.

1. `faerie: pollinate` on `organ-divination/` → 15 boxes appear in a grid
2. You drag them into bearing clusters:
   - **N (jasper):** Foundational texts — the primary sources everyone cites
   - **S (emerald):** Your own working notes and drafts
   - **E (amber):** Contemporary parallels — papers from the same period that inform but don't directly address
   - **W (honey):** Retracted or superseded claims — what the field used to believe
3. Commit. Now each paper's frontmatter declares its bearing.
4. Double-click the "Brown 2006" box → opens *its* canvas showing:
   - **N:** The primary cuneiform sources Brown analyzes
   - **S:** Your own notes that build on Brown's framework
   - **E:** Parallel work on astral divination in other traditions
   - **W:** Earlier interpretations Brown is arguing against
5. Double-click one of those boxes → drill another level. The corpus is a fractal.

### Jumping sideways: a dissertation

Your dissertation has 8 chapters. Each chapter canvas shows its section structure. Each section canvas shows its argument steps. But the real power is the **E (same) bearing** — parallel threads across chapters.

- Chapter 3's canvas shows an E-link to Chapter 5 (same methodological move)
- Chapter 5's canvas shows an E-link to Chapter 7 (same source base)
- You follow the E-chain and discover your argument has a hidden spine you never planned

The canvas makes cross-cutting structure visible. The linear outline hides it.

### Zooming out: the whole vault

Run `faerie: pollinate` on your vault root. Every top-level folder is a box. Drag them into your intellectual geography:

- **N:** Foundational frameworks (philosophy, methodology)
- **S:** Active projects and deliverables
- **E:** Reference material and research corpora
- **W:** Archived work and superseded thinking

Commit. Now `faerie: draft excalibrain` on any note shows where it sits in the whole. You can always zoom out to orient, then zoom in to work.

## What makes this different from a graph view

| | Obsidian graph view | ExcaliBrain | **Recursive canvas** |
|---|---|---|---|
| Layout | Force-directed (jittery) | Hierarchical tree | **Deterministic layered** (same input → same output) |
| Edge types | None (all links equal) | Typed (NSEW) | **Typed + spatial** (direction = position) |
| Navigation | Click node → open note | Click node → open note | **Click node → open that node's canvas** (drill down) |
| Editability | Read-only | Read-only | **Fully editable** (drag, recolor, add, delete) |
| Persistence | Auto-generated | Auto-generated | **Committed to frontmatter** (git-tracked, queryable) |
| AI integration | None | None | **AI proposes bearings** (scan & propose) |

The recursive canvas is the missing piece: a **zoomable, editable, persistent, AI-assisted** map of your knowledge.

## The bearing colors

```
  N (jasper)     ↑  Prerequisites, unblockers, foundations
  S (emerald)    ↓  Deliverables, descendants, what follows
  E (amber)      →  Parallels, siblings, same-level context
  W (honey)      ←  Baselines, assumptions, what came before
```

Color a box's stroke to declare its bearing. The commit step reads colors back into frontmatter. The auto-layout step uses colors to position boxes on the next canvas open.

## Commands

| Command | Shortcut | What it does |
|---------|----------|-------------|
| `faerie: pollinate` | Right-click folder | Seed canvas from folder contents |
| `faerie: scan and propose bearings` | — | AI proposes bearings via MCP, review modal |
| `faerie: draft excalibrain` | — | Open current note's NSEW neighborhood as canvas |
| `faerie: commit excalibrain draft` | — | Read canvas → write frontmatter |
| `faerie: auto-layout from frontmatter` | — | Snap boxes to deterministic layered layout |

## Worked examples

### 1. Code repo (`src/` of a TypeScript project)
- `faerie: pollinate` on `src/` → boxes for every module
- Drag `bearings.ts` north (everyone imports from it). Drag `pdf-export.ts` south (terminal feature). Cluster `breadcrumbs-*` east (parallel sisters).
- Commit → each module's frontmatter declares its dependency position
- An agent refactoring the trail layer reads N-bearings to know what it must not break

### 2. Creative writing (a novel's `chapters/` folder)
- 30 chapters, one note each. Pollinate seeds a 6×5 grid
- Drag in plot order: prologue → N of chapter 1. Subplot threads run E-parallel. Climax pulls everything S to the epilogue.
- Commit → frontmatter encodes dramatic structure. Walking N→S reveals pacing gaps.

### 3. Research corpus (80 papers in `literature/`)
- `faerie: scan and propose bearings` → AI proposes: foundational theory → N, your contribution → S, contemporary parallels → E, retracted priors → W
- Review modal: accept foundations, reject false parallels, edit rationales
- Commit → literature map is typed. Drafting related-work = "walk N from the contribution box"

### 4. Contacts (a CRM in markdown)
- One note per person. Pollinate shows the soup. Sketch: mentors N, mentees S, peers E, "people I owe a reply" W
- Commit → Dataview query on `west:` shows everyone you owe

### 5. Recursive drill-down (the killer feature)
- Open your "Religion" folder canvas → see top-level clusters
- Double-click "organ-divination" → see the 15 papers inside
- Double-click "Brown 2006" → see its argument structure
- Double-click a claim in Brown's canvas → see the evidence chain
- At every level, the canvas shows the NSEW neighborhood. You never get lost because you can always see the doors.

## Implementation status

| Feature | Status | Source |
|---------|--------|--------|
| `faerie: pollinate` (seed canvas from folder) | ✅ WORKING | `src/design-folder.ts` |
| `faerie: scan and propose bearings` (AI round-trip) | ✅ WORKING | `src/design-folder.ts` |
| `faerie: auto-layout from frontmatter` (layered, deterministic) | ✅ WORKING | `src/design-folder.ts` |
| `faerie: draft excalibrain` (note → canvas) | ✅ WORKING | `src/excalidraw-setup.ts` |
| `faerie: commit excalibrain draft` (canvas → frontmatter) | ✅ WORKING | `src/excalidraw-setup.ts` |
| **Recursive drill-down** (double-click box → open that note's canvas) | 🔄 PLANNED | — |
| **Zoom-out breadcrumb** (see parent canvas from child) | 🔄 PLANNED | — |
| **Canvas-to-canvas E-links** (parallel canvases, not just notes) | 🔄 PLANNED | — |

### Why layered, not force-directed

Force-directed graphs look organic but read poorly — positions jitter between runs and spatial memory is destroyed. Layered layouts trade organic feel for **spatial predictability**: tomorrow's canvas looks like today's plus your edits. The right trade-off for a knowledge graph you'll re-open hundreds of times.

## The vision

Knowledge work is currently trapped in two inadequate metaphors:

- **The outline** (linear, hierarchical, hides cross-cutting relationships)
- **The graph** (overwhelming, uneditable, no semantic edge types)

The recursive canvas is the third way: **spatial, typed, editable, zoomable**. You see your whole system at a glance. You drill into any part. You reshape by dragging. You commit by clicking. The AI proposes; you dispose. The structure evolves as your thinking evolves.

Your second brain isn't a database. It's a territory. The canvas is the map — and the map is navigable.

## References

- `src/design-folder.ts` — pollinate, scan-and-propose, auto-layout
- `src/excalidraw-setup.ts` — draft/commit round-trip
- `src/bearings.ts` — bearing ontology and colors
- `docs/PHILOSOPHY.md` — why N/S/E/W
- `docs/CONCEPTS.md` — vault-as-substrate
