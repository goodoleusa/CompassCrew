import { ItemView, Notice, Plugin, TFile, WorkspaceLeaf } from "obsidian";
import { readBearingFrontmatter } from "./breadcrumbs-threading";
import { BEARING_COLOR, BEARING_LABEL, Bearing } from "./bearings";

/**
 * Compass overlay — powered by ExcaliBrain.
 *
 * Why ExcaliBrain rather than Juggl: ExcaliBrain is purpose-built for
 * field-based hierarchy navigation. The user configures which frontmatter
 * fields are "parents," "children," and "friends," and ExcaliBrain renders
 * a clean directional graph natively. This maps exactly onto our compass
 * bearings:
 *
 *   N (up / unblock predecessor)  → ExcaliBrain "parents" field: up
 *   S (down / conclude downstream)→ ExcaliBrain "children" field: down, next
 *   E (parallel sister)           → ExcaliBrain "friends" field: same
 *   W (return to baseline)        → ExcaliBrain "parents" field: up (alias)
 *
 * On first run, we write a recommended ExcaliBrain configuration that wires
 * those field mappings + bearing colors. ExcaliBrain integrates with
 * Excalidraw for the rendered view, which is why both plugins are required.
 */

interface ExcaliBrainConfig {
  hierarchy: {
    parents: string[];
    children: string[];
    friends: string[];
  };
  styles?: {
    parents?: { strokeColor?: string };
    children?: { strokeColor?: string };
    friends?: { strokeColor?: string };
  };
}

const COMPASSCREW_EXCALIBRAIN_CONFIG: ExcaliBrainConfig = {
  hierarchy: {
    parents: ["up", "north", "unblocks"],
    children: ["down", "next", "south", "ships"],
    friends: ["same", "east", "parallel", "sister"],
  },
  styles: {
    parents:  { strokeColor: "#C73E1D" }, // north red
    children: { strokeColor: "#2E8540" }, // south green
    friends:  { strokeColor: "#FF8E3C" }, // east orange
  },
};

export function registerCompassOverlay(plugin: Plugin) {
  plugin.addCommand({
    id: "compasscrew-compass-overlay",
    name: "CompassCrew: compass overlay (ExcaliBrain bearings view, falls back to mermaid)",
    callback: async () => {
      const file = plugin.app.workspace.getActiveFile();
      if (!file) {
        new Notice("Open a note first.");
        return;
      }

      const anyApp = plugin.app as any;
      const excaliBrain = anyApp.plugins?.plugins?.["excalibrain"];
      if (!excaliBrain) {
        // Graceful degrade: ExcaliBrain is a soft dependency. If it's not
        // installed, fall back to the inline mermaid compass view which
        // is fully vendored in this plugin (no external deps).
        new Notice(
          "ExcaliBrain not installed — using built-in mermaid compass view. Install ExcaliBrain for the neural-graph experience.",
          7000
        );
        try {
          (plugin.app as any).commands?.executeCommandById?.("compasscrew:compasscrew-mermaid-compass");
        } catch { /* the mermaid command registers itself; if missing, do nothing */ }
        return;
      }

      // Try ExcaliBrain's known command IDs.
      const candidates = [
        "excalibrain:open",
        "excalibrain:open-pinned",
        "excalibrain:open-and-pin",
      ];
      for (const id of candidates) {
        if (anyApp.commands?.commands?.[id]) {
          anyApp.commands.executeCommandById(id);
          document.body.classList.add("compasscrew-compass-overlay-active");
          setTimeout(
            () => document.body.classList.remove("compasscrew-compass-overlay-active"),
            60_000
          );
          new Notice(`Compass (ExcaliBrain): ${file.basename} — bearings N/S/E/W.`);
          return;
        }
      }
      new Notice("Could not find ExcaliBrain command. Open it manually.", 6000);
    },
  });

  plugin.addCommand({
    id: "compasscrew-write-excalibrain-config",
    name: "CompassCrew: write recommended ExcaliBrain config (bearings)",
    callback: async () => {
      const anyApp = plugin.app as any;
      const excaliBrain = anyApp.plugins?.plugins?.["excalibrain"];
      if (!excaliBrain) {
        new Notice("ExcaliBrain not installed — this command requires it. The built-in mermaid compass view works without ExcaliBrain.", 8000);
        return;
      }
      // ExcaliBrain stores settings on plugin.settings; merge our values.
      try {
        const s = excaliBrain.settings;
        if (!s) {
          new Notice("Could not read ExcaliBrain settings.");
          return;
        }
        // ExcaliBrain v0.2.x uses these keys: hierarchy: { parents, children, friends }
        s.hierarchy = {
          ...(s.hierarchy || {}),
          parents: Array.from(new Set([...(s.hierarchy?.parents || []), ...COMPASSCREW_EXCALIBRAIN_CONFIG.hierarchy.parents])),
          children: Array.from(new Set([...(s.hierarchy?.children || []), ...COMPASSCREW_EXCALIBRAIN_CONFIG.hierarchy.children])),
          friends: Array.from(new Set([...(s.hierarchy?.friends || []), ...COMPASSCREW_EXCALIBRAIN_CONFIG.hierarchy.friends])),
        };
        await excaliBrain.saveSettings?.();
        new Notice(
          "ExcaliBrain bearings hierarchy configured: parents=up/north/unblocks, children=down/next/south/ships, friends=same/east/parallel/sister.",
          10000
        );
      } catch (e) {
        new Notice("ExcaliBrain config write failed: " + (e as Error).message, 8000);
      }
    },
  });
}


