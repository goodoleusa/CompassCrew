/**
 * latticework.ts — Latticework-inspired UX for compasscrew artifacts in Obsidian.
 *
 * Inspired by Matthew Siu's Latticework prototype
 * (https://github.com/Siunami/Latticework, paper:
 * https://www.matthewsiu.com/Latticework). The prototype's README explicitly
 * says NOT to build on its codebase; we lift only the UX patterns.
 *
 * Four cuts, all toggleable via plugin settings:
 *
 *   A. Peek-on-hover  — hover any link to a compasscrew artifact (manifest /
 *      charter / mission-graph node / coc.jsonl#L*) with CMD/Ctrl held →
 *      destination opens in an adjacent panel without losing your place.
 *
 *   B. Inline text-references — manifest links auto-render with their
 *      dashboard_line preview instead of just the bare filename. The
 *      manifest's own one-line summary travels with the reference.
 *
 *   C. Bearing-rationale marginalia — when hovering a manifest's
 *      `navigation.course_charted` waypoint, the `rationale` field
 *      renders as a margin annotation tooltip.
 *
 *   D. Collapse/expand all references — command-palette toggle that
 *      folds every rendered text-reference to one-line or expands all.
 */
import {
  App,
  MarkdownPostProcessorContext,
  Notice,
  Plugin,
  TFile,
  HoverParent,
  HoverPopover,
} from "obsidian";

export interface LatticeworkSettings {
  latticework_peek_on_hover: boolean;
  latticework_inline_dashboard_line: boolean;
  latticework_marginalia_tooltips: boolean;
  latticework_collapsed_by_default: boolean;
}

export const DEFAULT_LATTICEWORK_SETTINGS: LatticeworkSettings = {
  latticework_peek_on_hover: true,
  latticework_inline_dashboard_line: true,
  latticework_marginalia_tooltips: true,
  latticework_collapsed_by_default: false,
};

// Path predicates — what counts as a "compasscrew artifact" for peek/inline logic.
const COMPASSCREW_ARTIFACT_PATTERNS = [
  /forensics\/manifests\//,
  /forensics\/charters\//,
  /forensics\/coc\.jsonl/,
  /forensics\/ephemeral\/.*\/manifest\.json/,
  /forensics\/mission-graph\.json/,
];

function isCompassCrewArtifact(path: string): boolean {
  return COMPASSCREW_ARTIFACT_PATTERNS.some((re) => re.test(path));
}

// Read + parse a manifest JSON file from the vault. Returns null if missing
// or unparseable — both are normal (vault might be partial).
async function readManifest(app: App, path: string): Promise<any | null> {
  const f = app.vault.getAbstractFileByPath(path);
  if (!f || !(f instanceof TFile)) return null;
  try {
    const txt = await app.vault.read(f);
    return JSON.parse(txt);
  } catch {
    return null;
  }
}

// Extract the dashboard_line + key navigation fields for inline rendering.
interface ManifestPreview {
  task_id?: string;
  mission?: string;
  dashboard_line?: string;
  bearing_assigned?: string;
  course_summary?: string;
}

function previewFromManifest(m: any): ManifestPreview {
  const nav = m?.navigation ?? {};
  return {
    task_id: m?.task_id,
    mission: m?.mission,
    dashboard_line: m?.dashboard_line,
    bearing_assigned: nav?.bearing_assigned ?? m?.bearing_assigned,
    course_summary: nav?.course_summary,
  };
}

