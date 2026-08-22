# CompassCrew — the walkthrough

The "show me why I should care" document. **Fifteen minutes to something impressive**, then a
walkthrough per standout feature: how to use it, and what problem it solves.

Command reference lives in [`README.md`](README.md). This is the tour.

- [Before you start](#before-you-start)
- [Quickstart — 15 minutes, seven real outcomes](#quickstart--15-minutes-seven-real-outcomes)
- [1 — The recursive canvas](#1--the-recursive-canvas)
- [2 — Bearings: why a compass beats a folder tree](#2--bearings-why-a-compass-beats-a-folder-tree)
- [3 — Blueprints](#3--blueprints)
- [4 — Mermaid diagrams and genuinely beautiful PDFs](#4--mermaid-diagrams-and-genuinely-beautiful-pdfs)
- [5 — Agent crews and the Live pane](#5--agent-crews-and-the-live-pane)
- [6 — Chain of custody](#6--chain-of-custody)
- [7 — Corpus and PDF extraction](#7--corpus-and-pdf-extraction)
- [Shortcuts](#shortcuts) · [When something doesn't work](#when-something-doesnt-work)

---

## Before you start

**You need:** Obsidian 0.15+, desktop. (This plugin shells out to real tools — no mobile.)

**You do NOT need:** an MCP server, an API key, a sign-up, or a network connection. The canvas,
bearings, blueprints, Mermaid, native PDF export, the linter, your signing key, and the entire
custody verifier run **locally with zero runtime dependencies**. Server-backed sections are
labelled, so you always know which is which.

```bash
git clone https://github.com/goodoleusa/CompassCrew.git \
  /path/to/your-vault/.obsidian/plugins/compasscrew
cd /path/to/your-vault/.obsidian/plugins/compasscrew
npm install && npm run build
```

Then Obsidian → Settings → Community plugins → enable **CompassCrew**.

> **Check your build before you trust it:** `npm run verify` runs `tsc --noEmit`, a production
> build, **41 unit/integration tests**, and a 23-assertion contract smoke suite. Those tests
> generate a real Ed25519 keypair, assert the runtime refuses to export the private half, and
> verify **real production custody leaves** end-to-end over real HTTP. If it's green, the build on
> your disk is the build that was tested.

---

## Quickstart — 15 minutes, seven real outcomes

Every step ends in something you can **see**. If a step doesn't produce its stated outcome,
that's a bug worth reporting, not something to push past.

### 1. Let the doctor tell you what's missing · 1 min

`⌘P` → **CompassCrew: doctor (check plugin dependencies)**

**You should see:** each companion plugin (Excalidraw, ExcaliBrain, Breadcrumbs, QuickAdd,
Dataview) marked present or absent, with an offer to install what's missing.

**Why:** the canvas features genuinely want Excalidraw. Breadcrumbs and Dataview have *vendored
fallbacks* so nothing hard-fails without them. The doctor tells you where you stand before you
hit a feature that quietly does less than you expected.

> 📸 **Screenshot-worthy:** the doctor report showing the vendored-fallback line — the clearest
> single picture of "this plugin degrades honestly instead of breaking."

### 2. Drop the configs · 1 min

**CompassCrew: install canonical configs**

**You should see:** confirmation that linter rules, Breadcrumbs field mappings and bearing CSS
were written into your vault.

**Why:** this is what makes `up:` / `down:` / `same:` mean *north / south / east* everywhere at
once — graph view, canvas, compass overlay, and the coloured inline chips. One config, one
vocabulary.

### 3. Draw a folder · 3 min ← **the moment**

Pick a folder with **5–6 notes that link to each other**. Right-click → **CompassCrew: pollinate**.

**You should see:** an Excalidraw canvas where every note is a labelled box and every
`[[wikilink]]` between them is a grey arrow. Your folder, as a picture, in about a second.

**Why it lands:** you have probably never *seen* the shape of a folder you've worked in for
months. The first pollinate is routinely the moment someone realises their "well organised"
folder is three disconnected islands and one note nobody links to.

> 📸 **Screenshot-worthy:** the seeded canvas *before* you touch it. The unedited layout is the
> honest picture of your link structure.

Now **drag the boxes** into a shape that makes sense — sources up top, conclusions at the bottom,
peers side by side. Then **CompassCrew: commit ExcaliBrain draft → frontmatter**.

**You should see:** the arrangement you drew written into each note's YAML as `up:` / `down:` /
`same:`.

**Why this is the whole idea:** you drew a picture and it became structured data in plain
markdown — not a proprietary canvas file. Every other Obsidian tool can read it, and it survives
uninstalling this plugin.

### 4. Let it propose the rest · 3 min

Open a note in that folder → **CompassCrew: scan folder and propose bearings**

**You should see:** a review modal, one row per proposal, each with its reasoning:

| Pattern | Proposal | Rationale shown |
|---|---|---|
| A ↔ B link each other | both get **E** | "mutual wikilink — peers" |
| A → B only | A gets **N** to B; B gets **S** to A | "one-way wikilink — this note cites its source" |
| Most inbound links | everyone gets **W** to it | "folder anchor — N inbound links" |

Accept what you like. Accepted proposals write to frontmatter.

**Why the rationale column matters:** it runs **entirely locally** and shows its reasoning for
every proposal, so you're reviewing an argument, not approving a verdict from a black box.

> Until this modernization pass, this POSTed to an MCP verb (`propose_bearings`) the server does
> not implement and never has. The server returned an error object with HTTP 200; the plugin read
> that as success with zero proposals and reported *"proposed 0 bearings"* — a cheerful green
> meaning "this feature does not exist." Everything it needed was already in local memory.

### 5. See the compass · 2 min

**CompassCrew: mermaid compass** → an inline NSEW diagram renders in the note, in bearing colours.

**Why start here:** it needs **no external plugin at all**. With ExcaliBrain installed,
**CompassCrew: compass overlay** gives the richer interactive graph; without it, the Mermaid
version still renders. Degrade, don't break.

### 6. Make a PDF · 2 min

**CompassCrew: export current note as PDF (native print dialog)**

**You should see:** your OS print dialog with the note rendered cleanly — chrome stripped,
sensible page breaks around headings and code blocks. Choose "Save as PDF".

**Why this one first:** zero external tooling. No pandoc, no LaTeX, no WSL. The high-fidelity
pipeline in [§4](#4--mermaid-diagrams-and-genuinely-beautiful-pdfs) is what you graduate to.

### 7. Make a key, then prove a chain · 3 min

**CompassCrew: create signing identity** → **CompassCrew: signing + spawn identity status**

**You should see:** an Ed25519 keypair created inside your vault, a 16-hex public fingerprint,
and a status block reporting **three separate rows** — signing key, spawn slot, legacy key.

Then **CompassCrew: verify chain of custody** (needs a server): a verdict block with leaf counts,
which hash recipe matched how many leaves, dangling parents, forks, and out-of-storage-order
counts, all reported separately.

No server? You get `COC CHAIN — UNMEASURED` naming the connection as the obstacle. **That is the
correct answer**, and the fact that it isn't a silent green is the point of [§6](#6--chain-of-custody).

---

## 1 — The recursive canvas

### The problem

Obsidian's graph view is beautiful and nearly useless for thinking: everything at once, weighted
by nothing, at one zoom level. You can't ask it "what does *this* note depend on, and what do
*those* depend on?" — the one question you actually have. Canvas plugins fix the everything-at-once
problem but a canvas is a leaf: you can't open a box and find another canvas inside it.

### The idea

**Every note has its own canvas. Any box can be opened into the canvas of the note it represents.
Forever.**

You're not looking at one map of your vault. You're looking at *this note's* neighbourhood, able
to step into any neighbour and see *its* neighbourhood, arbitrarily deep.

### How to use it

1. **Seed** — right-click a folder → **pollinate**. Or for one note's neighbourhood:
   **draft ExcaliBrain**.
2. **Arrange** — drag. Want a machine first pass? **auto-layout Excalidraw from frontmatter**
   gives a deterministic layered tree: north above, south below, east beside.
3. **Descend** — double-click any box → that note's own canvas opens.
4. **Commit** — **commit ExcaliBrain draft → frontmatter**. The picture becomes YAML.
5. **Make it look serious** — **apply professional Excalidraw preset** swaps the hand-drawn
   default for smooth lines and sans-serif; **install professional Excalidraw fonts** adds Inter,
   IBM Plex Sans, JetBrains Mono. Excalidraw's crayon aesthetic is charming and undermines you in
   a design review.
6. **Get the good tools** — **install curated Excalidraw scripts library** drops in a curated
   subset of ea-scripts (Auto Layout, Connect Elements, Add Next Step).

### Status tags

Shapes carry a publish status from one shared vocabulary: ✏️ Draft (grey) · 👁 Reviewing (cyan) ·
📝 Annotating (amber) · 🚀 Ready (green) · ✅ Published (violet).

Palette, vocabulary and bearing colours are read at boot from `_meta/compasscrew.config.json`.
**One place to change them**, and the change lands in the canvas, the overlay and the inline chips
simultaneously. Hardcoded fallbacks mean a missing config never crashes the plugin — but the
config is the authority, not the fallback.

### Why it's satisfying

The drawing isn't a picture *of* your work — it **is** your work in a different projection. Drag a
box and commit: a real file changed. Descend into a box: you're somewhere equally real. Nothing
here is a visualisation painted on top of your notes. It's your notes, seen from above, editable
from above.

---

## 2 — Bearings: why a compass beats a folder tree

### The problem

A folder says *where a note lives*. It says nothing about **what it does for you**. Two notes in
`Research/` might be one-you-must-read-first and its sequel, two independent takes, or a
conclusion and its evidence. The folder flattens all three into "siblings".

### The idea

| Bearing | Field | Question it answers | Colour |
|---|---|---|---|
| **N** north | `up:` | What must I understand first? | red |
| **S** south | `down:` `next:` | What follows from this? | green |
| **E** east | `same:` | What is a peer of this? | cyan |
| **W** west | `up:` (alias) | What baseline do I return to? | gold |

Four questions, answered in frontmatter, rendered everywhere.

### How to use it

- **By hand:** **quick-thread** — pick a note, pick a direction.
- **Let it guess:** **suggest threads** infers from folder position and link structure.
- **Inside a sentence:** select text → `⌘⇧H` → pick a bearing. You get a **trail-ref**: an inline
  link colour-coded by direction. Prose keeps reading like prose while carrying navigable
  structure.
- **Declutter:** `⌘⇧S` toggles all trail-refs off; shift-click collapses one. Chips are for
  navigating — sometimes you just want to read.
- **See it:** **mermaid compass** (no deps) or **compass overlay** (ExcaliBrain).
- **Learn it in-vault:** **breadcrumbs tutorial (interactive)** builds a working threaded example
  inside your own vault.

### Why it's cool

Bearings are the same vocabulary the agent side uses: N is *unblock*, S is *ship*, E is *parallel*,
W is *baseline*. When a crew reports "this task is N of that one", it means the identical thing it
means in your notes. There's one model, not a human one and a machine one you translate between.

And because it's *just frontmatter*: Dataview queries it, the graph view respects it, Breadcrumbs
walks it — and it all still works the day you uninstall this plugin.

---

## 3 — Blueprints

**85 Nunjucks templates that render into your notes and can be re-rendered without eating your
prose.**

### Why that last clause is the feature

Most template plugins solve the blank page: stamp a skeleton into a new note, done. The case that
actually recurs is different — **updating a rendered section inside a note you've been writing in
for a week**. Blueprints render between markers:

```markdown
<!-- BLUEPRINT-BEGIN:Finding -->
...rendered content...
<!-- BLUEPRINT-END:Finding -->
```

Re-render and **only the block between the markers is replaced**. Text above and below is
untouched, and multiple blueprints coexist in one note without clobbering each other. That's the
difference between a template you use once and one you live with. It's covered by tests, because
it's the behaviour standing between "your section updated" and "your week of writing is gone".

### Use it

| Command | Does |
|---|---|
| **apply blueprint to current note** | fuzzy-pick → renders in place from the note's frontmatter |
| **apply blueprint to folder** | the same, across a whole folder |
| **render blueprint to clipboard** | output without touching the note |

Edit freely around the block, change some frontmatter, run it again.

### What's in the box

Investigation (`Investigation-Case`, `Evidence-Item`, `Source-Assessment`, `Chronology-Entry`,
`Financial-Trail`, `Threat-Actor`, `Network-Map`) · agent ops (`Charter`, `Manifest`, `Mission`,
`Wave`, `Context-Bundle`, `Session-Handoff`, `Eval-Report`) · knowledge work (`Analysis`,
`Research-Brief`, `Intelligence-Report`, `Memory-Entry`) · entities (`Person`, `Organization`,
`IP-Address`, `Domain`) · system design (`System-Design`, `TechDoc`, `Flow-*`). Plus six ready-made
Excalidraw scenes: architecture, component diagram, data pipeline, decision tree, process flow,
timeline.

### The trade, stated plainly

The renderer is **vendored and ~200 lines** (`src/vendor/micro-njk.ts`) — exactly the Nunjucks
subset the blueprints use: variables, dotted paths, a handful of filters, `{% if %}`, `{% for %}`,
`{% set %}`. Nothing else.

That's why this plugin ships a real template engine with **zero runtime dependencies**. The cost:
arbitrary Nunjucks won't work. The return: no npm dependency tree in your vault, no supply chain,
no template-engine CVE with your name on it. The test suite renders **every shipped blueprint** on
an empty context to prove none of them throw.

---

## 4 — Mermaid diagrams and genuinely beautiful PDFs

There are **two different PDF paths**, and picking the wrong one will disappoint you.

### Mermaid, three ways

**In your notes — free, no plugin.** Obsidian renders ```` ```mermaid ```` natively. Blueprints
lean on that: `Mermaid-Diagram.njk` and the `Flow-*` family generate Mermaid source from your
frontmatter, so a rendered flow diagram is a *product of your data* rather than something you drew
and now have to keep in sync.

**As a compass — no dependencies.** **mermaid compass** renders the current note's NSEW bearings
as an inline Mermaid graph. The zero-dependency fallback for the ExcaliBrain overlay.

**In an exported PDF — three-stage rendering**, so a diagram never silently vanishes.

### The high-fidelity pipeline

**Produces:** a typeset PDF — an actual LaTeX document with Mermaid and Excalidraw rendered as
real images placed in the text flow. **Needs:** WSL (Windows), `pandoc`, `xelatex`, `mmdc`.
**Trigger:** **CompassCrew: export as PDF**, configured under Settings → CompassCrew → PDF.

| Stage | What happens | If it can't run |
|---|---|---|
| 0 | Excalidraw embeds → PNG via ExcalidrawAutomate | skipped if `includeExcalidraw` off |
| 1 | ```` ```mermaid ```` blocks extracted to `.mmd` | — |
| 2 | each `.mmd` → PNG via `mmdc`, transparent, neutral theme | hard failure — you asked for rendered diagrams |
| 3 | **optional** aspect sizer: explicit widths from real PNG ratios, so a wide flowchart isn't letterboxed | **skipped, logged UNMEASURED by name**; diagrams still embed at LaTeX default sizing |
| 3.5 | Mermaid blocks that survived Stage 2 fetched as PNGs from `mermaid.ink` | leaves a **visible placeholder comment**, never a silent gap |
| 4 | `pandoc → xelatex → PDF` with the print-ready header injected | — |

Stage 3.5 is the one to appreciate: `mmdc` only processes the `.mmd` files Stage 1 extracted, and
anything with unusual fencing slips through. Rather than ship a PDF with a mysteriously missing
diagram, 3.5 catches stragglers over the network — and if that fails, writes a placeholder you can
*see*. A missing diagram you can find beats one you can't.

### What actually makes it beautiful

**The print-ready LaTeX header** (`assets/print-ready-header.tex`, shipped, injected via
`--include-in-header`):

- **Floats pinned `[H]`** — a diagram stays with the paragraph discussing it instead of drifting
  two pages away. LaTeX's default drift is the single most common reason a generated PDF looks
  amateur.
- **Needspace on headings** — no heading orphaned at a page foot with its body overleaf.
- **Widow/orphan penalties** — no single dangling line across a break.
- **NavyBlue hyperref colorlinks**, body and bibliography matched.
- **Booktabs rules, tight captions** (above tables, below figures), **longtable** support, framed
  shaded code blocks.

> **This was a fix, not a feature.** The header used to load from a path inside a repo two rebrands
> gone. `fs.existsSync` returned false, `--include-in-header` was silently dropped, and **every
> export lost all of the above while reporting complete success.** The "beautiful PDF" claim was
> resting on a file nobody had. It ships now — and the test suite asserts it exists and contains
> `floatplacement` and `needspace`, so the claim can't rot again.

**Presets**, so you don't tune LaTeX by hand:

| Preset | Size | Margin | Body font | For |
|---|---|---|---|---|
| `note` | 11pt | 1.0" | DejaVu Sans | daily notes, drafts |
| `business` | 14pt | 0.75" | DejaVu Sans | client proposals — big type, tight margins |
| `academic` | 12pt | 1.0" | Latin Modern Roman | papers, formal reports |
| `comparison` | — | — | — | side-by-side tables, tight leading |
| `custom` | — | — | — | every knob individually |

### Why it's cool

The failure modes are honest. Stage 3 absent is an *optional enhancement missing* and says so;
Stage 3 present-but-broken is a *real error* and fails loudly. A Mermaid block that slips past
`mmdc` gets caught, and if it can't be, it leaves a mark. A missing header is logged.

Almost every "export to PDF" tool has exactly one failure mode: it produces something, and you
find out later it wasn't what you meant.

---

## 5 — Agent crews and the Live pane

> **Server-backed.** Needs a reckon MCP server. Without one you get demo-mode reads and clearly
> labelled tier gates — not errors, and not silence.

### The problem

You can run one agent and watch it. You can't run six — not in a chat log, which is one sequential
stream, and not in a dashboard that shows status without showing *work*.

### The idea

Your vault is the shared workspace. Agents write manifests, charters, findings and annotations
into it as markdown. You read it. You annotate it. Your annotations feed back as steering. There's
no separate agent UI to context-switch into, because **the artifacts are the interface**.

### How to use it

**Connect:** **grab MCP token** (opens your host, waits 60s, falls back to a paste modal) →
**show token fingerprint** to confirm. *Demo token* means read-only mode — the zero-signup
default, not a failure.

**Watch:** **open Live pane** — a sidebar refreshing on your interval with dashboard status, live
metrics, and active charters. Charters click straight through to the note.

**Steer:**
- **drop annotation** attaches a note-anchored annotation and posts it. Working at 2am with
  nothing running? Still recorded, and it loads as steering next session.
- **open chat panel** for a light single-shot session.
- **import system prompt** mirrors the server's prompts into your vault as notes. Annotate them
  like any other note, then **push prompt back** round-trips your edits through MCP, which commits
  them through the git serializer. **You can edit the system prompt in your notes app.**

**Direct work:** the Charters view lists active and shipped charters with a structured edit form
(declare / get / update), so the intent an agent works from is a document you edit, not a prompt
you typed once.

### About that Live pane

Three sections, and it distinguishes **three different failure modes**:

- **Tier gate** → "Sign in for full access", with the upgrade URL.
- **HTTP 404** → *"`reckon_dashboard` is not registered on this server"*, plus which contract
  revision this client speaks.
- **Anything else** → the actual error.

> Until this pass, all three rendered as the same `⚠`. The client had been renamed twice
> (`faerie_*` → `swarmy_*` → `compasscrew_*`) while the server has always registered `reckon_*`,
> so **every tool call was a guaranteed 404** — and the pane looked identical whether the server
> was down or the client was speaking a language nobody speaks. Wire names now live in one file
> (`src/reckon-contract.ts`), transcribed from the server's registry, and the smoke suite asserts
> every name the plugin sends is actually registered. A rename that only happens on the client
> isn't a rename. It's a disconnection.

---

## 6 — Chain of custody

### The problem

If agents wrote into your vault, three questions matter: **what did they write, in what order,
and can you prove it wasn't altered since?** The usual answer is a server endpoint that says
"verified ✓" — a server grading its own homework.

### The idea

**Verify in the client, and be honest about what you cannot verify.**

**CompassCrew: verify chain of custody** pulls leaves via `reckon_coc verb=tail` and verifies
locally:

```
COC CHAIN — PASS
  rows / leaves:       100 / 94 (6 telemetry skipped)
  entry-hash recipes:  current=91  legacy-pq-in-body=3
  hash failures:       0
  dangling parents:    0   (HARD FAIL — a parent that resolves nowhere is a hole)
  poisoned links:      0   (HARD FAIL — broken-writer sentinel)
  out of STORAGE order:12  (NOT a break — shards are storage, the chain is order)
  forks:               0
  signatures:          UNMEASURED — …
```

Each line encodes a lesson someone paid for.

**`out of STORAGE order: 12` is not a problem.** This is the thing most verifiers get wrong.
**Shards are storage. The chain is order.** Sequence is recovered by *replaying links*, never by
reading files in directory order. A verifier demanding line *N*'s `prev_entry_hash` equal line
*N−1*'s `entry_hash` asserts something stronger than a hash chain ever claims, and it's false by
construction for any shard whose storage order isn't its link order.

Measured over 111 real ledgers (3,900 leaves): the adjacency test reported **2,230 breaks**.
Resolving every parent against the union of all leaves *as a set* reported **zero dangling**. The
ledger was sound; the test was wrong — and the repo-wide red it produced blocked ~275 attestation
gaps, meaning a careful adversarial review and a rubber stamp produced identical output. The worst
state an audit can be in.

**`dangling parents` is the check with teeth.** A parent resolving *nowhere* is a hole and a hard
FAIL. Reachability doesn't weaken verification — it removes the noise that was drowning the signal.

**The recipe split is the point.** Leaves written before 2026-08-03 hashed with `pq_signature`
inside the body. They are **correct under the rule in force when they were written**; rewriting
them to today's recipe would forge new hashes over old bytes — the one thing a chain may never do.
So both recipes are tried and the matching one is *named*. Collapsing them would make a recipe
boundary indistinguishable from tampering.

**`signatures: UNMEASURED` is not a shrug.** Signing is post-quantum by default (ML-DSA-65), and
ed25519 leaves stamp their own `sig_body` scheme id naming exactly which body the signature covers.
An unknown scheme is **unverifiable**, never "assume current" — because trying signature-body
shapes until one verifies is precisely how a forged leaf is made to verify. So the client says so,
names the reason, and points at server-side verification.

**Three verdicts, always: PASS · FAIL · UNMEASURED-with-the-obstacle-named.** A false red costs
exactly what a false green costs, so a check that goes quiet when it can't see is the worse of the
two.

The canonical hash is cross-checked against Python's
`json.dumps(sort_keys=True, separators=(',',':'))` — `ensure_ascii` escaping and recursive key
sorting included. Not "compatible". Byte-identical. And the test suite verifies **real production
custody leaves** pulled off a live spine, so that claim is measured rather than asserted.

### Your signing key

**create signing identity** generates an Ed25519 keypair inside your vault with
`extractable: false`, held as a live WebCrypto handle in IndexedDB.

It can sign. **It cannot be exported** — not by this plugin, not by any other, because the browser
refuses the operation. The test suite asserts exactly that: it calls `exportKey` on the private
half and requires the call to *throw*. **register public key** publishes only the public half via
`reckon_pubkey verb=register`, a call with no parameter that could carry a private one.

**The cost, stated rather than hidden:** a non-extractable key can't be backed up. Clear your
browser storage and it's gone; generate a new one and re-register. That's the correct trade — *a
signing key that can be backed up is a signing key that can be stolen* — and the plugin says so at
creation time rather than letting you find out during a rotation.

**signing + spawn identity status** reports two axes as **separate rows**: which key this vault
holds, and which spawn slot this hand holds. Orthogonal facts; a banner merging them into one
green tick is reporting a verdict it never measured.

> **What this replaced.** Versions before 2.1.0 accepted a private signing key as an `obsidian://`
> **URL query parameter** and wrote it in plaintext to `.swarmy-user-key` in your vault root. A
> private key that crosses a URL is in shell history, protocol-handler logs and OS URI dispatch
> records before it reaches disk. It was also dead code — the server's rotate endpoint returns
> `{ok, token, tier, user_id}` and never returned a key. All of it is gone; a key-shaped callback
> parameter is now **refused by name** and never persisted. If you have a `.swarmy-user-key` from
> an old version, the plugin tells you at startup, and **purge legacy plaintext signing key**
> deletes it — while reminding you that deleting a file is not un-publishing a key. Rotate it.

---

## 7 — Corpus and PDF extraction

`scripts/corpus_pdf_lite.py` is the canonical extraction and generation tool, vendored
**byte-identical** from reckon-lite:

```bash
python3 scripts/corpus_pdf_lite.py deps                  # which backends do I actually have?
python3 scripts/corpus_pdf_lite.py doctor                # deeper diagnosis
python3 scripts/corpus_pdf_lite.py info    book.pdf
python3 scripts/corpus_pdf_lite.py extract book.pdf --out out/ --pages 3-9
python3 scripts/corpus_pdf_lite.py tables  paper.pdf --out tables/
python3 scripts/corpus_pdf_lite.py ocr     scan.pdf  --out out/ --lang eng
python3 scripts/corpus_pdf_lite.py gen     note.md out.pdf --engine pandoc
```

**Start with `deps`.** It reports per capability which backends are available and which are
missing, so "extraction didn't work" resolves to "you don't have pymupdf" instead of a stack trace.

`scripts/pdf_toolkit.py` keeps three verbs the lite tool lacks — `merge`, `split`, `to-images` —
and **delegates** `extract`, `ocr`, `info`, `md-to-pdf` to it. Same CLI names, one implementation.
For diacritics-preserving chapter-wise extraction (ā ē ī ō ū š ṣ ṭ ḫ ʿ ʾ ẓ ḍ ḥ),
`scripts/corpus_extract.py` splits into `text/v1-c<N>.md` with an `_extract_meta.json` recording
how. Over MCP the same surface is `reckon_pdf`.

### Why the vendoring detail matters

`corpus_pdf_lite.py` is **stdlib-only at import** — every PDF library import is function-local.
That's what makes it droppable into a repo with none of them installed: it loads, runs `deps`, and
tells you what's missing instead of dying on an import line.

It's vendored **byte-identical on purpose**, sha-verified against reckon-lite. In this ecosystem a
copy no mechanism compares is a fork that simply hasn't diverged yet — and the drift ledger in
`revenant_vendor_sync_lite.py` records what that costs when the copies are crypto-shaped: three
copies of a signer, each individually correct and consistent, silently signing as one shared
identity, with nothing erroring.

> **Not vendored, on purpose:** the Python `coc-core` package the sister repos carry isn't here.
> This is an Electron/TypeScript plugin with no Python runtime — it could never import it — and
> this repo isn't in the sync tool's scan roots, so nothing would ever compare the copy.
> `src/coc-verify.ts` is a **live port** of the three verification rules instead. A port that runs
> beats a copy that can't.

---

## Shortcuts

| Hotkey | Action |
|---|---|
| `⌘⇧H` | Highlight selection with a bearing (trail-ref) |
| `⌘⇧C` | Copy trail-ref to clipboard |
| `⌘⇧S` | Toggle all trail-refs |
| `⌘`+click | Peek destination in adjacent pane (native) |
| `⇧`+click | Collapse/expand a single trail-ref |

---

## When something doesn't work

**Read the verdict, not the vibe.** This plugin works hard to distinguish *broken* from *absent*,
and the distinction is in the message.

| You see | Means | Do |
|---|---|---|
| `UNMEASURED — <obstacle>` | The check could not look. **Not a pass, not a failure.** | Fix the named obstacle |
| `⚠ reckon_x is not registered … (404)` | Your server lacks that tool | Compare server version to the contract revision in the pane footer |
| `Sign in for full access → <url>` | Tier gate, not an error | Grab a real token, or stay in demo |
| `Demo mode — read-only` | No token; the zero-signup default | Expected unless you meant to sign in |
| `COC CHAIN — UNMEASURED` | Unreachable, or no `entries[]` returned | Not a clean chain. Fix the connection |
| `aspect_sizer … present but failed` | The optional sizer exists and is broken | A real error — fix or clear the path |
| Diagrams look oddly sized in a PDF | Aspect sizer absent (logged UNMEASURED) | Harmless; LaTeX default sizing |
| Placeholder comment where a diagram should be | Stage 3.5 couldn't fetch it | Check that block's Mermaid syntax |
| `Signing identity — UNMEASURED` | This Obsidian build's WebCrypto has no Ed25519 | Update Obsidian, or sign server-side |

**Check your own build:**

```bash
npm run verify      # typecheck + build + 41 tests + 23-assertion contract smoke
npm test            # just the vitest suites
npm run smoke       # just the wire-contract + COC smoke
```

If a check reports `UNMEASURED`, read which one — it names its obstacle. The registry cross-check
wants a reckon checkout (auto-discovered as a sibling directory, or point `RECKON_REGISTRY` at
one); the live-leaf custody tests want the same and **skip with the reason printed** rather than
passing when it's absent.

---

## Go deeper

- [Draw → AI → System: The Recursive Canvas](docs/DRAW-AI-SYSTEM.md)
- [Concepts](docs/CONCEPTS.md) · [Architecture](docs/ARCHITECTURE.md) · [Philosophy](docs/PHILOSOPHY.md)
- [`commands-canonical/coc.md`](commands-canonical/coc.md) — custody, identity, signing
- [`commands-canonical/eval.md`](commands-canonical/eval.md) — the eval surface
- [`src/reckon-contract.ts`](src/reckon-contract.ts) — the one home for every wire name
- [`src/coc-verify.ts`](src/coc-verify.ts) — the verifier, with the measurement behind each rule
- [`test/`](test/) — the harness: Obsidian mocked, WebCrypto and IndexedDB real
