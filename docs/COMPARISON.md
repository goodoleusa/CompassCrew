---
type: canon
status: crystallized
tier: comparison
last_updated: 2026-05-19T00:00:00Z
---

# Comparison — Why This Is Different

Most AI-in-Obsidian plugins solve adjacent problems. A few solve overlapping ones. None solve the same problem.

This document is the honest map. We name names. We acknowledge what each tool does well. We mark where we are *complementary* (use both), where we *partially overlap* (you'll pick one), and where the thesis genuinely diverges.

The TL;DR sits at the bottom. If you read only one line, read this:

> **Existing tools assume "AI as oracle." Hive assumes "AI as collaborator." Different problem class.**

---

## The comparison table

| Tool | Core posture | Vault role | Overlap with Hive | Verdict |
|---|---|---|---|---|
| **Smart Connections** | Semantic search over vault | Vault-as-index | None — different layer | ✅ Use both |
| **Copilot for Obsidian** | Chat panel with vault context | Vault-as-input (RAG) | Chat panel UI | ⚠️ Pick one for chat; we disagree on inputs |
| **Local GPT / Ollama** plugins | Local LLM access from Obsidian | Vault-as-input | Backend choice | ✅ Use as backend via MCP |
| **Generic RAG plugins** | Chunk + embed + retrieve | Vault-as-fuel | None — we don't do RAG | ❌ Different problem |
| **Templater** | Vault-side macro engine | Vault-as-substrate (mechanical) | Template rendering | ❌ Hive replaces with Nunjucks subset |
| **QuickAdd** | Macro-driven note creation | Vault-as-substrate (mechanical) | Macro invocation | ✅ Hive uses QuickAdd |
| **Dataview** | Queryable views over notes | Vault-as-database | View rendering | ✅ Hive uses Dataview |
| **ExcaliBrain** | Typed graph navigation | Vault-as-DAG | Compass overlay | ✅ Hive uses ExcaliBrain |
| **Breadcrumbs** | Hierarchical link navigation | Vault-as-tree | Bearing fields | ✅ Hive uses Breadcrumbs |
| **Cursor / Cline / Continue** | AI-in-IDE | Code as substrate (not vault) | None | ❌ Different domain |

---

## Smart Connections — complementary

[Smart Connections](https://smartconnections.app/) does **semantic search over your vault**: embed every note, surface "related" notes for the one you're reading, optionally chat over the retrieved set.

**What it does well:** finding notes you forgot you wrote. The embedding pass is honest RAG, locally computed, no API key required.

**Where it stops:** Smart Connections treats the vault as an *index*. The result of a session is a *retrieval*, not a durable artifact. Annotations don't route back to anything. There is no concept of a charter, a manifest, or a bearing. The graph is similarity-flat, not typed.

**Use both?** Yes. Smart Connections answers "what have I written about X?" Hive answers "what direction does this work need to go next?" Different questions; live happily side by side. Smart Connections's hover-similar-notes UX is genuinely useful even inside a Hive workflow.

---

## Copilot for Obsidian — overlap on chat, divergence on inputs

[Copilot for Obsidian](https://github.com/logancyang/obsidian-copilot) puts a chat panel in the right sidebar. You can pipe vault context into the chat (full notes, selected text, semantic search results). The UX is polished.

**What it does well:** the in-vault chat panel as a fast consult surface. We borrow the *idea* of a chat panel in [ARCHITECTURE.md](ARCHITECTURE.md#session-plane).

**Where we diverge:** Copilot's default posture is *vault-as-input*. Notes get RAG'd into the prompt; AI responds with prose. Where does the prose go? Either into the chat (ephemeral, lost) or pasted into a note (now indistinguishable from human writing, no forensic chain). The two-layer canvas does not exist.

Hive's chat panel is different:
- Nothing touches the vault filesystem until you click **Push session to vault**.
- When you push, the chat graduates into a session report, gets a manifest, joins the mission graph.
- Annotations on AI artifacts are first-class (in `Human/{date}/`), not lost in chat scrollback.
- Inputs to the AI include not just retrieved notes but the current charter, the active mission graph, recent annotations.

**Use both?** Not really. Pick one chat panel. If you want *AI as oracle*, Copilot is excellent. If you want *AI as collaborator with a forensic trail*, that's Hive.

---

## Local GPT / Ollama plugins — backend, not competitor

There are several plugins ([Local GPT](https://github.com/pfrankov/obsidian-local-gpt), [Ollama plugins](https://github.com/hinterdupfinger/obsidian-ollama)) whose job is "make my Obsidian notes talk to a local LLM."

**What they do well:** privacy. No cloud round-trip. Your text never leaves the machine.

**Where they stop:** they are *transports*. They expose an LLM endpoint to a chat panel or a command. They don't model conversations, missions, charters, or annotations. They are wires, not architecture.

**Use as backend?** Yes. Hive's MCP boundary is intentionally model-agnostic. Point your MCP server (or even a direct adapter) at Ollama, llama.cpp, vLLM — Hive doesn't care. The plugin's job is the *substrate*; the LLM is the *forager*. Different layers; compose freely.

See [ARCHITECTURE.md](ARCHITECTURE.md#mcp-boundary) for the boundary details.

---

## Generic RAG plugins — different problem class

A whole genre of plugins ("chat with your vault," "ask your notes anything," "AI second brain") follow the same recipe: chunk every note, embed, retrieve top-k on each query, stuff into the prompt, generate.

**What they do well:** answering questions over a corpus. If your vault is mostly reference material — articles, clippings, research — RAG is fine.

**Where they fail for thinking:** RAG assumes the vault is *static fuel*. The interaction is one-shot: query → retrieve → answer. There is no:
- Charter (declared intent that scopes the answer)
- Manifest (durable record of what the AI did)
- Bearing (which way the work is flowing)
- Annotation loop (your judgement re-entering the system)
- Crystallization (refining accumulated output)

If your vault is *not* a static archive but a *living record of how you think*, RAG plugins make it worse. Every query is amnesiac. Every answer evaporates. The vault doesn't grow under the interaction.

**Use both?** Not advised. Pick the model that matches what your vault actually is.

**Hive's alternative:** typed-connection navigation, not retrieval. The AI follows compass bearings through the mission graph, not similarity scores through an embedding space. The output is a manifest with a bearing, not a passage with a citation.

---

## Templater — we replace it

[Templater](https://github.com/SilentVoid13/Templater) is a powerful macro engine. We chose not to use it.

**Why not:**
- Templater needs a runtime — its JS evaluates inside Obsidian's plugin sandbox.
- Templater templates frequently break on Obsidian updates.
- Templater has no concept of *idempotent re-rendering* — re-running a template usually duplicates content.
- The community has reasonable concerns about arbitrary JS executing on note creation.

**Hive's replacement:** a vendored 303-LOC Nunjucks subset (`if`/`for`/`set`/filters). It runs as part of the plugin (no separate dependency). Blueprints render between `<!-- BLUEPRINT-BEGIN -->` / `<!-- BLUEPRINT-END -->` markers; re-rendering replaces *only* the marked region. Your prose outside the markers is sacred. Templater can't do that — by design, it owns the whole file.

**The doctor flags Templater as "consider disabling"** if both are installed. You don't *have* to remove it; the plugins don't conflict. But if you don't have another use for Templater, Hive replaces it cleanly.

---

## QuickAdd, Dataview, ExcaliBrain, Breadcrumbs — we depend on these

These four plugins are companions, not competitors. The `faerie: doctor` command will offer to install them.

- **QuickAdd** — macro invocation surface (we ship macros that call into Hive commands)
- **Dataview** — queryable rendering over frontmatter (we ship dashboards as Dataview queries)
- **ExcaliBrain** — typed graph rendering (the compass overlay uses ExcaliBrain panes)
- **Breadcrumbs** — hierarchical link rendering (bearing fields are Breadcrumbs-readable)

We chose to integrate with proven, mature plugins rather than ship our own renderers. This means Hive is small (the plugin itself is ~1.5MB built) and benefits from the companions' ongoing development.

---

## Cursor, Cline, Continue, GitHub Copilot — different domain

These are AI-in-IDE tools. They live in your code editor, not your vault. They generate code, refactor, autocomplete.

**Where the line is:** code is structured; markdown vaults are stigmergic. Code has a compiler, a type system, a test suite. Vaults have backlinks, frontmatter, and human attention. The tools optimize for very different things.

**Could you use both?** Of course — and you probably do. We use Cursor and Cline for code; Hive for thinking. Different domains.

The closest cousin in the IDE space is *Cursor's composer* (multi-file refactor with diffs), which echoes the marker-bounded re-rendering idea. The cousin in the vault space is *Latticework* (Siu & Matuschak), which we explicitly build on. See [NOVELTY.md](NOVELTY.md#related-work) for the full lineage.

---

## The thesis, restated

Every tool above optimizes for **AI as oracle**: ask a question, receive an answer, accept or reject. The vault, the IDE, the chat panel — they are all *surfaces* on which the oracle speaks.

Hive optimizes for **AI as collaborator**: declare an intent (📜 charter), the AI lays manifests under it, you annotate, the AI reads your annotations on the next pass, the work evolves. Neither party dominates. Both contributions are first-class. The substrate holds both.

This is a different problem class. We are not trying to be a better Smart Connections, or a more local Copilot, or a more powerful RAG plugin. We are trying to build the thing that does not yet exist: a **cognitive co-substrate** for human–AI co-thinking.

If you want the oracle, those tools are excellent. If you want the collaborator, that's us.

---

## How to choose, quickly

- "I want to find notes I forgot I wrote." → Smart Connections.
- "I want to chat with an LLM over my vault." → Copilot.
- "I want to run an LLM locally, full stop." → Local GPT / Ollama.
- "I want my vault to answer questions." → A RAG plugin.
- "I want my vault to be the place where I and the AI co-think durably, with a forensic trail, typed connections, and the human's judgement at the center." → Hive.

🐝 → 🌼 → 🍯