// ─── CUT A — Peek-on-hover ────────────────────────────────────────────────
//
// Obsidian already has a "page preview" core plugin that pops a tooltip on
// hover. We register an additional "hover-link source" so the popup is
// available even outside markdown editor contexts (e.g. on rendered
// dataview tables, our own custom UI). The "Editor" source is registered
// by default; we add "compasscrew" so any element with data-hover-link-source
// = "compasscrew" gets popups.
function registerPeekOnHover(plugin: Plugin & { settings: LatticeworkSettings }) {
  if (!plugin.settings.latticework_peek_on_hover) return;

  // The hover-link-source registration is how plugins opt into the
  // built-in page-preview UX.
  (plugin.app.workspace as any).registerHoverLinkSource?.("compasscrew", {
    display: "CompassCrew artifacts",
    defaultMod: true, // require CMD/Ctrl held to peek
  });

  // Render-side: when our markdown processor wraps a compasscrew link in an
  // element with data-hover-link-source="compasscrew", Obsidian's page-preview
  // core plugin handles the rest. No additional listener needed here.
}

// ─── CUT B — Inline text-references with dashboard_line ───────────────────
//
// A markdown post-processor that, for every internal link pointing at a
// compasscrew artifact, asynchronously fetches the destination's manifest JSON,
// extracts dashboard_line, and rewrites the rendered link to a structured
// preview:
//
//   [[forensics/manifests/2026-05-23/.../task-foo.json]]
//   ↓ renders as ↓
//   📋 task-foo — "shipped the bonds contract downstream" [S]
//
// Falls back to the bare link if the manifest is missing or unparseable.
function registerInlineTextReferences(
  plugin: Plugin & { settings: LatticeworkSettings },
) {
  plugin.registerMarkdownPostProcessor(async (el, ctx: MarkdownPostProcessorContext) => {
    if (!plugin.settings.latticework_inline_dashboard_line) return;

    const links = el.querySelectorAll("a.internal-link");
    for (const a of Array.from(links) as HTMLAnchorElement[]) {
      const href = a.getAttribute("data-href") || a.getAttribute("href") || "";
      if (!href || !isCompassCrewArtifact(href)) continue;

      // Mark as a compasscrew-source for the peek-on-hover plugin
      a.setAttribute("data-hover-link-source", "compasscrew");
      a.addClass("latticework-text-ref");

      // Skip the fetch if collapsed-by-default is on — render the chip
      // form without loading manifest content (cheap pass).
      if (plugin.settings.latticework_collapsed_by_default) {
        a.addClass("latticework-collapsed");
        continue;
      }

      // Async-load manifest preview. We deliberately don't await in the
      // outer loop so multiple references on the same page load in parallel.
      void (async () => {
        const m = await readManifest(plugin.app, href);
        if (!m) return;
        const prev = previewFromManifest(m);
        if (!prev.dashboard_line && !prev.course_summary) return;

        // Replace the visible content with a structured preview.
        a.empty();
        const chip = a.createSpan({ cls: "latticework-chip" });
        if (prev.task_id) {
          chip.createSpan({ cls: "latticework-task-id", text: prev.task_id });
          chip.createSpan({ text: " — " });
        }
        if (prev.dashboard_line) {
          chip.createSpan({
            cls: "latticework-dashboard-line",
            text: prev.dashboard_line,
          });
        }
        if (prev.bearing_assigned) {
          chip.createSpan({
            cls: "latticework-bearing",
            text: ` [${prev.bearing_assigned}]`,
          });
        }
      })();
    }
  });
}

// ─── CUT C — Bearing-rationale marginalia tooltips ────────────────────────
//
// When hovering a `course_charted` waypoint reference (rendered by cut B
// or by an external source), show the `rationale` field as a tooltip /
// margin annotation. We use Obsidian's HoverPopover for the floating
// rendering rather than CSS-only tooltips so the text can be markdown.
function registerMarginaliaTooltips(
  plugin: Plugin & { settings: LatticeworkSettings },
) {
  plugin.registerMarkdownPostProcessor((el, _ctx) => {
    if (!plugin.settings.latticework_marginalia_tooltips) return;

    // Marginalia is opt-in per chip — only render if the chip carries
    // a [data-rationale] attribute (set by other compasscrew renderers that
    // know the rationale).
    const chips = el.querySelectorAll(".latticework-chip[data-rationale]");
    for (const chip of Array.from(chips) as HTMLElement[]) {
      const rationale = chip.getAttribute("data-rationale");
      if (!rationale) continue;

      chip.title = rationale; // native tooltip as fallback
      chip.addClass("latticework-has-marginalia");

      // For a richer margin-annotation render, mount a hidden span
      // alongside that becomes visible on hover via CSS.
      const margin = chip.parentElement?.createSpan({
        cls: "latticework-marginalia",
        text: rationale,
      });
      if (margin) margin.style.display = "none";
      chip.addEventListener("mouseenter", () => {
        if (margin) margin.style.display = "inline";
      });
      chip.addEventListener("mouseleave", () => {
        if (margin) margin.style.display = "none";
      });
    }
  });
}

