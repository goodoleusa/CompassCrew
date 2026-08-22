---
description: "Show the compass overlay (N/S/E/W mission graph) for a mission, task, or the whole visible frontier, via the reckon MCP server."
argument-hint: "[mission=<name> | anchor_task_id=<id> | (nothing for full snapshot)]"
allowed-tools: mcp__reckon__*, Agent
---

Delegate to the `cartographer` subagent with the argument as context: if an `anchor_task_id` was
given, ask it to `walk` or `trace` from that anchor; if a `mission` was given, ask it for a
`snapshot` scoped to that mission; with no argument, ask for a `stats` call first to size the
graph before pulling a full `snapshot`, so a large frontier doesn't flood the response.

Render whatever `cartographer` returns as-is — do not re-fetch or recompute the graph in the
main conversation.
