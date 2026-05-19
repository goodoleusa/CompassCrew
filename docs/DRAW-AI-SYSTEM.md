# Draw → AI → System: Point at any folder

> Every folder you already have is a draft system. You wrote it implicitly. Hive makes it explicit, visual, and iterable.

## The thesis

For two years the standout LLM workflow has been **draw → AI → code**: sketch a UI in Excalidraw, the model generates React, you refine, you ship. Tools like v0, Locofy, and excalidraw-to-code popularized the loop.

**Hive applies the same loop to knowledge.** Substitute the artifact:

| draw → AI → code | draw → AI → system |
|---|---|
| Sketch a UI | Sketch a knowledge structure |
| AI emits React/HTML | AI emits NSEW frontmatter |
| Iterate in the browser | Iterate in the canvas |
| Output: a working app | Output: a typed graph your AI agents can navigate |

Knowledge is the new UI. Your second brain has a topology; the canvas is where you author it.

## The cycle: see → sketch → commit → work → re-sketch

1. **See** — `faerie: design this folder` scans any folder (notes, wikilinks, tags, hierarchy) and seeds an Excalidraw canvas with one box per note, positioned from the implicit structure. You see what you already have.
2. **Sketch** — Drag boxes into the four quadrants by bearing. Color the strokes (jasper / emerald / amber / honey) to declare direction. Add new boxes for missing pieces.
3. **Commit** — `faerie: commit excalibrain draft` reads the canvas back and writes NSEW links into each note's frontmatter. Breadcrumbs, ExcaliBrain, and Faerie agents all see the new topology immediately.
4. **Work** — Use the structure. Spawn agents that follow the bearings. Read N to unblock predecessors, S to ship deliverables, E to find parallel work, W to re-seat assumptions.
5. **Re-sketch** — Tomorrow the structure feels wrong. Open the canvas, redraw, re-commit. The cycle is *meant* to repeat — that's the whole point. A second brain that can't evolve is a fossil.

Why each step matters: **seeing** breaks the YAML-first tax; **sketching** unlocks spatial reasoning the YAML editor can't; **committing** turns the sketch into something agents can navigate; **working** validates the topology; **re-sketching** lets you discover your structure was wrong without losing the work that depended on it.

## Five worked examples

### 1. Code repo (`src/` of a TypeScript project)
- `faerie: design this folder` on `src/` → boxes for every module
- Drag `bearings.ts` north (everyone imports from it). Drag `pdf-export.ts` south (terminal feature, no downstream). Cluster `breadcrumbs-*` east (parallel sisters).
- Commit → each module's frontmatter now declares its position in the dependency graph
- An agent asked to "refactor the trail layer" reads N-bearings to know what it must not break, S-bearings to know who depends on it

### 2. Creative writing (a novel's `chapters/` folder)
- 30 chapters, one note each. `faerie: design this folder` seeds them in a 6×5 grid
- Drag in the actual plot order: prologue → north of chapter 1. Two subplot threads run east-parallel. The climax pulls everything south to the epilogue
- Commit → frontmatter encodes the dramatic structure. A re-read pass walking N→S reveals pacing gaps; the parallel E-thread reveals subplot anemia

### 3. Research paper (`literature/` notes)
- 80 papers in one folder. `faerie: scan and propose bearings` posts excerpts to MCP, AI proposes: foundational theory → N, your contribution → S, contemporary parallels → E, retracted/replaced priors → W
- Review modal: accept the foundations, reject the false parallels, edit two rationales
- Commit → the literature map is typed. Drafting the related-work section becomes "walk N from the contribution box"

### 4. Photo collection (markdown notes with EXIF + captions)
- One note per photoshoot, captions and notes inside. `faerie: design this folder` lays out a year of shoots
- Drag by lineage: portrait series N-chains the technique they descend from. Same-day shoots cluster E. Failed experiments hang W as cautionary backtracks
- Commit → an agent asked to assemble a portfolio walks the S-bearings to find peak deliverables

### 5. Contacts (a CRM in markdown)
- One note per person. `faerie: design this folder` shows the soup. You sketch: mentors N, mentees S, peers E, "people I owe a reply" W
- Commit → "show me everyone I owe a reply" becomes a Dataview query on `west:` frontmatter

## Comparison to draw → AI → code tooling

| | v0.dev / Locofy / Excalidraw-to-code | Hive (draw → AI → system) |
|---|---|---|
| Input | Sketch of a UI | Sketch of a knowledge graph |
| Substrate | Excalidraw | Excalidraw |
| AI step | Vision → React/HTML | Frontmatter proposal → NSEW |
| Output | Compilable code | Navigable typed graph |
| Iteration | Re-sketch, re-generate | Re-sketch, re-commit |
| Forensics | git diff on generated code | git diff on frontmatter + COC chain |
| Lock-in | Your code lives in their format | Plain markdown; uninstall = your notes still work |

Same loop. Different artifact. **Knowledge is the new UI.**

## Vibe-code your knowledge graph

You don't plan your second brain in YAML any more than you plan a website in HTML. You vibe-sketch a few boxes, see if it feels right, adjust, commit. Hive gives the vibe-coding workflow to knowledge work.

## Features that land this experience

Crystallized from the [draw-to-system survey](../../../faerie2/forensics/audits/draw-to-system-survey-2026-05-19.md):

- **`faerie: design this folder`** — `src/design-folder.ts::designThisFolder` — WORKING. Right-click any folder → seeded Excalidraw canvas.
- **`faerie: scan and propose bearings`** — `src/design-folder.ts::scanAndProposeBearings` — STUB. Payload + review modal wired; MCP `faerie_propose_bearings` prompt template is the next commit.
- **`faerie: auto-layout from frontmatter`** — `src/design-folder.ts::autoLayoutFromFrontmatter` — STUB. Quadrant-snap working; force-directed pass + decoration preservation is the next commit.
- **`faerie: draft excalibrain`** + **`faerie: commit excalibrain draft`** — `src/excalidraw-setup.ts` — WORKING. The core round-trip these new features feed into.

## References

- Survey: `faerie2/forensics/audits/draw-to-system-survey-2026-05-19.md`
- Round-trip mechanics: `docs/QUICKSTART.md`, `src/excalidraw-setup.ts`
- Bearing ontology: `src/bearings.ts`, `docs/PHILOSOPHY.md`
- Parallel ecosystem (background): v0.dev, Locofy, excalidraw-to-code, Excalibrain
