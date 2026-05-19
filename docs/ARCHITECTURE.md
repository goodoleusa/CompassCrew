---
type: canon
status: crystallized
tier: architecture
last_updated: 2026-05-19T00:00:00Z
---

# Architecture — How the Pieces Fit

This document is the *engineer's view*. If you want the philosophy, read [PHILOSOPHY.md](PHILOSOPHY.md). If you want the grammar, read [CONCEPTS.md](CONCEPTS.md). This doc is the blueprint of how the plugin actually wires together — the planes, the boundaries, the failure modes.

---

## The two-layer canvas (the central invariant)

Everything else follows from this. Hive's vault always has **two parallel authorship streams** that share the medium (markdown) but never overwrite each other.

```
┌─────────────────────────────────────────────────────────────┐
│                         THE VAULT                            │
│  ┌───────────────────────┐    ┌───────────────────────────┐ │
│  │  AI authorship plane  │    │  Human authorship plane   │ │
│  │  00-SHARED/Daily/     │    │  Human/{date}/            │ │
│  │  forensics/manifests/ │    │  forensics/coc-human.jsonl│ │
│  │  forensics/coc.jsonl  │    │                           │ │
│  │  hash-linked, append- │    │  hash-linked, append-only │ │
│  │  only, never deleted  │    │                           │ │
│  └───────────────────────┘    └───────────────────────────┘ │
│              ↑                              ↑                │
│              │   marker-bounded re-render   │                │
│              │   <!-- BLUEPRINT-BEGIN -->   │                │
│              │   <!-- BLUEPRINT-END -->     │                │
│              └──────────────┬───────────────┘                │
│                             │                                │
│            shared markdown medium; both legible              │
└─────────────────────────────────────────────────────────────┘
```

**The invariant:** AI re-renders happen only between `BLUEPRINT-BEGIN`/`END` markers. Human prose outside those markers is sacred. Human annotations live in their own folder (`Human/`) on their own chain (`coc-human.jsonl`). AI manifests never write to `Human/`. The plugin's hook layer enforces this.

