# Hive: A Cognitive Substrate for Human–AI Co-Thinking
### A Novelty Document on the Faerie Obsidian Orchestrator
*Version 2.0.0 · Persistech · 2026*

---

## Abstract

We describe **Hive**, an Obsidian plugin that transforms a personal knowledge
vault from a *receptacle* for AI output into a *substrate* for human–AI
co-thinking. Where existing AI–note integrations follow a one-directional
paradigm — the AI produces, the human consumes — Hive establishes a
**bidirectional stigmergic loop**: humans annotate AI artifacts as margin
notes, AI agents read those annotations as routing signals, and the system's
mission graph evolves under both forms of pressure. We argue this design,
inspired by Andy Matuschak's *Latticework* (2019), Hofstadter's *strange
loops*, and biological stigmergy, constitutes a new interaction modality we
call **cognitive co-substrate**: a plane on which thought can be exchanged,
not merely transferred.

---

## 1. Motivation — the asymmetry problem

Modern AI tools render output beautifully. Modern note-taking tools store
human thought durably. The space *between* them — where ideas are tested,
qualified, doubted, extended — is poorly served.

Consider the long-time Obsidian user with a deep, link-rich vault. They
admire how AI generates content but resent the *passivity* it forces:
- AI emits a polished paragraph; the human must accept, reject, or rewrite.
- The AI has no awareness of the user's vault's idiosyncrasies, vocabulary,
  half-finished arguments, or recurring themes.
- Annotations the human writes vanish into private margins, invisible to
  the next AI session.

This is the *asymmetry problem*: AI produces but cannot listen; the vault
listens but cannot speak back. We have built two impressive instruments and
asked the human to be the entire orchestra between them.

Hive's claim: with the right plumbing, the vault itself becomes the
orchestra — and the human becomes the *conductor*, not the *transcriber*.

---

## 2. Theoretical grounding

### 2.1 Stigmergy as collaboration model

Stigmergy, originally observed in social insects (Grassé, 1959), describes
coordination via environmental markers rather than direct communication.
Ants do not message each other; they lay pheromone, and the pheromone
modulates other ants' behavior. The trail *is* the communication.

In Hive:
- **Agent manifests** = pheromone trails. An AI agent finishes work and
  drops a manifest into `forensics/manifests/{date}/`. Other agents read
  the trail to decide what to do next.
- **Human margin notes** = anti-pheromone. A human annotation on an AI
  artifact creates a routing signal: "this finding needs verification,"
  "this direction is dead," "this is the seed of something bigger."
- **Bearings (N/S/E/W)** = chemical gradients. Each manifest carries a
  compass bearing pointing to its semantic successor: N to unblock
  upstream, S to ship downstream, E to parallelize, W to return to
  baseline.

The vault is not a database; it is a *terrain* on which signals are laid
and read.

### 2.2 Latticework and the trail-ref

Matuschak's *Latticework* (2019) describes a reading interface where any
reference becomes a peekable, embeddable, bearing-aware affordance. Hive's
trail-refs extend this: every highlighted link carries a **bearing** in its
title attribute (`[text](dest "N")`). The rendered link is colored by
bearing (north = red, south = green, east = orange, west = amber); Cmd+Hover
peeks the destination; Shift+Click collapses it. The result: a document
becomes a *micro-mission-graph*, with directionality visible at a glance.

### 2.3 Strange loops between human and AI

Hofstadter (1979, 2007) describes consciousness as a strange loop — a
self-referential structure where a system's symbols refer back to the
system's own state. Hive embeds a small strange loop:

```
  human writes margin note  →  MCP records margin note
        ↑                              ↓
  next AI session reads        AI agent updates manifest
  the annotated context              based on annotation
        ↑                              ↓
   AI produces revised   ←   manifest informs spawn
        output
```

The human's annotation is not stored as commentary; it becomes *input* to
the system's next state. The loop closes. The vault, in a real sense,
*thinks back*.

---

## 3. Architecture — the five planes

Hive operates on five concurrent planes, each addressing a different
asymmetry in the human–AI relationship.

### 3.1 The blueprint plane (deterministic shape)

Blueprints are Nunjucks-flavored templates with **markers** (`<!--
BLUEPRINT-BEGIN:section -->`) that delimit AI-managed regions. Human edits
*outside* the markers are preserved across re-renders; edits *inside* the
markers are overwritten on the next pass. This solves a fundamental
problem with AI-assisted writing: how to let AI re-render *parts* of a
document without destroying the human's surrounding prose.

