---
type: canon
status: crystallized
tier: concepts
last_updated: 2026-05-19T00:00:00Z
---

# Concepts — The Grammar of Bearings, Charters, and Crystals

This is the dictionary. Every term Hive uses traces back to one of these definitions. The grammar is small (≈10 primitives) and composes — once you have it, the rest of the system reads itself.

Cross-reference the visual canon at [`VISUAL-LANGUAGE.md`](https://github.com/Persistech/faerie/blob/main/forensics/glossary/VISUAL-LANGUAGE.md) for every shape, color, and motion.

---

## The four bearings (N/S/E/W)

Every connection in Hive carries a bearing. Bearings are the **typed edges** the native Obsidian graph cannot represent. They tell you *which way the current is flowing*, not just *what is connected*.

The mnemonic: **N**orth unblocks, **S**outh ships, **E**ast parallels, **W**est re-baselines.

### 🧭 N — North (unblock)

- **Color:** jasper red (`#C73E1D`)
- **Glyph:** ↑
- **Role:** prerequisite liberation
- **When to use:** this connection points to work that must clear *before* downstream can proceed
- **Example:** a manifest doing OAuth wiring has a north-edge to the unfinished schema migration that blocks it. The compass overlay renders that edge red, and a glance tells you "the auth work is blocked on schema."

### 🧭 S — South (ship)

- **Color:** emerald green (`#2E8540`)
- **Glyph:** ↓
- **Role:** deliverable momentum
- **When to use:** this connection points to the next thing that ships *because* of this work
- **Example:** a manifest finishing the eval scorer has a south-edge to the dashboard that consumes its output. Emerald edge = the path to shipped value. Follow green lines to ship.

### 🧭 E — East (parallel)

- **Color:** coral orange (`#FF8E3C`)
- **Glyph:** ↔
- **Role:** sister work, same DAG level
- **When to use:** this connection points to a peer task — independent, parallel, same mission
- **Example:** documentation and API implementation can proceed in parallel; an east-edge between them says "synchronize but don't sequence."

### 🧭 W — West (baseline)

- **Color:** amber yellow (`#FFB300`)
- **Glyph:** ←
- **Role:** return to genesis, re-seat assumptions
- **When to use:** something downstream surfaced a doubt; this edge points back to the assumption that must be re-validated
- **Example:** a failing eval triggers a west-edge to the original charter. The charter's premise needs revisiting. Amber edges are the "wait, are we sure?" lines.

A fifth informal bearing exists in OSINT contexts:

### 🧭 ? — Pollen lead (unverified)

- **Color:** cream with dotted border
- **Glyph:** ·
- **Role:** possibility, low confidence
- **When to use:** the system *might* connect here but hasn't earned the bearing yet
- **Example:** a SpiderFoot finding lists a possible domain alias; the manifest emits a `bearing: "?"` edge. Pollen leads stay dotted until promoted.

See [PHILOSOPHY.md](PHILOSOPHY.md) for why typing edges this way changes the user's relationship to the graph.

---

## 📜 Charter — the cornerstone

A **charter** is a declared statement of intent. It is the *N-prerequisite* for every manifest. No manifest is canonical unless it `charter_ref`s a real charter.

- **Emoji:** 📜
- **Primitive shape:** parchment scroll with curled corner + gold wax seal (jasper double-line border)
- **Visual:** outer ring of the compass map, anchored at the slot1-verb position
- **Lifecycle:** charters are declared by the keeper (you) or by the queen with your consent. They live in `00-SHARED/Charters/` and are git-tracked. Charters do not get crystallized away — they are the cornerstones.
- **Callout:** `> [!charter]`

**Worked example:**

```markdown
> [!charter] Ship Hive v2.1 by 2026-06-01
> Goal: cut the v2.1 release with one-click MCP token grab,
> annotation round-trip, and the new compass overlay.
> Authored: 2026-05-19, retires: 2026-06-01.
```

Every manifest written under this charter carries `charter_ref: ship-hive-v2-1`. Orphan manifests (no charter_ref) get flagged by the validator and retired. Charters are the *root* of the DAG; manifests are the *cells* that hang off them.

---

## 📌 Manifest — the work artifact

A **manifest** is the actual unit of work. Where charters declare intent, manifests record action. Every spawned agent writes exactly one manifest before terminating; the manifest is the agent's pheromone trail.

- **Emoji:** 📌
- **Primitive shape:** flat-top hexagon (honeycomb cell), status-colored fill, pinned with thumbtack head
- **Filename:** `{YYYYMMDD}T{HHMMSS}Z__{task_id}_{agent_type}_{mission}_{session_id}.json`
- **Lifecycle:** written to `forensics/ephemeral/{date}/{task_id}/` first, then promoted to `forensics/manifests/{date}/` by the post-tool-use hook. Vault mirror lands in `00-SHARED/Daily/{date}/`.
- **Callout:** none (manifests render as full notes with frontmatter, not callouts)

**Required fields:**

```yaml
---
task_id: mfw-validator-2026-05-19
charter_ref: ship-hive-v2-1
mission: hive-v2-1-release
bearing: N|S|E|W
next_mission_node:
  bearing: S
  to_label: hive-v2-1-staging-deploy
dashboard_line: "validator wired; 4/5 hooks green"
sha256: <self-hash>
---
```

The `dashboard_line` ≤80 chars is the only thing the queen reads. Everything else is for the next agent's bundle context.

---

## ⚓ Anchor — the durable principle

An **anchor** is a load-bearing constraint. Charters can be retired; anchors do not move. They are the principles that survive everything: design invariants, governance rules, foundational decisions.

- **Emoji:** ⚓
- **Primitive shape:** compass-point pin, double-weight outline
- **Visual:** rendered at cardinal-direction nailheads on the compass map
- **Lifecycle:** anchors land in `forensics/anchors/` after surviving the crystallization gate. Promotion is one-directional; demotion requires explicit `> [!charter]` proposing the change.
- **Callout:** `> [!anchor]`

**Worked example:**

```markdown
> [!anchor] Two-layer canvas is non-negotiable
> AI artifacts and human annotations occupy parallel chains.
> Neither overwrites the other. This is not a feature toggle.
```

When an agent considers a design change that would violate an anchor, the validator rejects the manifest. Anchors are the immune system.

---

## 🍯 HONEY droplet — the crystallized insight

A **HONEY droplet** is what survives the voluminous→crystallized cycle. When the crystallizer detects sibling-manifests with overlapping content, it merges them into one droplet, capped and durable.

- **Emoji:** 🍯
- **Primitive shape:** teardrop with highlight (replaces generic oval / derived attribute)
- **Visual:** amber fill, honey-colored background, droplet outline
- **Lifecycle:** minted in `forensics/honey/{date}/{slug}.md` by the crystallizer. Carries a `crystallized_from:` provenance list pointing at the manifests it superseded. HONEY droplets do not get crystallized again — they are the floor.
- **Callout:** `> [!droplet]` or `> [!honey]`

**Worked example:**

```markdown
> [!droplet] Annotation latency must stay sub-second
> Six manifests across two days converged on this: any annotation
> round-trip slower than 1s breaks the "anytime steering" promise.
> Crystallized from: mfw-annot-2026-05-17, mfw-annot-2026-05-18,
> hive-perf-2026-05-18, ...
```

A droplet is *the thing you remember*. The mess landed and dissolved; this is what's left. See [CRYSTALLIZATION-DISCIPLINE.md](CRYSTALLIZATION-DISCIPLINE.md) for the mechanism.

---

## 🐾 Trail — the path through

A **trail** is the agent's dead-reckoning journey through the mission graph. Trails are made of trail-refs (typed, peekable links) and waypoints (places the agent stopped to write).

- **Emoji:** 🐾
- **Primitive shape:** polyline with chevron at each pivot
- **Visual:** dashed line, colored at each segment by the bearing of that step
- **Lifecycle:** trails are emergent — they fall out of reading a sequence of manifests in order. The plugin renders a trail view via `faerie: trail for current note`.
- **Affordance:** highlight any phrase, `Cmd+Shift+H`, pick a bearing, drop a trail-ref. The link is colored by bearing; `Cmd+Hover` peeks the destination.

**Worked example:**

A user reads a charter. Drops a south-trail-ref into the first manifest under it. From that manifest, drops an east-trail-ref to a sister manifest. From there, a west-trail-ref back to the assumption being re-validated. The trail is now: charter → S → manifest A → E → manifest B → W → charter.assumption. The compass overlay can render this trail as an animated polyline. The agent that picks up the work tomorrow reads the trail to know how the thinking moved.

This is the *Latticework* affordance (Siu & Matuschak, 2024), extended with compass typing.

---

## ➡️ Displacement — the net motion

**Displacement** is the sum of bearings as one vector. If a session's manifests carry mostly south-bearings, the session's displacement points south. If they cancel, displacement is near zero.

- **Emoji:** ➡️
- **Primitive shape:** bold solid arrow (start → end)
- **Visual:** rendered in the session dashboard as a single thick arrow over the compass rose
- **Use:** lets you ask "did this session move the work forward?" without reading every manifest. Strong south = shipping. Strong west = re-baselining. Near zero = thrashing.

Displacement is computed by the crystallizer per session and stored as a top-level dashboard line:

```yaml
session_displacement:
  vector: [0.7S, 0.2E, 0.1W]
  magnitude: 0.74
  dominant_bearing: S
```

---

## 🎯 Alignment — faithfulness to intent

**Alignment** measures how well a manifest's output matches its charter's intent. Concentric rings: bullseye = perfect fit, outer ring = drift.

- **Emoji:** 🎯
- **Primitive shape:** concentric rings (tolerance / fit indicator)
- **Visual:** rendered on eval reports as a target glyph with the hit point
- **Use:** the eval dimension that asks "did this work *actually* serve the charter?" Distinct from "did the work succeed on its own terms" (that's dimension B, quality).

A manifest can be high-quality but low-alignment — beautifully executed work on the wrong target. The alignment ring forces the distinction.

---

## 🌼 Cross-citation droplet (pollen / stigmergy marker)

A **flower glyph** marks a stigmergic cross-citation — when two artifacts in different missions reference each other, the system drops a pollen marker between them.

- **Emoji:** 🌼
- **Primitive shape:** 5-petal flower
- **Visual:** small overlay on the compass map where cross-mission edges occur
- **Use:** lets the queen see which missions are leaking signal into which other missions. High pollen density between two missions = consider promoting the cross-edges into formal east-bearings.

---

## 🐝 Bee — the actor

- **Worker bee:** any subagent. Forages context, writes one manifest, returns.
- **Queen bee:** the main session. Lays eggs (spawns), reads dashboards, evolves the genetic code (system prompts, archetype briefs, blueprint library).
- **Visual:** worker = wings, queen = crown halo.

The keeper (you) is *not* a bee. You are the apiarist. You decide which cells get capped and which get torn down. Bees do not pretend to be you. You do not pretend to be a bee.

---

## How the grammar composes

A typical day in Hive, in the grammar:

1. You declare a 📜 **charter**: "ship v2.1 by June 1."
2. The queen 🐝👑 lays eggs — spawns four 🐝 workers.
3. Each worker writes one 📌 **manifest**, carrying a 🧭 **bearing** (N to unblock, S to ship, etc.).
4. You drop 🐾 **trail-refs** between the manifests as you read them, building a path.
5. You write 📝 **annotations** in `Human/{date}/`.
6. The crystallizer scans the day's manifests, merges siblings into 🍯 **HONEY droplets**, retires losers.
7. The dashboard shows the session's ➡️ **displacement** (mostly south = shipped) and 🎯 **alignment** (bullseye = served the charter).
8. ⚓ **Anchors** unchanged. The cornerstones hold.

That's the whole grammar. Eight primitives, four bearings, two actors. Everything else is composition.

See [ARCHITECTURE.md](ARCHITECTURE.md) for how the pieces wire together. See [VISUAL-LANGUAGE.md](https://github.com/Persistech/faerie/blob/main/forensics/glossary/VISUAL-LANGUAGE.md) for the full picture book.

🐝 → 🌼 → 🍯 → 📜 → ⚓ → 🎯
