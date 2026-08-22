---
description: "Compass overlay / relationship graph and N/S/E/W breadcrumb threading between artifacts (manifests, charters, notes) — reads and extends the live mission graph over MCP. Use when the user asks to see how work connects, thread a bearing link, trace a lineage, or wants a graph/overlay view of the frontier."
---

# compass — bearing threading and the mission-graph overlay

CompassCrew's Obsidian client draws this as an ExcaliBrain neural graph or a mermaid diagram
inside the vault. In Claude Code there's no canvas to draw on, so this skill's job is: fetch the
real graph data from the server, then render it as a legible tree/table/mermaid block in the
response. The graph *data* — nodes, edges, bearing semantics, traversal — all comes from
`reckon_mission_graph`; nothing about the graph shape or traversal order is computed locally.

For a heavier, multi-step graph exploration, prefer delegating to the `cartographer` subagent
(`agents/cartographer.md`) so the raw JSON doesn't fill the main conversation's context.

## The four bearings

| Bearing | Meaning | Direction |
|---|---|---|
| N | unblocks / predecessor | points backward to what had to happen first |
| S | ships / downstream | points forward to what concludes this |
| E | parallel / sister | points sideways to related concurrent work |
| W | return to baseline | points back to where this thread started |

## Tool calls

```
reckon_mission_graph  verb=snapshot   days=<N> [mission=...] [bearing=N|S|E|W]
reckon_mission_graph  verb=walk       anchor_task_id=... depth=<N>
reckon_mission_graph  verb=trace      anchor_task_id=...          # ancestor chain + descendant fan-out
reckon_mission_graph  verb=stats      days=<N>                    # cheap counts only
reckon_dashboard      verb=mission_control                        # composed dashboard view
```

To add a new bearing thread between two artifacts (a manifest task, a charter, a note),
the link lives on the manifest, via:
```
reckon_manifest  verb=add  task_id=... mission=... bearing=N|S|E|W  archetype=...
```

## Rendering the overlay

After a `snapshot` or `walk` call returns `{nodes, edges, stats}`, render it as:

1. A short summary line: node/edge counts, which bearings dominate.
2. A mermaid `graph TD` block coloring edges by bearing (N=red, S=green, E=orange, W=blue is
   the CompassCrew convention used in the Obsidian client's mermaid compass view — keep it for
   visual continuity) — this is pure formatting of server-returned edges, not a layout algorithm
   the plugin invented.
3. If the result is large, summarize rather than dumping the full JSON — ask the user to narrow
   with `mission=`, `bearing=`, or a smaller `days=` window, or hand the job to `cartographer`.

## Multi-tenant scoping

The server scopes results to the caller's own manifests plus public ones (owner_filter.py, not
this plugin) — an anonymous free-tier caller sees only public graph data. If a query returns
fewer nodes than expected, that's very likely why; say so rather than implying the graph is
empty.
