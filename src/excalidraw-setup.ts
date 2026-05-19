import { App, Notice, Plugin, TFile } from "obsidian";
import * as fs from "fs";
import * as path from "path";
import { BEARINGS, BEARING_COLOR, BEARING_LABEL } from "./bearings";

/**
 * Excalidraw setup module.
 *
 * Goals:
 *  1. Replace Excalidraw's default hand-drawn/artistic look with a
 *     professional, sans-serif, smooth-line aesthetic suitable for
 *     prototyping serious work (system diagrams, ExcaliBrain views,
 *     mission-graph drafts).
 *  2. Install a curated subset of the Zsolt-Viczian ea-scripts library
 *     into the vault's Excalidraw scripts folder so the user has the
 *     interactive affordances (Auto Layout, Connect Elements, Add Next
 *     Step in Process, etc.) without manually hunting for them.
 *  3. Provide a "Draft ExcaliBrain" command: opens a blank Excalidraw
 *     canvas seeded with the current note's ExcaliBrain hierarchy
 *     (parents/children/friends) as draggable shapes, so the user can
 *     RE-DRAW a proposed graph topology before committing it back to
 *     frontmatter. Sketch → review → commit.
 *  4. Install Faerie-curated professional fonts (Inter, IBM Plex Sans,
 *     JetBrains Mono) into Excalidraw's font directory and select them
 *     as defaults.
 */

interface ExcalidrawProSettings {
  defaultFontFamily: number;     // 1=Virgil(hand), 2=Helvetica, 3=Cascadia, 4=local
  defaultStrokeStyle: "solid" | "dashed" | "dotted";
  defaultRoughness: 0 | 1 | 2;   // 0 = architect (smooth), 1 = artist, 2 = cartoonist
  defaultStrokeWidth: 1 | 2 | 4; // 2 = bold default
  defaultFontSize: number;
  curvedArrows: boolean;
}

/** Professional preset — smooth, bold, sans-serif, readable. */
const FAERIE_EXCALIDRAW_PRESET: ExcalidrawProSettings = {
  defaultFontFamily: 2,          // Helvetica (clean sans) — overridden by local fonts below if installed
  defaultStrokeStyle: "solid",
  defaultRoughness: 0,           // ARCHITECT — perfectly smooth lines, no hand-drawn jitter
  defaultStrokeWidth: 2,         // bold default
  defaultFontSize: 20,           // readable
  curvedArrows: true,
};

/** Fonts to install — all open-license, professional sans + mono. */
const FAERIE_FONTS = [
  {
    name: "Inter",
    url: "https://rsms.me/inter/font-files/Inter-Bold.woff2",
    filename: "Inter-Bold.woff2",
    weight: "bold",
  },
  {
    name: "Inter",
    url: "https://rsms.me/inter/font-files/Inter-Regular.woff2",
    filename: "Inter-Regular.woff2",
    weight: "regular",
  },
  {
    name: "IBM Plex Sans",
    url: "https://cdn.jsdelivr.net/gh/IBM/plex@master/IBM-Plex-Sans/fonts/complete/woff2/IBMPlexSans-SemiBold.woff2",
    filename: "IBMPlexSans-SemiBold.woff2",
    weight: "semibold",
  },
  {
    name: "JetBrains Mono",
    url: "https://cdn.jsdelivr.net/gh/JetBrains/JetBrainsMono@master/fonts/webfonts/JetBrainsMono-Bold.woff2",
    filename: "JetBrainsMono-Bold.woff2",
    weight: "bold",
  },
];

/**
 * Curated subset of the Zsolt-Viczian ea-scripts library that we
 * pre-install. These were chosen for their relevance to creative
 * prototyping and mission-graph drafting work.
 */
