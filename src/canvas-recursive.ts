import { App, Notice, Plugin, TFile } from "obsidian";
import * as fs from "fs";
import * as path from "path";

/**
 * canvas-recursive — LIGHT additions to the Excalidraw canvas surface.
 *
 * Mandate (2026-05-22, agent-b cut 5): add light recursive canvas
 * elements WITHOUT bloating. The plugin already has Excalidraw setup,
 * commit-topology threading, and compass-overlay. This module layers
 * three thin affordances on top:
 *
 *   1. Status-tag UI — colour-code Excalidraw shapes by publish status
 *      using the same vocabulary as `reckon-inbox` (draft / reviewing /
 *      annotating / ready-to-publish / published).
 *   2. Card-template overlay — drop a shape, get a template preset
 *      (Decker / Parchment / Bubble) baked into its strokeColor +
 *      backgroundColor.
 *   3. Commit-to-charter — extend the existing commit-topology to also
 *      write the current canvas to forensics/charters/active/{slug}.json.
 *
 * EXPLICITLY OUT OF SCOPE (these belong on dev-mvp canvas, not Obsidian):
 *   - 5 connector styles
 *   - WebAudio chimes
 *   - Wireframe templates
 *
 * Budget: ≤300 LOC total across the plugin for this cut. This file
 * stays self-contained so it can be excised if it ever bloats.
 */

// ─── Status palette — matches `reckon-inbox` + VaultPreviewPane.jsx ──
// Default palette colors live here; vocabulary + bearing colors are
// loaded from `_meta/reckon.config.json` at plugin boot (one-place
// truth). If the config is missing or malformed, we fall back to the
// hardcoded defaults so the plugin never crashes — but the source of
// authority is the vault config.
const STATUS_PALETTE_FALLBACK: Record<string, { stroke: string; fill: string; emoji: string; label: string }> = {
  "draft":            { stroke: "#9CA3AF", fill: "#F3F4F6", emoji: "✏️", label: "Draft" },
  "reviewing":        { stroke: "#0891B2", fill: "#E0F7FA", emoji: "👁",  label: "Reviewing" },
  "annotating":       { stroke: "#D97706", fill: "#FEF3C7", emoji: "📝", label: "Annotating" },
  "ready-to-publish": { stroke: "#059669", fill: "#D1FAE5", emoji: "🚀", label: "Ready" },
  "published":        { stroke: "#7C3AED", fill: "#EDE9FE", emoji: "✅", label: "Published" },
};

// Bearing colors fallback — mirrors `_meta/reckon.config.json`.
const BEARING_COLORS_FALLBACK: Record<string, { label: string; color: string; archetype: string }> = {
  "N": { label: "unblock",  color: "#D14A8B", archetype: "NAVIGATOR" },
  "S": { label: "ship",     color: "#0E7C8A", archetype: "MAKER" },
  "E": { label: "parallel", color: "#1BA9C7", archetype: "BRIDGE" },
  "W": { label: "baseline", color: "#C9A84C", archetype: "DEEP_DIVER" },
};

// Live values populated by loadReckonConfig(); exported so callers
// always read the current config-backed values, not the fallbacks.
export let STATUS_PALETTE: Record<string, { stroke: string; fill: string; emoji: string; label: string }> = { ...STATUS_PALETTE_FALLBACK };
export let STATUS_VOCAB: string[] = Object.keys(STATUS_PALETTE_FALLBACK);
export let BEARING_COLORS: Record<string, { label: string; color: string; archetype: string }> = { ...BEARING_COLORS_FALLBACK };

/**
 * Load _meta/reckon.config.json relative to the vault root.
 * Safe to call multiple times. Falls back silently to defaults on any
 * error so the plugin never breaks on a missing or malformed config.
 */
