# Mobile Optimization — swarmy-hive-plugin as your ONE mobile plugin

> **Operator constraint:** 10 plugins on Obsidian mobile = crashes. 1 solid
> plugin works. This document sets the design rules so swarmy-hive-plugin
> can be the one plugin you carry on the phone.

## The thesis

Mobile Obsidian is resource-constrained: low RAM, slow disk, no native
filesystem access (iOS), single-threaded JavaScript, plugin startup races
that cascade into crashes. Every plugin you add increases the surface
area linearly; combinations are worse than sum-of-parts.

**Strategy:** swarmy-hive-plugin absorbs the *minimum-viable*
functionality from N other plugins so you don't have to install them.
The full plugin loads on desktop; mobile loads only the subset that
actually works without crashing.

## Mobile-vs-desktop split

| Feature | Desktop | Mobile | Why |
|---|---|---|---|
| Latticework peek-on-hover | ✅ | ✅ | uses Obsidian's built-in page-preview; cheap |
| Latticework inline chips | ✅ | ✅ | async manifest reads; one read per visible chip |
| Latticework marginalia | ✅ | ✅ | pure CSS + native title attr |
| Latticework collapse/expand | ✅ | ✅ | command-palette only; toggles body class |
| Trail-refs / breadcrumbs | ✅ | ✅ | core nav UX |
| MCP bridge live view | ✅ | ⚠️ defer-load | network + JSON parsing every refresh; only init on demand |
| Chat panel | ✅ | ⚠️ defer-load | only mount when the user opens it |
| Compass overlay | ✅ | ✅ | static CSS overlay; cheap |
| Annotations | ✅ | ✅ | core feature |
| Charter dashboard | ✅ | ⚠️ defer-load | reads many files; only render when opened |
| Excalidraw setup | ✅ | ❌ skip | Excalidraw itself ships its own plugin; we just registered handlers |
| Canvas recursive | ✅ | ❌ skip | heavy DOM mutation; tanks mobile FPS |
| Design folder watcher | ✅ | ❌ skip | filesystem polling; unreliable on mobile |
| PDF export | ✅ | ❌ skip | mmdc + puppeteer dependencies; not installable on mobile |
| Native PDF export | ✅ | ❌ skip | same |
| Spiderfoot | ✅ | ❌ skip | external process; impossible on iOS |
| Linter | ✅ | ⚠️ defer-load | only run on explicit command |
| Mini-Dataview | ✅ | ✅ | self-contained renderer; cheap |
| Token grabber | ✅ | ❌ skip | uses fs APIs unavailable on mobile |
| Breadcrumbs threading | ✅ | ✅ | core nav UX |
| QuickAdd macros | ✅ | ⚠️ defer-load | only when invoked |
| System prompt setting | ✅ | ✅ | settings-only |

Net: mobile loads ~10 of 22 modules at startup; the rest defer-load on
first use OR skip entirely.

## The four mobile-optimization rules

### Rule 1 — `Platform.isMobile` gate every heavy registration

```typescript
import { Platform } from "obsidian";

// In onload():
if (!Platform.isMobile) {
  // Desktop-only — skip entirely on mobile
  registerCanvasRecursive(this);
  registerExcalidrawSetup(this);
  registerNativePdfExport(this);
  registerSpiderfoot(this);
  registerTokenGrabber(this);
  registerDesignFolder(this);
}

// Universal — load on both
registerLatticework(this);
registerTrailRefs(this);
registerCompassOverlay(this);
// etc.
```

### Rule 2 — defer-load via dynamic import

For features that are useful on mobile but expensive at startup, lazy-load
on first command invocation:

```typescript
this.addCommand({
  id: "open-chat-panel",
  name: "Swarmy: open chat panel",
  callback: async () => {
    const { mountChatPanel } = await import("./chat-panel");
    mountChatPanel(this);
  },
});
```

The module's JS isn't even parsed until the user explicitly asks. Startup
cost = 0; first-invocation cost = single import (fast on modern V8).