/* -----------------------------------------------------------------------
 * Inline Mermaid compass view (no new deps; uses Obsidian's bundled mermaid)
 * -----------------------------------------------------------------------
 * Complements the ExcaliBrain command: reads NSEW frontmatter from the
 * active note (via breadcrumbs-threading.readBearingFrontmatter, which
 * prefers canonical NSEW and falls back to Breadcrumbs aliases) and
 * renders a bearing-colored mermaid graph in a transient leaf.
 */

const VIEW_TYPE_COMPASSCREW_MERMAID_COMPASS = "compasscrew-mermaid-compass";

function stripLink(s: string): string {
  const m = s.match(/^\[\[([^\]|#]+)/);
  return (m ? m[1] : s).trim();
}

function escapeId(s: string): string {
  return s.replace(/[^A-Za-z0-9_]/g, "_");
}

function escLabel(s: string): string {
  return s.replace(/"/g, "'");
}

function buildMermaid(noteName: string, bearings: Partial<Record<Bearing, string[]>>): string {
  const lines: string[] = ["graph TD"];
  const cId = "C__" + escapeId(noteName);
  lines.push(`    ${cId}["${escLabel(noteName)}"]`);

  const emit = (b: Bearing) => {
    const items = bearings[b] || [];
    for (let i = 0; i < items.length; i++) {
      const name = stripLink(items[i]);
      const nid = b + i + "__" + escapeId(name);
      lines.push(`    ${nid}["${escLabel(name)}"]`);
      if (b === "N") lines.push(`    ${nid} -->|N| ${cId}`);
      else if (b === "S") lines.push(`    ${cId} -->|S| ${nid}`);
      else if (b === "E") lines.push(`    ${cId} -.->|E| ${nid}`);
      else if (b === "W") lines.push(`    ${nid} -.->|W| ${cId}`);
      lines.push(`    style ${nid} stroke:${BEARING_COLOR[b]},stroke-width:2px`);
    }
  };
  emit("N"); emit("S"); emit("E"); emit("W");
  lines.push(`    style ${cId} fill:#FFD96B,stroke:#333,stroke-width:2px`);
  return lines.join("\n");
}

class CompassCrewMermaidCompassView extends ItemView {
  private file: TFile | null = null;
  constructor(leaf: WorkspaceLeaf) { super(leaf); }
  getViewType() { return VIEW_TYPE_COMPASSCREW_MERMAID_COMPASS; }
  getDisplayText() { return "CompassCrew Compass (mermaid)"; }
  getIcon() { return "compass"; }
  setSourceFile(f: TFile) { this.file = f; }
  async render() {
    const root = this.containerEl.children[1] as HTMLElement;
    root.empty();
    root.createEl("h3", { text: "CompassCrew Compass — bearings overlay" });
    if (!this.file) {
      root.createEl("p", { text: "No active file when this view opened." });
      return;
    }
    const bearings = await readBearingFrontmatter(this.app, this.file);
    const total = (Object.values(bearings) as string[][]).reduce((a, v) => a + (v?.length || 0), 0);
    if (total === 0) {
      root.createEl("p", { text: `No NSEW or up/next/same frontmatter on ${this.file.basename}.` });
      return;
    }
    const mermaid = buildMermaid(this.file.basename, bearings);
    const legend = root.createEl("div", { cls: "compasscrew-compass-legend" });
    for (const b of ["N", "S", "E", "W"] as Bearing[]) {
      const swatch = legend.createEl("span");
      swatch.style.display = "inline-block";
      swatch.style.padding = "2px 8px";
      swatch.style.margin = "0 6px 0 0";
      swatch.style.border = `2px solid ${BEARING_COLOR[b]}`;
      swatch.style.borderRadius = "4px";
      swatch.setText(BEARING_LABEL[b]);
    }
    const host = root.createEl("div", { cls: "compasscrew-compass-mermaid" });
    const code = "```mermaid\n" + mermaid + "\n```";
    const { MarkdownRenderer } = require("obsidian");
    await MarkdownRenderer.renderMarkdown(code, host, this.file.path, this);
  }
  async onOpen() { await this.render(); }
  async onClose() { /* nothing */ }
}

export function registerMermaidCompass(plugin: Plugin) {
  plugin.registerView(VIEW_TYPE_COMPASSCREW_MERMAID_COMPASS, (leaf) => new CompassCrewMermaidCompassView(leaf));
  plugin.addCommand({
    id: "compasscrew-mermaid-compass",
    name: "CompassCrew: mermaid compass (inline NSEW overlay, no external deps)",
    callback: async () => {
      const file = plugin.app.workspace.getActiveFile();
      if (!file) { new Notice("Open a note first."); return; }
      const leaf = plugin.app.workspace.getLeaf(true);
      await leaf.setViewState({ type: VIEW_TYPE_COMPASSCREW_MERMAID_COMPASS, active: true });
      const view = leaf.view as CompassCrewMermaidCompassView;
      view.setSourceFile(file);
      await view.render();
    },
  });
}

export { VIEW_TYPE_COMPASSCREW_MERMAID_COMPASS };
