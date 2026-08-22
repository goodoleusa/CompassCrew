---
description: "Blueprint-driven document templating — list, render, or apply a named blueprint to render structured markdown into a note or doc, and merge it into an existing document via BLUEPRINT-BEGIN/END markers. Backed by the reckon MCP server's reckon_blueprint tool (free tier). Use when the user wants to generate a note from a template, apply a blueprint to a doc, or re-run a blueprint against something they've been editing."
---

# blueprints — list, render, apply

This skill is a thin client over the `reckon` MCP server's blueprint surface. There is no
template content and no rendering/merge logic in this plugin — the 85+ `.njk` blueprint
templates and the Nunjucks-subset renderer live server-side in
`runtime/mcp-server/tools/blueprint.py` (a from-scratch port of the same engine the CompassCrew
Obsidian plugin runs client-side, `src/blueprint-engine.ts` + `src/vendor/micro-njk.ts`). Every
render, list, and merge in this skill is one `reckon_blueprint` call — never improvise a template
locally.

## Tool calls

All calls go through the `reckon` MCP server already configured in this plugin's `.mcp.json`
(`https://mcp.reckon.systems/free`, no credential required).

**List available blueprints:**
```
reckon_blueprint  verb=list
# -> {ok, blueprints: [{id, title, description}], count}
```
Show the user `title` (and `description` when non-empty) rather than the raw `id` when presenting
choices; use `id` as `blueprint_id` in the calls below.

**Render a blueprint to markdown (no file write):**
```
reckon_blueprint  verb=render  blueprint_id="Honey-Crystal"  context_json="{\"crystal_of_cluster\":\"...\"}"
# -> {ok, rendered: "<markdown>", section: "Honey-Crystal"}
```
`context_json` is a JSON **object** string — the fields a blueprint's `{{ }}` placeholders
reference. Build it from whatever the user gave you (frontmatter values, a file's basename, the
current date, etc.); unset fields fall back to each template's own `| default(...)` values, so it
is fine to pass a partial context.

**Apply a blueprint into an existing note (marker-scoped merge):**
```
reckon_blueprint  verb=apply  blueprint_id="Honey-Crystal"  context_json="{...}"  existing_doc="<current file contents>"
# -> {ok, merged: "<full document>", rendered: "<just this blueprint's markdown>", section: "Honey-Crystal"}
```
`apply` splices `rendered` into `existing_doc` between
`<!-- BLUEPRINT-BEGIN:<section> --> ... <!-- BLUEPRINT-END:<section> -->` markers, replacing only
that block — everything else in `existing_doc` (a week of hand-written prose, other blueprints'
sections) is returned untouched. If the markers aren't present yet, the block is appended at the
end. Re-running `apply` with a changed `context_json` against the previous `merged` output is the
supported "re-render this blueprint, keep my edits" workflow — always pass the most recent
`merged` value back in as `existing_doc`, not the original file, or you'll lose the previous
apply's placement. Write `merged` back to the file yourself; this tool never touches disk.

## Errors

`{ok: false, error: "unknown blueprint_id: ..."}` — the id doesn't match anything from `verb=list`
(also returned for a traversal-shaped id like `../etc/passwd`, which the server rejects outright).
`{ok: false, error: "context_json must be valid JSON: ..."}` — fix the JSON, don't retry blind.
A `tier_gate` response means the endpoint changed policy — tell the user plainly, same as any
other gated `reckon_*` call; `reckon_blueprint` itself ships free-tier as of this writing.
