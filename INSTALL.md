# Install — Swarmy Hive Plugin

**You only need this plugin** — `swarmy-hive-plugin`. Everything that
matters is vendored inside: Breadcrumbs relations, Dataview queries,
Meta Bind buttons + inputs, Nunjucks templating, linter rules, native
PDF export, mermaid compass overlay.

**Optional plugins** (install only if you want the visual variants):

- **Excalidraw** — visual bearing-topology canvas. Without it, you lose
  the "design folder" sketching commands but the rest of the plugin
  works fine.
- **ExcaliBrain** — neural-graph compass view. Without it, the
  `Swarmy: compass overlay` command falls back to the built-in mermaid
  compass view (no install required).

That's it. Two optional plugins, one mandatory. Compare with the old
swarmy stack which needed Breadcrumbs + Dataview + Meta Bind + Linter +
Templater + Excalidraw + ExcaliBrain — seven separate installs.

---

## 5-step clone-and-go

```bash
# 1. Clone into your vault's plugins folder
cd /path/to/your/vault/.obsidian/plugins
git clone https://github.com/Persistech/swarmy-hive-plugin.git hive
cd hive

# 2. Install build deps (TypeScript + esbuild only — no runtime deps)
npm install

# 3. Build the plugin bundle (produces main.js next to manifest.json)
npm run build

# 4. Enable it in Obsidian
#    Settings → Community plugins → toggle "Restricted mode" OFF
#    → enable "Swarmy — Hive Orchestrator" in the installed plugins list

# 5. Optional: configure MCP token + URL
#    Settings → Swarmy → "Grab token from swarmy"
#    or hand-edit .swarmy-token in your vault root.
```

---

## What you get out of the box

Once the plugin is enabled, you have access to:

### Commands

Open the command palette (`Ctrl+P` / `Cmd+P`) and type "Swarmy:" to see
all available commands. Highlights:

- `Swarmy: export current note as PDF (native print dialog)` — no WSL or
  pandoc needed; uses the browser print dialog.
- `Swarmy: lint current note` and `Swarmy: lint entire vault` — vendored
  linter; no obsidian-linter peer install required.
- `Swarmy: mermaid compass (inline NSEW overlay, no external deps)` —
  inline NSEW bearing visualization rendered with mermaid.
- `Swarmy: pollinate (sketch + commit topology for any folder)` — requires
  Excalidraw; shows install prompt if absent.
- `Swarmy: render blueprint to clipboard` — Nunjucks template engine
  built-in.
- `Swarmy: doctor` — checks that everything is wired up properly.

### Codeblock processors

Drop these into any note and they render natively:

````markdown
```dataview
TABLE charter_id, status FROM "00-MISSIONS"
WHERE status = "active"
SORT created DESC
```

```dataview
LIST FROM "Charters"
WHERE startswith(file.name, "2026")
```

```dataviewjs
dv.list(dv.pages('"Manifests"').map(p => p.file.name));
```

```meta-bind
INPUT[toggle:done]
BUTTON[Promote anchor, runMcp:swarmy_anchor_promote]
BUTTON[Open dashboard, command:hive:swarmy-charter-dashboard]
```
````

Inline syntax also works:

```markdown
Status: `INPUT[toggle:done]`  Priority: `INPUT[select(option(P0), option(P1)):priority]`

Current file name is `= file.name`.

Trigger: `BUTTON[Run lint, command:hive:swarmy-lint-current-file]`
```

### Auto-rendered breadcrumbs banner

Any note with frontmatter like:

```yaml
---
up: [Parent Note]
down: [Child Note 1, Child Note 2]
same: [Sibling]
prev: [Predecessor]
---
```

gets a clickable N/S/E/W breadcrumbs panel rendered automatically at the
top of the rendered view. No configuration needed. NSEW aliases
(`north`/`south`/`east`/`west`) and Breadcrumbs aliases
(`parent`/`children`/`friends`/`previous`) are also recognized.

### MCP bridge side panel

If you have a swarmy MCP server running (`swarmy/deploy/mcp-server/`),
the plugin connects automatically. Use the side panel to view live
mission/charter status, drop annotations, and fire MCP tools from
buttons.

---

## When to install Excalidraw + ExcaliBrain

You **don't** need either of these for basic swarmy use. Install them
only when you want:

| Feature you want                                | Plugin you need |
| ----------------------------------------------- | --------------- |
| Sketch folder topology by drawing boxes         | Excalidraw      |
| Embed hand-drawn diagrams in PDF exports        | Excalidraw      |
| Neural-graph view of charter bearings           | ExcaliBrain     |
| Click-to-navigate compass with auto-positioning | ExcaliBrain     |
| Plain N/S/E/W banner on every note              | (built-in)      |
| Mermaid compass for the active note             | (built-in)      |
| Frontmatter linting                             | (built-in)      |
| Dataview queries                                | (built-in)      |
| Clickable buttons that fire MCP tools           | (built-in)      |
| PDF export (native print dialog)                | (built-in)      |

Both optional plugins install from Community Plugins in Obsidian
settings. When you invoke a command that needs one, the plugin shows you
a modal with an "Open Community Plugins" button — no need to remember
exact plugin names.

---

## Troubleshooting

- **"Swarmy doctor" reports a forbidden plugin:** you have one of the
  conflicting plugins (e.g., Templater) installed. Swarmy uses QuickAdd
  + Nunjucks instead; disable the forbidden plugin or remove it.
- **PDF export prints the sidebar:** the print stylesheet hides chrome
  but some custom themes use non-standard class names. Switch to the
  default theme for the print, or open an issue with your theme name.
- **MCP token not picked up:** verify `.swarmy-token` exists in your
  vault root and has no trailing newline issues. The token fingerprint
  in Settings → Swarmy → "MCP Token" shows the first 6 chars + sha8 for
  verification.
- **Dataview query returns nothing:** the vendored mini-dataview
  supports a subset (TABLE/LIST + FROM "folder" + WHERE compare/funcs +
  SORT field). For tag-FROM, GROUP BY, JOIN, etc., install the full
  Dataview plugin — it claims the codeblock processor first and our
  shim steps aside.

---

## License

MIT. See `LICENSE`. Third-party attributions in `THIRD_PARTY_NOTICES.md`.