The shipped library contains 74 blueprints, including OSINT entity
templates (Person, Organization, Domain, IP-Address), creative-output
templates (Session-Report, Narrative-Design-Doc, Eval-Report), and
governance templates (Charter, Manifest, Dashboard). Agents read these
blueprints to understand "what shape does a Person dossier take in this
vault?" — the templates are the vault's *style guide*, expressed
executably.

### 3.2 The bearing plane (compass directionality)

Every link can carry a bearing. Every manifest carries a bearing. The
compass overlay (powered by ExcaliBrain, an existing graph plugin) renders
the current note's local DAG with bearings as colored edges. Suddenly the
question "what's blocked?" has a visual answer: the red north-edges. "What
can ship?" The green south-edges.

This is qualitatively different from a generic backlinks graph. A backlinks
graph shows *what is connected*; the bearing graph shows *which way the
current is flowing*.

### 3.3 The marginalia plane (human → AI signal)

Cmd+Shift+M opens a margin note on the current artifact. The note is
written to `00-SHARED/Marginalia/{date}/`, frontmatter-stamped with the
referenced artifact's SHA-256, then POSTed to the Faerie MCP server. The
MCP indexes margin notes by `references_ai_artifact.path`, so the next
agent working on that artifact reads the human's annotation *as part of
its bundle*.

The annotation is no longer commentary. It is **routing input**.

### 3.4 The visual-language plane (cognitive scaffolding)

Hive ships seven custom Obsidian callouts, each a metaphor with a specific
semantic role:

| Callout | Visual | Meaning |
|---|---|---|
| `> [!droplet]` | amber teardrop, honey background | a crystallized insight |
| `> [!charter]` | parchment + gold seal | a binding statement of intent |
| `> [!anchor]` | pinned compass-point | a load-bearing constraint |
| `> [!waggle]` | blue dance + vector | a direction to act on (bee waggle dance) |
| `> [!honey]` | hexagonal honey cell | crystallized knowledge to preserve |
| `> [!brood]` | pulsing border | active, in-progress work |
| `> [!propolis]` | hatched seal | a structural / governance notice |

These are not decoration. They are *thinking tools*. When the writer asks
"is this an anchor or a waggle?" — "is this a constraint that won't move
(anchor) or a direction we're being called toward (waggle)?" — the
callout taxonomy forces a small but meaningful cognitive distinction. The
language shapes the thought; the styling reinforces the language.

### 3.5 The session plane (plugin-only light sessions)

The Chat panel offers a **fully in-vault light session**: open the panel,
talk to Faerie, get markdown responses rendered in-place. Critically,
*nothing touches the vault filesystem* until the human clicks "Push session
to vault." Then — and only then — the conversation graduates into a
session report, gets committed, and joins the mission graph.

This is the *air gap with a switch*. The AI is fully available, but its
output stays ephemeral until the human chooses to make it durable. Most
AI integrations get this backwards: they save everything by default and
make the human curate after the fact. Hive inverts the polarity. **Durable
by intention, not by default.**

---

## 4. The flexibility claim

The user is not asked to choose between "AI mode" and "Obsidian mode."
There is no mode. The vault is *always* an Obsidian vault; the AI is
*always* available but never intrusive. Hive lets the user pick any
gradient between full-manual writing and full-AI assistance:

- **Manual:** ignore the plugin. Obsidian works normally.
- **Light:** use the visual-language callouts to structure thinking. No
  AI invoked.
- **Augmented:** apply a blueprint to scaffold a charter. AI generates;
  human edits outside the markers.
- **Conversational:** open the chat panel for a quick consult. Push or
  discard.
- **Deep:** spawn agents via QuickAdd macros; agents drop manifests; the
  mission graph evolves; human reviews via the Live pane.

There is no setup tax to use *less* of the plugin. Every layer is
opt-in *per artifact*.

---

## 5. The creativity claim

Several plugin choices were made specifically to *enhance creativity*, not
just productivity:

1. **Pollen leads.** OSINT findings of low confidence enter the mission
   graph as `bearing: "?"` — dotted edges, unverified. The system models
   *possibility* as a first-class type. Most AI tools collapse uncertainty
   into confident-sounding prose; Hive preserves it as graph topology.

2. **Narrative-Design-Doc blueprint.** Forces the writer to express a
   design as a *story*: human moment that motivated it, vivid specifics,
   the changed reality once shipped. Then a Mermaid diagram of the same
   shape. Two channels, one idea — a creativity multiplier.

3. **Eval-Report's verdict callout.** The score determines the callout
   type: `>= 0.85` renders as `[!honey]`, below as `[!brood]`. The
   *appearance* of the report tells you its standing. You feel the eval,
   not just read it.