export function loadReckonConfig(app: App): void {
  try {
    const vaultRoot = (app.vault.adapter as any).basePath
      ?? (app.vault.adapter as any).getBasePath?.();
    if (!vaultRoot) return;
    const cfgPath = path.join(vaultRoot, "_meta", "reckon.config.json");
    if (!fs.existsSync(cfgPath)) return;
    const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf-8"));

    if (Array.isArray(cfg.status_vocab) && cfg.status_vocab.length) {
      STATUS_VOCAB = cfg.status_vocab.slice();
      // Rebuild palette keys in config order. Use fallback entries for
      // any vocab term we don't have a colour for; the user can extend
      // the palette in a future config key (`status_palette`).
      const next: typeof STATUS_PALETTE = {};
      for (const s of STATUS_VOCAB) {
        next[s] = STATUS_PALETTE_FALLBACK[s]
          ?? { stroke: "#6B7280", fill: "#F9FAFB", emoji: "·", label: s };
      }
      STATUS_PALETTE = next;
    }
    if (cfg.bearing_colors && typeof cfg.bearing_colors === "object") {
      BEARING_COLORS = { ...BEARING_COLORS_FALLBACK, ...cfg.bearing_colors };
    }
  } catch (_) {
    // silent — fallbacks remain in effect
  }
}

// ─── Card-template presets — Decker / Parchment / Bubble ─────────────
export const CARD_TEMPLATES: Record<string, { stroke: string; fill: string; strokeWidth: number; roundness: { type: number } | null }> = {
  "decker":    { stroke: "#2E1A47", fill: "#FDFAF5", strokeWidth: 2, roundness: { type: 3 } },
  "parchment": { stroke: "#8B5E34", fill: "#F5E9D3", strokeWidth: 2, roundness: { type: 3 } },
  "bubble":    { stroke: "#7C5CBF", fill: "#EDE9FE", strokeWidth: 3, roundness: { type: 3 } },
};

/** Find the Excalidraw "ea" API if the Excalidraw plugin is installed. */
function getEA(app: App): any | null {
  const plugins = (app as any).plugins?.plugins;
  const exca = plugins?.["obsidian-excalidraw-plugin"];
  return exca?.ea ?? null;
}

/** Apply a status palette to selected shapes (no-op if none selected). */
async function applyStatusToSelected(app: App, status: string): Promise<void> {
  const ea = getEA(app);
  if (!ea) {
    new Notice("Excalidraw plugin not installed — status-tag canvas needs it.");
    return;
  }
  const palette = STATUS_PALETTE[status];
  if (!palette) {
    new Notice(`Unknown status: ${status}`);
    return;
  }
  try {
    ea.setView(ea.getActiveEmbeddableViewOrEditor() ?? ea.targetView);
  } catch (_) { /* tolerate */ }
  const selected = ea.getViewSelectedElements?.() ?? [];
  if (!selected.length) {
    new Notice(`No shapes selected. Select 1+ then re-run.`);
    return;
  }
  for (const el of selected) {
    el.strokeColor = palette.stroke;
    el.backgroundColor = palette.fill;
    el.fillStyle = "solid";
  }
  await ea.copyViewElementsToEAforEditing?.(selected);
  await ea.addElementsToView?.(false, true);
  new Notice(`${palette.emoji} ${selected.length} shape(s) → ${palette.label}`);
}

/** Apply a card template (Decker / Parchment / Bubble) to selected shapes. */
async function applyTemplateToSelected(app: App, tmpl: string): Promise<void> {
  const ea = getEA(app);
  if (!ea) {
    new Notice("Excalidraw plugin not installed.");
    return;
  }
  const preset = CARD_TEMPLATES[tmpl];
  if (!preset) {
    new Notice(`Unknown template: ${tmpl}`);
    return;
  }
  try {
    ea.setView(ea.getActiveEmbeddableViewOrEditor() ?? ea.targetView);
  } catch (_) { /* tolerate */ }
  const selected = ea.getViewSelectedElements?.() ?? [];
  if (!selected.length) {
    new Notice(`No shapes selected. Select 1+ then re-run.`);
    return;
  }
  for (const el of selected) {
    el.strokeColor = preset.stroke;
    el.backgroundColor = preset.fill;
    el.strokeWidth = preset.strokeWidth;
    if (preset.roundness) el.roundness = preset.roundness;
    el.fillStyle = "solid";
  }
  await ea.addElementsToView?.(false, true);
  new Notice(`Applied ${tmpl} template to ${selected.length} shape(s).`);
}

