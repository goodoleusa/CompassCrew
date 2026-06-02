# Third-Party Notices

This plugin vendors curated subsets of several open-source projects so that
end-users only need to install **one** plugin (`swarmy-hive-plugin`) instead
of orchestrating a half-dozen community plugins. Full license text for each
upstream project is preserved here and the upstream source is linked for
attribution. None of the vendored code has been forked into a long-lived
patched branch; we re-implement the subset surface we need against the
upstream's public license.

Soft-dependencies that are NOT vendored (because they are too substantial
to embed and have legitimate independent installs) are credited at the
bottom.

---

## Vendored — bundled inside `src/vendor/` and `src/`

### micro-Nunjucks template engine

- **Upstream:** [mozilla/nunjucks](https://github.com/mozilla/nunjucks) (BSD-2-Clause)
- **Vendored at:** `src/vendor/micro-njk.ts`
- **Subset:** `{{ var }}`, `{{ var | filter }}` (default, upper, lower, length,
  join, slice, replace, date, float, int), dotted-path resolution,
  `{% if %}` / `{% else %}` / `{% endif %}`, `{% for x in xs %}` / `{% endfor %}`
  (with `loop.index`), `{% set x = ... %}`.
- **Why subset:** the full Nunjucks runtime is ~100 KB; we only need the
  template language surface used by the blueprint engine.
- **Status:** Pre-existing in plugin; documented here for completeness.

### Breadcrumbs (relations resolver)

- **Upstream:** [SkepticMystic/breadcrumbs](https://github.com/SkepticMystic/breadcrumbs) (MIT)
- **Vendored at:** `src/vendor/breadcrumbs-resolver.ts`
- **Subset:** YAML frontmatter edge parsing for `up`/`down`/`same`/`prev`
  (with NSEW aliases `north`/`south`/`east`/`west` and additional aliases
  `parent`/`children`/`friends`/`previous`). Two render surfaces:
  `renderRelations` (HTML for in-document banner) and `renderRelationsMd`
  (markdown for clipboard). Single-link resolution via Obsidian's
  `metadataCache.getFirstLinkpathDest`.
- **Why subset:** the full Breadcrumbs plugin ships a matrix view, juggl
  integration, statblock, and a settings dialect that we don't use. The
  swarmy charter+manifest model touches only the YAML-edge surface, so we
  vendor just that.
- **Status:** New 2026-05-21.

### Dataview (mini query engine)

- **Upstream:** [blacksmithgu/obsidian-dataview](https://github.com/blacksmithgu/obsidian-dataview) (MIT)
- **Vendored at:** `src/vendor/mini-dataview.ts`
- **Subset:**
  - Codeblock processor for ` ```dataview ` blocks
  - Query forms: `TABLE field1, field2 FROM "folder" WHERE ... SORT ...`
    and `LIST FROM "folder" WHERE ... SORT ...`
  - WHERE: `=`, `!=`, `<`, `<=`, `>`, `>=` comparisons; `startswith(...)`,
    `endswith(...)`, `contains(...)` functions; AND-combined clauses only
  - SORT: single field, ASC/DESC
  - Fields: frontmatter dotted paths + `file.name`, `file.path`,
    `file.mtime`, `file.ctime`, `file.size`, `file.ext`
  - Inline `` `= file.name` `` rendering inside paragraphs (markdown
    post-processor walks text nodes)
  - Minimal `dataviewjs` codeblock support with sandboxed `dv` API
    (`dv.pages`, `dv.current`, `dv.paragraph`, `dv.list`, `dv.table`,
    `dv.header`)
- **Intentionally omitted:** GROUP BY, FLATTEN, JOIN, tag-FROM, link-FROM,
  inline DQL beyond `= field`, calendar view, full DataviewJS API.
- **Why subset:** the full Dataview plugin is a substantial dependency.
  Swarmy vault templates only use the patterns above, so vendoring this
  subset removes a mandatory peer install.
- **Status:** New 2026-05-21.

### Meta Bind (input + button shim)

- **Upstream:** [mProjectsCode/obsidian-meta-bind-plugin](https://github.com/mProjectsCode/obsidian-meta-bind-plugin) (MIT)
- **Vendored at:** `src/meta-bind.ts`
- **Subset:** `INPUT[toggle:field]`, `INPUT[text:field]`,
  `INPUT[number:field]`, `INPUT[select(option(a), option(b)):field]`,
  `BUTTON[label]`, `BUTTON[label, command:command-id]`,
  `BUTTON[label, runMcp:tool_name]`. Both ` ```meta-bind ``` ` codeblocks
  and inline backtick syntax `` `INPUT[...]` `` `` `BUTTON[...]` ``.
- **Intentionally omitted:** view fields, JS expressions, image controls,
  sliders, custom styling beyond default Obsidian buttons, reactive
  metadata-change bindings.
- **Why subset:** the user uses Meta Bind buttons to fire scripts and MCP
  tools inside the vault. Vendoring the minimal button + frontmatter
  binding surface keeps clickable dashboards working without a peer
  install.
- **Status:** New 2026-05-21.

### Linter rules

- **Upstream inspiration:** [platers/obsidian-linter](https://github.com/platers/obsidian-linter) (MIT)
- **Vendored at:** `src/linter.ts`
- **Subset:** This is a pared-down re-implementation, not a code fork. We
  ship seven curated rules tuned for swarmy frontmatter conventions:
  required-fields auto-fill, canonical-key-order, trim-trailing-whitespace,
  collapse-blank-lines, newline-at-EOF, blank-line-before-heading,
  bullet-dash-style. All toggleable in settings. Two commands:
  `Swarmy: lint current note` and `Swarmy: lint entire vault`.
- **Why vendor:** obsidian-linter is one of the most-rule-toggled plugins
  in the ecosystem. By shipping a curated default ruleset, swarmy vaults
  conform without per-rule configuration friction.
- **Status:** New 2026-05-21.

### Native PDF export (print stylesheet)

- **Vendored at:** `src/native-pdf-export.ts`
- **Subset:** No upstream — this is original code. We document it here so
  the THIRD_PARTY_NOTICES audit ritual catches all "rendering paths" that
  ship in the plugin. Uses `window.print()` with a transient print
  stylesheet override; the user picks "Save as PDF" in the OS print
  dialog.
- **Status:** New 2026-05-21.

---

## Soft-dependencies — NOT vendored, optional install

These plugins are credited because swarmy integrates with them when
present. The plugin gracefully degrades when they are absent — no command
fails; the user sees a notice + install prompt.

### Excalidraw

- **Upstream:** [zsviczian/obsidian-excalidraw-plugin](https://github.com/zsviczian/obsidian-excalidraw-plugin) (MIT)
- **Integration points:** PDF export (Excalidraw → PNG embedding),
  design-folder (`pollinate`, `scan and propose bearings`, `auto-layout`),
  excalidraw-setup module.
- **Behaviour if absent:** Each command checks
  `app.plugins.plugins["obsidian-excalidraw-plugin"]` at invocation time.
  If absent, the user sees a `Notice` + a modal with a button that opens
  the Community Plugins page. The command exits cleanly without crashing.
- **Why not vendored:** Excalidraw is a substantial Electron-grade canvas
  application (~MBs of code). Vendoring it would bloat the plugin and
  duplicate effort with no upside; users who want canvas drawing already
  install it.

### ExcaliBrain

- **Upstream:** [zsviczian/excalibrain](https://github.com/zsviczian/excalibrain) (MIT)
- **Integration points:** Compass overlay (neural-graph bearings view in
  `src/compass-overlay.ts`).
- **Behaviour if absent:** The `Swarmy: compass overlay` command checks
  `app.plugins.plugins["excalibrain"]` at invocation. If absent, it
  gracefully degrades to the **built-in vendored mermaid compass view**
  (`Swarmy: mermaid compass`) — a `mermaid graph TD` rendering of NSEW
  frontmatter, no external dependency. Users see a notice explaining the
  fallback.
- **Why not vendored:** ExcaliBrain depends on Excalidraw and ships a
  large neural-graph layout engine. Mermaid covers the basic case for
  free.

---

## Outbound integrations (services, not vendored code)

These are listed for completeness; they are services the plugin talks to,
not code it includes. No vendoring or attribution is technically required,
but transparency matters.

### Sigstore (signing / verification, optional)

- **Upstream:** [sigstore/sigstore](https://github.com/sigstore/sigstore-js) (Apache-2.0)
- **Use:** When the swarmy MCP server is configured for sigstore-based
  artifact signing, the plugin's MCP bridge surfaces signed-artifact
  verification status. No sigstore code is bundled in the plugin; the
  signing happens server-side. The plugin only displays the resulting
  verification badge.

### IPFS (content addressing, optional)

- **Upstream:** [ipfs/kubo](https://github.com/ipfs/kubo) (Apache-2.0 / MIT)
- **Use:** Optional content-addressed reference resolution for trail-refs
  and citations. The plugin emits CIDs as plain text; no IPFS client is
  embedded. Resolution happens server-side via the MCP gateway.

---

## License summary

| Project              | License      | Vendored | Subset only |
| -------------------- | ------------ | -------- | ----------- |
| Nunjucks             | BSD-2-Clause | Yes      | Yes         |
| Breadcrumbs          | MIT          | Yes      | Yes         |
| Dataview             | MIT          | Yes      | Yes         |
| Meta Bind            | MIT          | Yes      | Yes         |
| obsidian-linter      | MIT          | Inspired | Re-impl.    |
| Excalidraw           | MIT          | No       | Soft-dep    |
| ExcaliBrain          | MIT          | No       | Soft-dep    |
| Sigstore (sigstore-js) | Apache-2.0 | No       | Service     |
| IPFS (kubo)          | Apache-2.0/MIT | No     | Service     |

Original-license texts are preserved in the upstream repositories. Per
MIT/BSD-2-Clause requirements, all attribution is recorded above and the
copyright notices stay with the upstream sources.

If you ship swarmy-hive-plugin in a downstream distribution, please
preserve this `THIRD_PARTY_NOTICES.md` file.