4. **Honey crystallization.** The "Cap honey droplet" macro takes any
   note and freezes it into `forensics/honey/{date}/` with a
   `crystallized_from` provenance. The act of "this thought is worth
   preserving" is a single keystroke. Crystallization invites
   crystallization.

5. **System-prompt round-trip.** The user can read the actual prompt that
   shapes Faerie's behavior, annotate it in the vault, and push edits
   back as a PR. The relationship is dialogic, not opaque.

---

## 6. Commercial framing

A reasonable monetization model:

- **Free tier:** all visual-language callouts, blueprint engine (with the
  74 bundled blueprints), trail-refs, dependency doctor, file decorator,
  PDF export. Local-only. No MCP required.
- **Hive+ subscription ($5/mo):** MCP bridge (Live pane, Chat panel,
  marginalia loop, system-prompt round-trip, OSINT integration),
  hosted Faerie MCP server, monthly blueprint library updates, priority
  blueprint requests.
- **Hive Pro ($10/mo):** everything in Hive+ plus team-shared blueprint
  libraries, multi-vault federation, custom callout authoring, evaluation
  dashboard hosting, and the SpiderFoot/OSINT module with API key
  management.

Pricing rationale: the free tier is genuinely useful standalone (the
visual language and blueprints alone improve any vault). Hive+ unlocks
the *conversational* layer where the value compounds. Hive Pro serves
the prosumer / investigator / consultant who depends on the
co-thinking substrate professionally.

For comparison: Obsidian Sync is $4/mo, Obsidian Publish is $8/mo,
Notion AI is $10/mo, ChatGPT Plus is $20/mo. Hive+ at $5/mo positions
neatly *below* the AI-only tools while offering something none of them
do: a vault that remembers what you thought yesterday and lets you build
on it tomorrow, with AI as collaborator rather than ghost-writer.

---

## 7. The interaction-and-ideation thesis

The user expressed it directly: *"if there's a tool that lets me interact
and ideate, not just passively accept what AI puts out, I would love
that."*

This is the central design hypothesis. Existing AI tools optimize for
**generation quality**. Hive optimizes for **iteration affordance**.
Specifically:

- Every AI output is **marker-wrapped**, so human edits don't bounce off
  AI re-renders.
- Every margin note is **routed back** to the AI for the next pass.
- Every blueprint is **inspectable and editable**, so users can shape
  what AI is allowed to produce.
- Every session has an **explicit push-to-durable**, so transient
  ideation doesn't pollute the durable vault.
- Every link can carry a **bearing**, so the user encodes *which way to
  go next* — and the AI follows that compass.

We claim these affordances, in combination, change the user's relationship
to AI from *accepting* to *steering*. The AI becomes a navigable medium,
not a finished product.

---

## 8. Related work

- **Andy Matuschak, *Latticework*** (2019) — peekable transclusions,
  bearing-aware navigation. Hive's trail-refs.
- **Roam Research, Logseq, Obsidian** — bidirectional links as cognitive
  infrastructure. Hive layers semantics on top: bearings, blueprints,
  margin notes.
- **Templater, QuickAdd, Dataview** — vault-side automation. Hive
  deliberately uses QuickAdd (not Templater) for macro logic, and
  Dataview for queryable rendering.
- **ExcaliBrain, Juggl** — graph navigation by frontmatter field. Hive
  delegates the rendering and supplies the schema.
- **Cline, Cursor, Continue** — AI-as-IDE-assistant. These tools live in
  the editor; Hive lives in the knowledge layer.

The closest cousin in spirit is *Latticework* itself, but Latticework is
a reading affordance; Hive is a thinking substrate. The closest cousin
in mechanics is Templater + Dataview + a generic AI plugin, but those
have to be composed manually by the user; Hive ships the composition.

---

## 9. Conclusion — why this matters now

We are at an inflection point where AI generation quality is no longer
the limiting factor. The limiting factor is **how the human integrates
AI output into durable thinking**. Hive proposes one answer: make the
vault a substrate where humans and AI both lay signals, both read them,
and both evolve.

The user has kept Obsidian and AI separate for years not out of
philosophical objection but because the available integrations forced a
choice: either AI takes over (and the vault becomes a dumping ground)
or AI stays out (and the user manually shuttles ideas across the gap).
Hive offers a third path: **the vault as a co-substrate where neither
party dominates and the boundary between them is permeable, intentional,
and human-controlled.**

That, we believe, is worth $5 a month — and worth building.

---

*Faerie-Hive Plugin v2.0.0 — Persistech, 2026.*
*Repo: github.com/Persistech/faerie-hive-plugin*
