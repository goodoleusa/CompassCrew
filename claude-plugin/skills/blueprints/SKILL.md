---
description: "Blueprint-driven document templating — apply a named blueprint to render structured markdown into a note or doc. NOT YET WIRED: the reckon MCP server has no blueprint-rendering tool today. Read this before attempting to render a blueprint locally."
---

# blueprints — NOT YET WIRED (read this first)

**There is no `reckon_blueprint` (or equivalent) tool on the live reckon MCP server.** Verified
against the live tool registry (`runtime/mcp-server/tools/REGISTRY.json`, 76 tools, generated
2026-07-28) and every `tools/*.py` module on 2026-08-22 — no blueprint verb exists anywhere in
the registered surface. The only blueprint-rendering code that exists at all is:

1. `blueprint-engine.ts` in the Obsidian CompassCrew client — a vendored micro-Nunjucks renderer
   plus 85 `.njk` templates, running **client-side inside the Obsidian plugin**.
2. `blueprint_resolver.py` and related hook scripts under `archive/` in the reckon monorepo —
   dead code, not registered on any FastMCP instance, not running anywhere.

## What this skill does NOT do

Do not port `blueprint-engine.ts`'s renderer, its merge-marker logic (`BLUEPRINT-BEGIN`/`END`
sections), or the `.njk` template library into this plugin to "get something working." That
would ship real product IP (the blueprint library and the render/merge engine) as client-side
code in a distributed plugin — exactly what the operator's secret-sauce directive forbids. It
would also silently diverge from whatever the server-side renderer eventually does, the same
failure mode that made the Obsidian client call three generations of wrong tool names before
`reckon-contract.ts` existed to stop it.

## What to do when a user asks for blueprint templating

Tell them plainly: blueprint tooling isn't available from this MCP server yet. Point them at
this repo's `docs/CLAUDE-PLUGIN-DESIGN.md` §3 if they want the tracked follow-up. Do not
improvise a local template, and do not silently skip the request — say what's missing.

## Proposed contract (for whoever builds `reckon_blueprint` — not implemented, not called)

This shape is a proposal only, written so this skill can be updated to call it the moment it
exists. It is not a promise about the server's actual future interface.

```
reckon_blueprint  verb=list                                    # -> {blueprints: [{id, title, description}]}
reckon_blueprint  verb=render  blueprint_id=...  context={...}  # -> {rendered: "<markdown>"}
reckon_blueprint  verb=apply   blueprint_id=...  context={...}  existing_doc="..."
                                                                 # -> {merged: "<markdown>"}
                                                                 # (server does the BEGIN/END marker
                                                                 # merge that mergeRendered() in
                                                                 # blueprint-engine.ts does locally today)
```

Once `reckon_blueprint` is real and registered, rewrite this file's frontmatter description to
drop "NOT YET WIRED" and add the same free/pro tier note the other skills carry.
