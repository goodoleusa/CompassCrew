---
description: "Ontology and vocabulary management — propose, ratify, and derive vocabulary/address entries over MCP. Use when the user wants to add a term to the shared vocabulary, review pending proposals, or derive a w4w address from a manifest."
---

# ontology — vocabulary management

Backed entirely by `reckon_vocab`. No local vocabulary store, no local ratification rule — the
server decides what's valid and who can ratify.

```
reckon_vocab  verb=propose  file=...  entry=...  [bearing_letter=N|S|E|W]  # bearing-verbs file requires this
reckon_vocab  verb=ratify   file=...  entry=...
reckon_vocab  verb=derive   manifest_json=...                             # -> w4w address
```

- `propose` — free to call; adds a candidate entry. Report back exactly what the server
  accepted or rejected (it validates shape, e.g. `bearing-verbs` proposals require
  `bearing_letter` in N|S|E|W).
- `ratify` — promotes a proposed entry to canonical. May be tier-gated depending on the vocab
  file; if the server returns a tier gate, report it rather than assuming ratify always works.
- `derive` — takes a manifest's JSON and returns its w4w (word-for-word) address. This is a
  pure lookup against the canonical vocabulary tree on the server; don't attempt to construct a
  w4w address by hand from vocabulary you've seen in past responses — request a fresh `derive`
  call so it reflects the current canonical state, not a stale local guess.

When the user wants to see the current ontology (not just propose to it), there is no dedicated
"list vocab" verb — check whether `reckon_manifest verb=list` or `reckon_dashboard` surfaces it
for the file in question, and if nothing does, say plainly that a read-only vocab listing isn't
exposed yet rather than fabricating one from `propose`/`ratify` responses.