// ─── CUT D — Collapse/expand all references ───────────────────────────────
//
// Two commands: one folds every latticework chip to its short form
// (task_id + bearing only — drops dashboard_line); one expands all back.
// Implemented via a CSS class on document.body that the chip styles react
// to. CSS classes are added in styles.css (the plugin's stylesheet).
function registerCollapseExpandCommands(
  plugin: Plugin & { settings: LatticeworkSettings },
) {
  plugin.addCommand({
    id: "latticework-collapse-all",
    name: "Latticework: collapse all references",
    callback: () => {
      document.body.addClass("latticework-collapsed-all");
      new Notice("Latticework: references collapsed");
    },
  });
  plugin.addCommand({
    id: "latticework-expand-all",
    name: "Latticework: expand all references",
    callback: () => {
      document.body.removeClass("latticework-collapsed-all");
      new Notice("Latticework: references expanded");
    },
  });
  plugin.addCommand({
    id: "latticework-toggle-collapse",
    name: "Latticework: toggle collapse/expand references",
    callback: () => {
      const had = document.body.hasClass("latticework-collapsed-all");
      if (had) {
        document.body.removeClass("latticework-collapsed-all");
        new Notice("Latticework: expanded");
      } else {
        document.body.addClass("latticework-collapsed-all");
        new Notice("Latticework: collapsed");
      }
    },
  });
}

// ─── Public entry point ───────────────────────────────────────────────────
export function registerLatticework(
  plugin: Plugin & { settings: LatticeworkSettings },
) {
  // Each cut is independently toggleable; safe to call even if the
  // corresponding setting is off (each guards on its own flag).
  registerPeekOnHover(plugin);
  registerInlineTextReferences(plugin);
  registerMarginaliaTooltips(plugin);
  registerCollapseExpandCommands(plugin);
}

// ─── Styles (consumers should @import or inline these in styles.css) ──────
export const LATTICEWORK_STYLES = `
/* Latticework — inline text-reference chips */
.latticework-text-ref {
  text-decoration: none !important;
}
.latticework-chip {
  display: inline-block;
  padding: 0 4px;
  border-left: 2px solid var(--color-accent);
  border-radius: 2px;
  background: var(--background-secondary);
  font-size: 0.9em;
  line-height: 1.4;
}
.latticework-task-id {
  font-weight: 600;
  color: var(--color-accent);
}
.latticework-dashboard-line {
  font-style: italic;
  color: var(--text-muted);
}
.latticework-bearing {
  font-family: var(--font-monospace);
  font-weight: 600;
  color: var(--text-accent);
  margin-left: 4px;
}

/* Collapse-all — drops the dashboard_line, keeps task_id + bearing */
.latticework-collapsed-all .latticework-dashboard-line {
  display: none;
}
.latticework-collapsed-all .latticework-chip::after {
  content: "…";
  color: var(--text-faint);
  margin-left: 2px;
}

/* Marginalia (cut C) — small italic side note */
.latticework-marginalia {
  display: inline;
  margin-left: 8px;
  padding: 2px 6px;
  font-size: 0.85em;
  font-style: italic;
  color: var(--text-muted);
  background: var(--background-modifier-hover);
  border-radius: 3px;
}
`;