### Rule 3 — set `isDesktopOnly: false` in manifest BUT mark heavy features per-command

Plugin-level `isDesktopOnly: false` means Obsidian mobile WILL load us.
But each module decides whether it can run on mobile. Pattern:

```typescript
// In a heavy module's register function:
export function registerCanvasRecursive(plugin: Plugin) {
  if (Platform.isMobile) {
    // No-op on mobile; log so operator can see why it's missing
    console.log("[swarmy] canvas-recursive: skipped on mobile");
    return;
  }
  // ... full registration ...
}
```

### Rule 4 — minimize the bundled `main.js` size

Mobile parses + JITs the entire `main.js` at startup. Smaller = faster
boot = less crash surface.

```bash
# Check current size:
ls -lh main.js
# Target: <500 KB for mobile-friendly startup
```

Techniques:

- esbuild minify: `--minify --tree-shaking=true`
- Externalize Obsidian: it's already a runtime peer dep
- Lazy-import everything in Rule 2's table
- Avoid bundling vendored libraries that exist as Obsidian core plugins
  (e.g. Mermaid; don't ship our own copy if the core Mermaid plugin is
  enabled)

## What we absorb from N other plugins (the "one plugin to rule them" list)

| Other plugin you'd otherwise install | We absorb via |
|---|---|
| **Periodic Notes** | Trail-refs + Latticework chips on date-stamped notes |
| **Templater (subset)** | QuickAdd macros register Templater-style insertions; lazy-loaded |
| **Excalidraw** (full) | Skipped on mobile — Obsidian's built-in is enough on mobile; desktop gets our extension |
| **Dataview** (subset) | mini-dataview shipped vendored — basic queries work on mobile |
| **Breadcrumbs** | Native registerBreadcrumbsThreading — covers 80% of the BC plugin |
| **Page Preview** | Core Obsidian plugin already does this; we register our hover source |
| **Hover Editor** | Latticework peek-on-hover handles the swarmy use case |
| **Footnotes++** | Latticework marginalia covers footnote-style annotations |
| **Mermaid** | Use core; we don't bundle |
| **Calendar / Day Planner** | Trail-refs on daily folder paths gives 60% of value at zero cost |

That's 10 plugins absorbed into 1. Each shipped at minimum-viable scope —
not feature-parity with the original.

## Mobile-only diagnostic command

Add a "Swarmy: mobile diagnostics" command that prints to a Notice:

```
swarmy mobile status:
  modules loaded:     11/22
  modules deferred:   4 (chat-panel, charter-dashboard, linter, quickadd)
  modules skipped:    7 (canvas-recursive, excalidraw, native-pdf, ...)
  main.js size:       413 KB
  obsidian version:   1.x.x
  platform:           iOS / Android / Desktop
```

Operator can run it to see what's live on the phone vs. desktop. Helps
debug "why doesn't X work on mobile?" without crashing.

## Roadmap (when this matters)

Phase 1 — **identify what crashes today.**
On the phone, enable just swarmy-hive-plugin (no others); reload Obsidian
3 times. If it loads stably, we're in good shape. If it crashes, the
`Platform.isMobile` gating is the lever to start pulling.

Phase 2 — **defer-load the heavy modules.**
Implement Rule 2 for chat-panel, charter-dashboard, linter, quickadd.
Measure startup time before/after.

Phase 3 — **absorption pass.**
Audit other plugins the operator currently installs; for each, decide:
absorb (small subset → ship it), defer (heavy → install when needed),
or skip (mobile-incompatible → don't pretend).

Phase 4 — **the "mobile suite" setting.**
A single toggle in plugin settings: "Mobile-optimized mode (recommended
for phones/tablets)." When on:
- Skips all `Platform.isMobile=false`-gated modules even on desktop
  (for testing)
- Hides settings for skipped modules from the settings UI
- Surfaces the mobile diagnostic command in the palette