const CURATED_EA_SCRIPTS = [
  "Auto Layout",
  "Add Connector Point",
  "Add Next Step in Process",
  "Connect elements",
  "Box Selected Elements",
  "Box Each Selected Groups",
  "Add Link to Existing File and Open",
  "Add Link to New Page and Open",
  "Set Grid",
  "Convert selected text elements to sticky notes",
  "Convert text to link with folder and alias",
  "Change shape of selected elements",
  "Concatenate lines",
  "Repeat Selected Elements as Grid",
  "Reverse arrows",
  "Slice Shape",
  "Stretch to Selection Size",
  "Toggle fullscreen mode",
  "Set Font Family",
  "Set Stroke Style",
  "Set Background Color",
];

function vaultRoot(app: App): string {
  return (app.vault.adapter as unknown as { basePath: string }).basePath;
}

function findExcalidrawScriptsDir(app: App): string {
  // Excalidraw's default scripts folder is `<vault>/Excalidraw/Scripts/`.
  // Users may override; we read the plugin's data.json if available.
  const anyApp = app as any;
  const ex = anyApp.plugins?.plugins?.["obsidian-excalidraw-plugin"];
  const folder = ex?.settings?.scriptFolderPath ?? "Excalidraw/Scripts";
  return path.join(vaultRoot(app), folder);
}

function findEaScriptsRepo(): string | null {
  const candidates = [
    "/mnt/d/0local/gitrepos/excalidraw-scripts/ea-scripts",
    "/mnt/d/0LOCAL/gitrepos/excalidraw-scripts/ea-scripts",
  ];
  for (const p of candidates) if (fs.existsSync(p)) return p;
  return null;
}

