/**
 * breadcrumbs-resolver — vendored subset of obsidian-breadcrumbs.
 *
 * Source: https://github.com/SkepticMystic/breadcrumbs (MIT)
 * License: MIT (see THIRD_PARTY_NOTICES.md)
 *
 * We vendor only the YAML-frontmatter edge-resolution surface — the part
 * of Breadcrumbs that swarmy actually relies on. The upstream plugin's
 * matrix view, juggl integration, statblock, etc., are NOT included.
 *
 * Public surface:
 *   - parseRelations(frontmatter) → { up, down, same, prev }
 *   - getRelations(app, file)     → same shape, reads via metadataCache
 *   - renderRelations(rel)        → HTML/MD block for inline display
 *   - renderRelationsMd(rel)      → markdown-only block (no HTML)
 *
 * "up"/"down"/"same"/"prev" are the canonical breadcrumbs edge keys we
 * use across the swarmy charter + manifest model. NSEW aliases (north /
 * south / east / west) are accepted as fallbacks so a vault that uses
 * either convention works without re-tagging.
 */

import { App, TFile } from "obsidian";

export interface BreadcrumbsRelations {
  up: string[];
  down: string[];
  same: string[];
  prev: string[];
}

const EDGE_KEYS: Array<{ canonical: keyof BreadcrumbsRelations; aliases: string[] }> = [
  { canonical: "up",   aliases: ["up", "north", "unblocks", "parent", "parents"] },
  { canonical: "down", aliases: ["down", "south", "next", "ships", "child", "children"] },
  { canonical: "same", aliases: ["same", "east", "parallel", "sister", "friend", "friends"] },
  { canonical: "prev", aliases: ["prev", "west", "previous", "baseline", "predecessor"] },
];

/** Strip wikilink syntax from a raw frontmatter value. `[[Foo|Bar]]` → `Foo`. */
function stripLink(s: string): string {
  if (typeof s !== "string") return String(s ?? "");
  const m = s.match(/^\s*\[\[([^\]|#]+)/);
  return (m ? m[1] : s).trim();
}

/** Coerce a frontmatter value (string | string[] | undefined) into a string[]. */
function asList(v: unknown): string[] {
  if (v == null) return [];
  if (Array.isArray(v)) return v.map((x) => stripLink(String(x))).filter(Boolean);
  if (typeof v === "string") {
    // Allow comma-separated single string: "a, b, c"
    return v.split(",").map((s) => stripLink(s)).filter(Boolean);
  }
  return [];
}

/**
 * Parse a frontmatter object into canonical breadcrumbs relations.
 * Accepts both canonical keys (up/down/same/prev) and NSEW aliases
 * (north/south/east/west). Aliases are unioned; duplicates removed.
 */
export function parseRelations(fm: Record<string, unknown> | null | undefined): BreadcrumbsRelations {
  const out: BreadcrumbsRelations = { up: [], down: [], same: [], prev: [] };
  if (!fm || typeof fm !== "object") return out;

  for (const { canonical, aliases } of EDGE_KEYS) {
    const seen = new Set<string>();
    for (const a of aliases) {
      const raw = (fm as Record<string, unknown>)[a];
      for (const item of asList(raw)) {
        if (item && !seen.has(item)) {
          seen.add(item);
          out[canonical].push(item);
        }
      }
    }
  }
  return out;
}

/**
 * Resolve a file's breadcrumbs relations via Obsidian's metadataCache.
 * Returns empty arrays for any edge without frontmatter entries.
 */
export function getRelations(app: App, file: TFile): BreadcrumbsRelations {
  const fm = app.metadataCache.getFileCache(file)?.frontmatter ?? null;
  return parseRelations(fm as Record<string, unknown> | null);
}

/** Total edge count across all four directions. */
export function relationCount(r: BreadcrumbsRelations): number {
  return r.up.length + r.down.length + r.same.length + r.prev.length;
}

/**
 * Render a markdown block summarising the four edges. Suitable for
 * insertion at the top of a note as an inline breadcrumbs banner.
 * Returns an empty string if no edges exist.
 */
export function renderRelationsMd(rel: BreadcrumbsRelations, title = "Breadcrumbs"): string {
  if (relationCount(rel) === 0) return "";
  const lines: string[] = [`> [!compass] ${title}`];
  const fmtList = (items: string[]) => items.map((s) => `[[${s}]]`).join(", ");
  if (rel.up.length)   lines.push(`> - **N (up):**   ${fmtList(rel.up)}`);
  if (rel.down.length) lines.push(`> - **S (down):** ${fmtList(rel.down)}`);
  if (rel.same.length) lines.push(`> - **E (same):** ${fmtList(rel.same)}`);
  if (rel.prev.length) lines.push(`> - **W (prev):** ${fmtList(rel.prev)}`);
  return lines.join("\n") + "\n";
}

/**
 * Render an HTML block summarising the four edges, suitable for direct
 * injection into a DOM container (e.g., MarkdownPostProcessor).
 * Returns an empty string if no edges exist.
 */
export function renderRelations(rel: BreadcrumbsRelations, title = "Breadcrumbs"): string {
  if (relationCount(rel) === 0) return "";
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const row = (label: string, items: string[], color: string) => {
    if (!items.length) return "";
    const inner = items
      .map((s) => `<a class="internal-link" href="${esc(s)}">${esc(s)}</a>`)
      .join(", ");
    return (
      `<div class="swarmy-breadcrumbs-row" style="border-left:3px solid ${color};padding-left:8px;margin:2px 0;">` +
      `<strong>${label}</strong>&nbsp;${inner}</div>`
    );
  };
  const body =
    row("N (up)",   rel.up,   "#C73E1D") +
    row("S (down)", rel.down, "#2E8540") +
    row("E (same)", rel.same, "#FF8E3C") +
    row("W (prev)", rel.prev, "#3B6EA5");
  return (
    `<div class="swarmy-breadcrumbs-block" style="margin:8px 0;padding:6px 8px;border:1px solid var(--background-modifier-border);border-radius:6px;">` +
    `<div class="swarmy-breadcrumbs-title" style="font-weight:600;margin-bottom:4px;">${esc(title)}</div>` +
    body +
    `</div>`
  );
}

/**
 * Helper: resolve a file by basename via metadataCache (for downstream
 * code that wants to walk the breadcrumbs graph one hop at a time).
 * Returns null if the link cannot be resolved.
 */
export function resolveLink(app: App, fromFile: TFile, link: string): TFile | null {
  const dest = app.metadataCache.getFirstLinkpathDest(link, fromFile.path);
  return dest instanceof TFile ? dest : null;
}
