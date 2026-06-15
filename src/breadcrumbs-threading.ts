import { App, Notice, Plugin, TFile } from "obsidian";
import { Bearing, BEARING_TO_BC_FIELD, BEARINGS, isBearing } from "./bearings";

/**
 * Breadcrumbs threading integration.
 *
 * Bearing → field mapping is imported from src/bearings.ts (the canonical
 * NSEW ontology module). Do NOT define mappings locally.
 *
 * This module writes TWO frontmatter forms on each bearing thread:
 *   1. Canonical NSEW key (`N`/`S`/`E`/`W`) — the structural truth.
 *   2. Breadcrumbs alias (`up`/`next`/`same`) — for the Breadcrumbs plugin
 *      to render trails (only when `emitBreadcrumbsAliases` is enabled).
 *
 * W (return-to-baseline) gets canonical W only; no alias is emitted because
 * Breadcrumbs has no native backtrack semantics and aliasing it to `up`
 * would conflate it with N.
 */

export interface BreadcrumbsThreadingSettings {
  /** Emit Breadcrumbs aliases (up/next/same) alongside canonical N/S/E/W. */
  emitBreadcrumbsAliases: boolean;
}

export const DEFAULT_BREADCRUMBS_THREADING_SETTINGS: BreadcrumbsThreadingSettings = {
  emitBreadcrumbsAliases: true,
};

function basenameNoExt(p: string): string {
  const b = p.split("/").pop() || p;
  return b.endsWith(".md") ? b.slice(0, -3) : b;
}

function appendLink(fm: Record<string, unknown>, field: string, link: string, target: string) {
  const existing = fm[field];
  if (existing == null) fm[field] = [link];
  else if (Array.isArray(existing)) {
    if (!existing.includes(link)) (existing as string[]).push(link);
  } else if (typeof existing === "string") {
    if (!existing.includes(basenameNoExt(target))) fm[field] = [existing, link];
  }
}

/**
 * Write a bearing thread to a note's frontmatter.
 *
 * Always writes the canonical NSEW key. If `emitAlias` is true and the
 * bearing has a Breadcrumbs alias (N/S/E only), also writes that alias.
 */
export async function addBreadcrumbThread(
  app: App,
  file: TFile,
  bearing: Bearing,
  targetPath: string,
  emitAlias = true,
): Promise<void> {
  const link = `[[${basenameNoExt(targetPath)}]]`;
  await app.fileManager.processFrontMatter(file, (fm) => {
    // Canonical NSEW (always)
    appendLink(fm, bearing, link, targetPath);
    // Breadcrumbs alias (skip W)
    if (emitAlias && bearing !== "W") {
      const aliasField = BEARING_TO_BC_FIELD[bearing];
      appendLink(fm, aliasField, link, targetPath);
    }
  });
}

/**
 * Read NSEW bearing links from a file's frontmatter. Prefers canonical
 * NSEW keys; falls back to Breadcrumbs aliases (up/next/same) when the
 * canonical key is absent.
 *
 * Returns a partial map keyed by bearing → array of link strings (as
 * written, e.g. `[[note]]`).
 */
export async function readBearingFrontmatter(
  app: App,
  file: TFile,
): Promise<Partial<Record<Bearing, string[]>>> {
  const out: Partial<Record<Bearing, string[]>> = {};
  const cache = app.metadataCache.getFileCache(file);
  const fm: Record<string, unknown> = (cache?.frontmatter as Record<string, unknown>) || {};
  const toArr = (v: unknown): string[] => {
    if (v == null) return [];
    if (Array.isArray(v)) return v.map(String);
    return [String(v)];
  };
  for (const b of BEARINGS) {
    const direct = toArr(fm[b]);
    if (direct.length > 0) { out[b] = direct; continue; }
    if (b === "W") continue; // no alias fallback
    const alias = BEARING_TO_BC_FIELD[b];
    const aliased = toArr(fm[alias]);
    if (aliased.length > 0) out[b] = aliased;
  }
  return out;
}

export function registerBreadcrumbsThreading(
  plugin: Plugin,
  getEmitAliases: () => boolean = () => true,
) {
  plugin.addCommand({
    id: "reckon-thread-add",
    name: "Reckon: add Breadcrumbs thread link (bearing → up/next/same)",
    callback: async () => {
      const file = plugin.app.workspace.getActiveFile();
      if (!file) { new Notice("Open a note first."); return; }
      const cb = await navigator.clipboard.readText().catch(() => "");
      const m = cb.match(/\[\[([^\]|#]+)/);
      const target = m ? m[1] : cb.trim();
      if (!target) { new Notice("Clipboard has no [[link]] or page name."); return; }
      await addBreadcrumbThread(plugin.app, file, "S", target, getEmitAliases());
      new Notice(`Threaded S → ${target}`);
    },
  });

  (plugin as any).reckonAddBreadcrumb = async (file: TFile, bearing: Bearing, dest: string) => {
    if (!isBearing(bearing)) return;
    await addBreadcrumbThread(plugin.app, file, bearing, dest, getEmitAliases());
  };

  (plugin as any).reckonReadBearings = (file: TFile) => readBearingFrontmatter(plugin.app, file);

  plugin.addCommand({
    id: "reckon-thread-open",
    name: "Reckon: open Breadcrumbs trail view",
    callback: () => {
      const anyApp = plugin.app as any;
      const candidates = ["breadcrumbs:open-trail-view", "breadcrumbs:show-trail", "breadcrumbs:open-matrix-view"];
      for (const id of candidates) {
        if (anyApp.commands?.commands?.[id]) {
          anyApp.commands.executeCommandById(id);
          return;
        }
      }
      new Notice("Breadcrumbs plugin command not found. Install/enable breadcrumbs (run Reckon: doctor).", 8000);
    },
  });
}
