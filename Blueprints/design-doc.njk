---
type: design-doc
status: draft
created: {{ file.ctime | moment("YYYY-MM-DD") }}
updated: {{ file.mtime | moment("YYYY-MM-DD") }}
tags: [design, decision]
title: "{{ file.basename }}"
components_affected: []
parent: []
sibling: []
child: []
blueprint: "[[System-Design.blueprint]]"
memory_lane: inbox
promotion_state: capture
doc_hash: sha256:pending
hash_ts: {{ file.ctime | moment("YYYY-MM-DDTHH:mm:ssZ") }}
hash_method: body-sha256-v1
---

# {{ file.basename }}

```dataviewjs
// Auto-TOC with section map
const content = await dv.io.load(dv.current().file.path);
const lines = content.split('\n');
const headers = [];
let id = 0, inBlock = false;
for (const line of lines) {
    if (line.startsWith('```')) { inBlock = !inBlock; continue; }
    if (inBlock) continue;
    const m = line.match(/^(#{2,4})\s+(.+)$/);
    if (m) headers.push({ level: m[1].length, text: m[2].replace(/[`*[\]]/g,'').trim(), id:'N'+(id++) });
}
const FILL = { 2:'#D4A843', 3:'#4ECDC4', 4:'#93C572' };
let mmd = '```mermaid\ngraph LR\n';
headers.forEach(h => {
    const lbl = h.text.length > 25 ? h.text.slice(0,22)+'…' : h.text;
    mmd += `  ${h.id}["${lbl}"]\n  style ${h.id} fill:${FILL[h.level]||'#aaa'},color:#1a1a2e\n`;
});
const stack = [];
headers.forEach(h => {
    while (stack.length && stack[stack.length-1].level >= h.level) stack.pop();
    if (stack.length) mmd += `  ${stack[stack.length-1].id} --> ${h.id}\n`;
    stack.push(h);
});
mmd += '```';
dv.paragraph(mmd);
```

---

{% section "Problem" %}
<!-- What are we trying to solve? What breaks without this? 2-4 sentences. -->
{% endsection %}

{% section "Constraints" %}
- <!-- What can we NOT do? -->
- <!-- What must stay the same? -->
- <!-- Time, budget, or compatibility limits -->
{% endsection %}

{% section "Design" %}

### Approach

<!-- The chosen solution in plain language. What does it do? How does it work? -->

### Flow

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {'lineColor': '#D4A843', 'background': '#1a1a2e'}}}%%
graph LR
    classDef gold fill:#D4A843,stroke:#1a1a2e,color:#1a1a2e
    classDef teal fill:#4ECDC4,stroke:#1a1a2e,color:#1a1a2e
    classDef pist fill:#93C572,stroke:#1a1a2e,color:#1a1a2e

    A([Input]):::gold --> B[Process]:::teal --> C([Output]):::pist
```

### What Changes

| Before | After |
|--------|-------|
| | |

{% endsection %}

{% section "Alternatives Considered" %}

| Option | Why rejected |
|--------|-------------|
| | |

{% endsection %}

{% section "Decisions" %}
- **{{ moment().format('YYYY-MM-DD') }}** —
{% endsection %}

{% section "Open Questions" %}
- [ ]
- [ ]
{% endsection %}

{% section "Annotations" %}
<!-- Human notes, corrections, ideas — append-only -->
{% endsection %}