/**
 * Commit the active canvas to forensics/charters/active/{slug}.json.
 *
 * Reads the active Excalidraw file's frontmatter for `charter_slug`
 * (falls back to the file basename) and writes a charter JSON envelope
 * carrying the canvas reference + a thin shape inventory (so the
 * charter dashboard can render a preview without re-parsing the file).
 *
 * This intentionally writes through the OS filesystem (not the
 * Obsidian vault adapter) because charters live in the reckon repo's
 * forensics tree, NOT inside the vault. The path is resolved relative
 * to env var RECKON_REPO_ROOT, falling back to a sibling-repo guess.
 */
async function commitCanvasToCharter(app: App): Promise<void> {
  const file = app.workspace.getActiveFile();
  if (!file || !file.path.endsWith(".excalidraw.md")) {
    new Notice("Open an Excalidraw canvas first.");
    return;
  }
  const fm = app.metadataCache.getFileCache(file)?.frontmatter ?? {};
  const slug = (fm.charter_slug || file.basename.replace(/\.excalidraw$/, "")).toString().toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const repoRoot = process.env.RECKON_REPO_ROOT
    || path.resolve((app.vault.adapter as any).basePath || ".", "..", "gitrepos", "reckon");
  const chartersDir = path.join(repoRoot, "forensics", "charters", "active");

  try {
    if (!fs.existsSync(chartersDir)) fs.mkdirSync(chartersDir, { recursive: true });
  } catch (e: any) {
    new Notice(`Cannot create charters dir: ${e?.message ?? e}`);
    return;
  }

  // Best-effort shape inventory via Excalidraw API.
  const ea = getEA(app);
  let shapes: Array<{ id: string; type: string; strokeColor: string; backgroundColor: string }> = [];
  try {
    const els = ea?.getViewElements?.() ?? [];
    shapes = els.slice(0, 200).map((e: any) => ({
      id: String(e.id || "").slice(0, 12),
      type: String(e.type || ""),
      strokeColor: e.strokeColor || "",
      backgroundColor: e.backgroundColor || "",
    }));
  } catch (_) { /* tolerate */ }

  const charter = {
    type: "charter",
    charter_id: `canvas-${slug}-${Date.now()}`,
    cluster_prefix: (fm.cluster_prefix as string[] | undefined) ?? ["canvas", "draft", slug],
    status: (fm.status as string | undefined) ?? "declared",
    created: new Date().toISOString(),
    source_canvas: file.path,
    summary: (fm.summary as string | undefined) ?? `Canvas-derived charter committed from ${file.basename}.`,
    where_we_were: (fm.where_we_were as string | undefined) ?? "",
    where_we_are: (fm.where_we_are as string | undefined) ?? "",
    where_we_headed: (fm.where_we_headed as string | undefined) ?? "",
    canvas_shape_inventory: shapes,
  };

  const out = path.join(chartersDir, `${slug}.json`);
  try {
    fs.writeFileSync(out, JSON.stringify(charter, null, 2));
    new Notice(`✓ Charter committed: ${out}`);
  } catch (e: any) {
    new Notice(`Charter write failed: ${e?.message ?? e}`);
  }
}

/**
 * Register the LIGHT canvas additions as Obsidian commands. The user
 * invokes them through the command palette (Ctrl/Cmd-P) — no extra UI
 * surface is added to the settings tab.
 */
export function registerCanvasRecursive(plugin: Plugin): void {
  const app = plugin.app;

  // Load the one-place-truth config (_meta/reckon.config.json) so the
  // status palette + bearing colors reflect the user's edits. Falls
  // back silently to the hardcoded defaults on any error.
  loadReckonConfig(app);

  // Status commands — one per bucket.
  for (const status of Object.keys(STATUS_PALETTE)) {
    const palette = STATUS_PALETTE[status];
    plugin.addCommand({
      id: `canvas-status-${status}`,
      name: `Canvas: status → ${palette.emoji} ${palette.label}`,
      callback: () => { void applyStatusToSelected(app, status); },
    });
  }

  // Template commands — one per preset.
  for (const tmpl of Object.keys(CARD_TEMPLATES)) {
    plugin.addCommand({
      id: `canvas-template-${tmpl}`,
      name: `Canvas: apply ${tmpl} template`,
      callback: () => { void applyTemplateToSelected(app, tmpl); },
    });
  }

  // Commit-to-charter.
  plugin.addCommand({
    id: "canvas-commit-to-charter",
    name: "Canvas: commit to forensics/charters/active/",
    callback: () => { void commitCanvasToCharter(app); },
  });
}