See [PHILOSOPHY.md#two-layer-canvas](PHILOSOPHY.md) for *why*.

---

## NSEW as structural invariant; ontology as display polymorphism

The four bearings (N/S/E/W) are **structurally fixed**. Every typed connection in Hive resolves to one of them. The compass is the canon.

But the *labels* and *display* are polymorphic — a separate ontology layer maps NSEW to domain-specific vocabularies. This is configured in `presets/ontology/*.json`.

```
NSEW (structural — fixed)        Ontology (display — pluggable)
─────────────────────────        ──────────────────────────────
N (north / unblock)              "prerequisite"  (engineering preset)
                                 "premise"       (philosophy preset)
                                 "source"        (OSINT preset)

S (south / ship)                 "deliverable"   (engineering)
                                 "conclusion"    (philosophy)
                                 "target"        (OSINT)

E (east / parallel)              "sibling"       (engineering)
                                 "parallel arg"  (philosophy)
                                 "co-finding"    (OSINT)

W (west / baseline)              "assumption"    (engineering)
                                 "axiom"         (philosophy)
                                 "primary src"   (OSINT)
```

The underlying graph is identical; the rendering vocabulary swaps. This is how Hive serves OSINT investigators and academic researchers and software teams without forking the compass.

---

## The blueprint engine

Blueprints are **Nunjucks-flavored templates** that render between markers. The engine is a vendored 303-LOC subset (no external `nunjucks` npm dep).

**Supported:** `if`, `for`, `set`, filters (`upper`, `lower`, `date`, `slug`, `truncate`, custom registry).

**Not supported:** macros, includes, inheritance, async. By design — the subset is small enough to audit in one sitting.

**Marker contract:**

```markdown
<!-- BLUEPRINT-BEGIN:summary -->
{{ summary }}
{% for finding in findings %}
- **{{ finding.title }}** ({{ finding.bearing }}): {{ finding.summary }}
{% endfor %}
<!-- BLUEPRINT-END:summary -->
```

**Idempotency:** running `faerie: render blueprint` over the same file with the same inputs produces byte-identical output. Re-rendering replaces *only* the content between matching `BEGIN`/`END` tags. Multiple regions per file allowed (named tags).

**74 blueprints ship** in `Blueprints/` — charter, manifest, dashboard, FFFF report, OSINT entity (Person/Organization/Domain/IP-Address), eval report, narrative design doc, financial trail, chronology, session report, and more.

---

## The MCP boundary

Hive's network surface is exactly one thing: an MCP server. Everything else is local.

```
┌────────────────┐   stdio / SSE   ┌──────────────────┐   internal   ┌─────────────┐
│ Obsidian       │ ◄─────────────► │  MCP server      │ ◄──────────► │  Faerie     │
│ Hive plugin    │   bearer token  │  (Python/FastAPI)│              │  backend    │
└────────────────┘                 └──────────────────┘              └─────────────┘
   ▲                                       ▲
   │                                       │
   ▼                                       ▼
┌────────────────┐                 ┌──────────────────┐
│ <vault>/       │                 │ forensics/       │
│ .faerie-token  │                 │ (B2 WORM backup) │
└────────────────┘                 └──────────────────┘
```

**MCP tools the plugin calls:**

| Tool | Purpose |
|---|---|
| `faerie_get_active_charters` | populate Faerie Live side panel |
| `faerie_get_mission_graph` | compass overlay, mission dashboard |
| `faerie_get_eval_dimensions` | eval dashboard |
| `faerie_post_annotation` | round-trip human annotations to server |
| `faerie_get_system_prompt` | glass-box internals (read prompt) |
| `faerie_update_system_prompt` | glass-box internals (write prompt edit) |
| `faerie_spawn_agent` | optional — spawn an agent from in-vault |
| `faerie_get_manifest_index` | check in-flight agents before spawning |

**Auth model:** bearer token (200-char base64url) stored in `<vault>/.faerie-token` (gitignored, `chmod 600`). Token obtained via GitHub OAuth at `https://faerie.retrofuture.tech`. Server validates token + the user's GitHub username is in `GITHUB_ALLOWED_USERS`. Rotation via `faerie: rotate MCP token` command.

**The boundary is the *only* network surface.** No telemetry. No usage pings. No third-party CDNs. The plugin ships with zero runtime npm dependencies — all rendering, parsing, and templating is in-tree.

---

## Local-first guarantees

The plugin works *fully* without MCP. The doctor will flag MCP as red but the offline features remain green:

| Feature | Works offline? |
|---|---|
| Trail-refs (`Cmd+Shift+H`) | ✅ |
| Compass overlay (via ExcaliBrain) | ✅ |
| Blueprint rendering | ✅ |
| Visual-language callouts | ✅ |
| Excalidraw round-trip | ✅ |
| PDF export | ✅ |
| Annotations (write to `Human/`) | ✅ |
| Crystallization pass (local-only mode) | ✅ |
| File decorator (bearings in tabs) | ✅ |
| **Faerie Live panel** | ❌ requires MCP |
| **Chat panel** | ❌ requires MCP |
| **Annotation round-trip to agents** | ❌ requires MCP |
| **Mission graph from server** | ❌ requires MCP |
| **System-prompt round-trip** | ❌ requires MCP |

Roughly 70% of the value is local. The remaining 30% is the *collaborator* layer — and it's optional, free (GitHub OAuth), and self-hostable if you want.

---

## The forensic chain

Two append-only JSONL files per repo:

**`forensics/coc.jsonl`** — AI's chain of custody:

```json
{"ts":"2026-05-19T14:32:00Z","actor":"agent:queen","artifact":"forensics/manifests/2026-05-19/mfw-validator.json","sha256":"abc123...","prev_sha":"def456..."}
```

**`forensics/coc-human.jsonl`** — your chain of custody:

```json
{"ts":"2026-05-19T22:14:00Z","actor":"human:jessica","artifact":"Human/2026-05-19/annot-on-mfw-validator.md","sha256":"789abc...","references":"forensics/manifests/2026-05-19/mfw-validator.json","references_sha":"abc123..."}
```

Each line carries:
- A timestamp.
- An actor (typed as `agent:*` or `human:*` — never confused).
- The artifact path.
- Its SHA-256.
- A back-link to the previous entry's SHA (hash-chained — tampering with one line breaks the chain forward).

Human annotations additionally carry `references` + `references_sha` — when you annotate an AI artifact, the chain records *what you were looking at and what hash it had at that moment*. If the AI re-renders later, your annotation still pins to the version you saw.

This is forensic integrity in the literal sense: an auditor years later can replay the work, see who wrote what, in what order, against what version.

---

## Crystallization enforcement (the 5 layers)

Per [CRYSTALLIZATION-DISCIPLINE.md](CRYSTALLIZATION-DISCIPLINE.md), the anti-bloat discipline runs in 5 layers:

1. **Charters as cornerstone** — manifests without `charter_ref` get flagged + retired by the validator.
2. **w4w address prefixes** — sibling manifests sharing the same 3-slot prefix are crystallization candidates.
3. **NSEW bearings (especially E)** — east-edges between sister tasks signal merge candidates.
4. **Daily folder TTL** — 30d → weekly digest; 90d → monthly; 1y → year anchor set.
5. **Eval dimension G (emergence)** — drops when bloat outpaces structure; triggers a crystallization sweep.

The layers compose. Nothing reaches `forensics/anchors/` without surviving all 5. Nothing in `forensics/ephemeral/` is ever deleted — the chain holds.

---

## The deployable architecture diagram

```
                   ┌──────────────────────────────────────┐
                   │           YOU (the keeper)           │
                   └──────────┬──────────────┬────────────┘
                              │              │
                       reads/edits        annotates
                              │              │
                              ▼              ▼
   ┌──────────────────────────────────────────────────────────────┐
   │                       OBSIDIAN VAULT                          │
   │  ┌────────────────────┐    ┌────────────────────────────┐   │
   │  │ 00-SHARED/Daily/   │    │ Human/{date}/              │   │
   │  │ (AI artifacts)     │    │ (your annotations)         │   │
   │  └────────┬───────────┘    └─────────────┬──────────────┘   │
   │           │                              │                   │
   │  ┌────────▼──────────┐    ┌──────────────▼──────────────┐   │
   │  │ forensics/coc.    │    │ forensics/coc-human.jsonl   │   │
   │  │ jsonl (AI chain)  │    │ (human chain)               │   │
   │  └────────┬──────────┘    └──────────────┬──────────────┘   │
   │           │                              │                   │
   │  ┌────────▼──────────────────────────────▼──────────────┐   │
   │  │     HIVE PLUGIN (main.js, ~1.5MB, zero npm deps)     │   │
   │  │  blueprint engine · trail-refs · compass overlay     │   │
   │  │  · annotations · crystallizer · doctor · PDF export  │   │
   │  └────────────────────────┬───────────────────────────────│   │
   └───────────────────────────┼──────────────────────────────┘
                               │ bearer token over HTTPS
                               │ (optional — local mode skips this)
                               ▼
                   ┌───────────────────────────┐
                   │     MCP SERVER            │
                   │  (Python/FastAPI on VPS,  │
                   │   self-host or hosted)    │
                   └───────────┬───────────────┘
                               │
                               ▼
                   ┌───────────────────────────┐
                   │     FAERIE BACKEND        │
                   │  mission graph · eval     │
                   │  dimensions · agent       │
                   │  orchestration · system   │
                   │  prompts · B2 WORM backup │
                   └───────────────────────────┘
```

The plugin owns the vault. The MCP server owns the network boundary. The faerie backend owns the orchestration. Each layer can be replaced independently — fork the plugin, point at a different MCP, or self-host the backend.

That's the architecture. Small surface, sharp boundaries, two-layer canvas as the central invariant. Read [PHILOSOPHY.md](PHILOSOPHY.md) for why it has to be this shape.

🐝 → 🌼 → 🍯 → 📜 → ⚓