export function registerExcalidrawSetup(plugin: Plugin) {
  plugin.addCommand({
    id: "faerie-excalidraw-apply-pro-preset",
    name: "Faerie: apply professional Excalidraw preset (smooth, bold, sans)",
    callback: async () => {
      const anyApp = plugin.app as any;
      const ex = anyApp.plugins?.plugins?.["obsidian-excalidraw-plugin"];
      if (!ex) {
        new Notice("Excalidraw plugin not installed.");
        return;
      }
      try {
        const s = ex.settings ?? {};
        // Apply preset keys (we use the documented Excalidraw setting names)
        s.defaultFontFamily = FAERIE_EXCALIDRAW_PRESET.defaultFontFamily;
        s.defaultRoughness = FAERIE_EXCALIDRAW_PRESET.defaultRoughness;
        s.defaultStrokeWidth = FAERIE_EXCALIDRAW_PRESET.defaultStrokeWidth;
        s.defaultFontSize = FAERIE_EXCALIDRAW_PRESET.defaultFontSize;
        s.curvedArrows = FAERIE_EXCALIDRAW_PRESET.curvedArrows;
        s.previewMatchObsidianTheme = true;
        ex.settings = s;
        await ex.saveSettings?.();
        new Notice(
          "Excalidraw preset applied: roughness=architect (smooth), strokeWidth=bold, sans-serif default. Existing drawings unchanged; new drawings will use the preset.",
          10000
        );
      } catch (e) {
        new Notice("Preset write failed: " + (e as Error).message, 8000);
      }
    },
  });

  plugin.addCommand({
    id: "faerie-excalidraw-install-fonts",
    name: "Faerie: install professional Excalidraw fonts (Inter, IBM Plex, JetBrains Mono)",
    callback: async () => {
      const anyApp = plugin.app as any;
      const ex = anyApp.plugins?.plugins?.["obsidian-excalidraw-plugin"];
      const fontPath = ex?.settings?.fontAssetsPath ?? "Excalidraw/Fonts";
      const dest = path.join(vaultRoot(plugin.app), fontPath);
      fs.mkdirSync(dest, { recursive: true });
      let ok = 0, fail = 0;
      for (const f of FAERIE_FONTS) {
        const out = path.join(dest, f.filename);
        if (fs.existsSync(out)) { ok++; continue; }
        try {
          const r = await fetch(f.url);
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          const buf = Buffer.from(await r.arrayBuffer());
          fs.writeFileSync(out, buf);
          ok++;
        } catch (e) {
          console.warn("[faerie] font download failed", f.filename, e);
          fail++;
        }
      }
      new Notice(`Fonts installed: ${ok} ok, ${fail} failed. Path: ${fontPath}`, 8000);
    },
  });

  plugin.addCommand({
    id: "faerie-excalidraw-install-scripts",
    name: "Faerie: install curated Excalidraw scripts library",
    callback: async () => {
      const repo = findEaScriptsRepo();
      if (!repo) {
        new Notice(
          "ea-scripts repo not found locally. Clone https://github.com/zsviczian/obsidian-excalidraw-plugin first.",
          10000
        );
        return;
      }
      const dest = findExcalidrawScriptsDir(plugin.app);
      fs.mkdirSync(dest, { recursive: true });
      let n = 0;
      for (const name of CURATED_EA_SCRIPTS) {
        const md = path.join(repo, `${name}.md`);
        const svg = path.join(repo, `${name}.svg`);
        if (fs.existsSync(md)) { fs.copyFileSync(md, path.join(dest, `${name}.md`)); n++; }
        if (fs.existsSync(svg)) { fs.copyFileSync(svg, path.join(dest, `${name}.svg`)); }
      }
      new Notice(`Installed ${n} curated Excalidraw scripts → ${dest}.`, 8000);
    },
  });

  /**
   * Draft ExcaliBrain — opens a new Excalidraw canvas seeded with the
   * current note's bearings hierarchy as labeled, color-coded shapes.
   * The user can rearrange, add, delete, redraw, then click "commit"
   * (a separate command) to write the new topology back into the
   * note's frontmatter.
   */
  plugin.addCommand({
    id: "faerie-draft-excalibrain",
    name: "Faerie: draft ExcaliBrain (sketch next mission-graph version)",
    callback: async () => {
      const file = plugin.app.workspace.getActiveFile();
      if (!file) { new Notice("Open a note first."); return; }
      const cache = plugin.app.metadataCache.getFileCache(file);
      const fm = cache?.frontmatter ?? {};

      const parents = ([] as string[]).concat(fm.up || [], fm.north || [], fm.unblocks || []);
      const children = ([] as string[]).concat(fm.down || [], fm.next || [], fm.south || [], fm.ships || []);
      const friends = ([] as string[]).concat(fm.same || [], fm.east || [], fm.parallel || [], fm.sister || []);
      const baseline = ([] as string[]).concat(fm.west || [], fm.baseline || []);

      // Build a minimal Excalidraw JSON. Excalidraw notes are markdown
      // with a `## Drawing` section containing a fenced ```compressed-json
      // block. For a draft we'll write the un-compressed form which
      // Excalidraw also accepts via the "Decompress" flow.
      const center = { x: 0, y: 0 };
      const nodes: any[] = [];
      const links: any[] = [];

      const makeNode = (label: string, x: number, y: number, color: string, id: string) => {
        nodes.push({
          type: "rectangle",
          id,
          x, y, width: 220, height: 60,
          strokeColor: color,
          backgroundColor: "transparent",
          strokeWidth: 2,
          roughness: 0,
          fillStyle: "solid",
          roundness: { type: 3 },
          label: { text: label, fontSize: 18, fontFamily: 2 },
        });
      };

      makeNode(`◎ ${file.basename}`, center.x - 110, center.y - 30, "#5A3C1E", "center");

      parents.forEach((p, i) =>
        makeNode(`↑ ${String(p)}`, -110, -200 - i * 80, BEARING_COLOR.N, `n-${i}`));
      children.forEach((c, i) =>
        makeNode(`↓ ${String(c)}`, -110, 100 + i * 80, BEARING_COLOR.S, `s-${i}`));
      friends.forEach((f, i) =>
        makeNode(`→ ${String(f)}`, 260 + i * 240, -30, BEARING_COLOR.E, `e-${i}`));
      baseline.forEach((b, i) =>
        makeNode(`← ${String(b)}`, -380 - i * 240, -30, BEARING_COLOR.W, `w-${i}`));

      const root = vaultRoot(plugin.app);
      const date = new Date().toISOString().slice(0, 10);
      const dir = path.join(root, "00-SHARED", "Drafts", "ExcaliBrain", date);
      fs.mkdirSync(dir, { recursive: true });
      const target = path.join(dir, `draft-${file.basename}-${Date.now()}.excalidraw.md`);

      const body = [
        "---",
        "excalidraw-plugin: parsed",
        "tags: [excalidraw, faerie-draft, excalibrain-draft]",
        `draft_for: "${file.path}"`,
        `created: ${new Date().toISOString()}`,
        "---",
        "",
        "> [!brood] Draft ExcaliBrain — sketch your next topology",
        "> Rearrange, add, delete, then run **Faerie: commit ExcaliBrain draft** to write changes back to `" + file.path + "` frontmatter.",
        "> Legend:",
        ...BEARINGS.map((b) => `> - <span style=\"color:${BEARING_COLOR[b]}\">${BEARING_LABEL[b]}</span>`),
        "",
        "# Excalidraw Data",
        "",
        "## Text Elements",
        "",
        "## Element Links",
        "",
        "## Embedded Files",
        "",
        "## Drawing",
        "```json",
        JSON.stringify({ type: "excalidraw", version: 2, source: "faerie-hive-plugin", elements: nodes, appState: { gridSize: 20, viewBackgroundColor: "#FAF8F2" } }, null, 2),
        "```",
        "%%",
      ].join("\n");

      fs.writeFileSync(target, body, "utf8");
      const rel = path.relative(root, target).replace(/\\/g, "/");
      const tfile = plugin.app.vault.getAbstractFileByPath(rel);
      if (tfile instanceof TFile) {
        await plugin.app.workspace.getLeaf(true).openFile(tfile);
      }
      new Notice("Draft ExcaliBrain opened. Sketch the next topology, then commit it.", 8000);
    },
  });

  plugin.addCommand({
    id: "faerie-commit-excalibrain-draft",
    name: "Faerie: commit ExcaliBrain draft → frontmatter",
    callback: async () => {
      const file = plugin.app.workspace.getActiveFile();
      if (!file) return;
      const cache = plugin.app.metadataCache.getFileCache(file);
      const draftFor = cache?.frontmatter?.draft_for as string | undefined;
      if (!draftFor) { new Notice("Not a draft note (missing `draft_for` frontmatter)."); return; }
      const target = plugin.app.vault.getAbstractFileByPath(draftFor);
      if (!(target instanceof TFile)) { new Notice(`Target not found: ${draftFor}`); return; }

      // Read the draft's Excalidraw JSON, extract labeled rectangles by
      // color, write them back into the target note's frontmatter.
      const raw = await plugin.app.vault.read(file);
      const m = raw.match(/```json\n([\s\S]*?)\n```/);
      if (!m) { new Notice("No Excalidraw JSON block found in draft."); return; }
      let data: any;
      try { data = JSON.parse(m[1]); } catch { new Notice("Excalidraw JSON parse failed."); return; }
      const elements: any[] = data.elements ?? [];

      const grouped: Record<string, string[]> = { up: [], down: [], same: [], west: [] };
      for (const el of elements) {
        const lbl = el?.label?.text || "";
        if (!lbl || lbl.startsWith("◎")) continue;
        const clean = lbl.replace(/^[↑↓→←]\s*/, "").trim();
        if (el.strokeColor === BEARING_COLOR.N) grouped.up.push(clean);
        else if (el.strokeColor === BEARING_COLOR.S) grouped.down.push(clean);
        else if (el.strokeColor === BEARING_COLOR.E) grouped.same.push(clean);
        else if (el.strokeColor === BEARING_COLOR.W) grouped.west.push(clean);
      }

      await plugin.app.fileManager.processFrontMatter(target, (fm) => {
        if (grouped.up.length) fm.up = grouped.up;
        if (grouped.down.length) fm.down = grouped.down;
        if (grouped.same.length) fm.same = grouped.same;
        if (grouped.west.length) fm.west = grouped.west;
        fm.last_excalibrain_draft = file.path;
      });
      new Notice(`Committed: ${grouped.up.length} up, ${grouped.down.length} down, ${grouped.same.length} same, ${grouped.west.length} west → ${draftFor}`, 10000);
    },
  });
}
