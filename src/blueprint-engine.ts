import { App, Notice, Plugin, TFile, FuzzySuggestModal } from "obsidian";
import * as fs from "fs";
import * as path from "path";

// Vendored micro-Nunjucks renderer — zero npm dependencies. Supports the
// subset of Nunjucks syntax actually used by CompassCrew blueprints: variables,
// dotted paths, default/upper/lower/length/join/replace/date filters,
// {% if %} {% else %} {% endif %}, {% for x in xs %} {% endfor %}, and
// {% set %}. See src/vendor/micro-njk.ts.
import { renderString as microNjkRender } from "./vendor/micro-njk";

export interface BlueprintSettings {
  blueprintsDir: string; // vault-relative
  compasscrewRepoBlueprintsDir?: string; // absolute path to compasscrew blueprints (optional override)
}

export const DEFAULT_BLUEPRINT_SETTINGS: BlueprintSettings = {
  blueprintsDir: "Blueprints",
};

function vaultRoot(app: App): string {
  return (app.vault.adapter as unknown as { basePath: string }).basePath;
}

function listBlueprints(app: App, settings: BlueprintSettings): string[] {
  const candidates: string[] = [];
  const v = path.join(vaultRoot(app), settings.blueprintsDir);
  if (fs.existsSync(v)) {
    for (const f of fs.readdirSync(v)) if (f.endsWith(".njk")) candidates.push(path.join(v, f));
  }
  if (settings.compasscrewRepoBlueprintsDir && fs.existsSync(settings.compasscrewRepoBlueprintsDir)) {
    for (const f of fs.readdirSync(settings.compasscrewRepoBlueprintsDir))
      if (f.endsWith(".njk")) candidates.push(path.join(settings.compasscrewRepoBlueprintsDir, f));
  }
  return candidates;
}

function renderTemplate(tplPath: string, ctx: Record<string, unknown>): string {
  const raw = fs.readFileSync(tplPath, "utf8");
  return microNjkRender(raw, ctx as any);
}

const BEGIN = (s: string) => `<!-- BLUEPRINT-BEGIN:${s} -->`;
const END = (s: string) => `<!-- BLUEPRINT-END:${s} -->`;

function mergeRendered(existing: string, section: string, rendered: string): string {
  const begin = BEGIN(section);
  const end = END(section);
  const block = `${begin}\n${rendered}\n${end}`;
  const re = new RegExp(`${begin.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}[\\s\\S]*?${end.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}`);
  if (re.test(existing)) return existing.replace(re, block);
  // Append at end with one blank line
  return (existing.trimEnd() + "\n\n" + block + "\n");
}

function blueprintSectionName(tplPath: string): string {
  return path.basename(tplPath, ".njk");
}

class BlueprintPickerModal extends FuzzySuggestModal<string> {
  constructor(app: App, private items: string[], private onPick: (p: string) => void) {
    super(app);
  }
  getItems(): string[] {
    return this.items;
  }
  getItemText(item: string): string {
    return path.basename(item);
  }
  onChooseItem(item: string): void {
    this.onPick(item);
  }
}

export function registerBlueprintEngine(
  plugin: Plugin,
  getSettings: () => BlueprintSettings,
) {
  const buildContext = (file: TFile | null): Record<string, unknown> => {
    const cache = file ? plugin.app.metadataCache.getFileCache(file) : null;
    return {
      file: file ? { path: file.path, basename: file.basename, name: file.name } : {},
      frontmatter: cache?.frontmatter ?? {},
      now: new Date().toISOString(),
      today: new Date().toISOString().slice(0, 10),
      vault: { name: plugin.app.vault.getName() },
    };
  };

  plugin.addCommand({
    id: "compasscrew-apply-blueprint",
    name: "CompassCrew: apply blueprint to current note",
    checkCallback: (checking: boolean) => {
      const file = plugin.app.workspace.getActiveFile();
      if (!file || file.extension !== "md") return false;
      if (!checking) {
        const items = listBlueprints(plugin.app, getSettings());
        if (!items.length) {
          new Notice("No blueprints found in 00-SHARED/Blueprints/");
          return;
        }
        new BlueprintPickerModal(plugin.app, items, async (tpl) => {
          try {
            const ctx = buildContext(file);
            const rendered = renderTemplate(tpl, ctx);
            const section = blueprintSectionName(tpl);
            const cur = await plugin.app.vault.read(file);
            const next = mergeRendered(cur, section, rendered);
            await plugin.app.vault.modify(file, next);
            new Notice(`Blueprint '${section}' applied (preserved human edits outside markers).`);
          } catch (e) {
            new Notice("Blueprint error: " + (e as Error).message, 8000);
          }
        }).open();
      }
      return true;
    },
  });

  plugin.addCommand({
    id: "compasscrew-render-blueprint-clipboard",
    name: "CompassCrew: render blueprint to clipboard",
    callback: () => {
      const items = listBlueprints(plugin.app, getSettings());
      if (!items.length) {
        new Notice("No blueprints found.");
        return;
      }
      new BlueprintPickerModal(plugin.app, items, async (tpl) => {
        const ctx = buildContext(plugin.app.workspace.getActiveFile());
        const rendered = renderTemplate(tpl, ctx);
        await navigator.clipboard.writeText(rendered);
        new Notice(`Blueprint '${path.basename(tpl)}' copied to clipboard.`);
      }).open();
    },
  });

  plugin.addCommand({
    id: "compasscrew-apply-blueprint-folder",
    name: "CompassCrew: apply blueprint to folder (current note's folder)",
    callback: () => {
      const file = plugin.app.workspace.getActiveFile();
      if (!file) { new Notice("Open a note first."); return; }
      const items = listBlueprints(plugin.app, getSettings());
      if (!items.length) { new Notice("No blueprints found."); return; }
      new BlueprintPickerModal(plugin.app, items, async (tpl) => {
        const folder = file.parent;
        if (!folder) return;
        const section = blueprintSectionName(tpl);
        let n = 0;
        for (const child of folder.children) {
          if (child instanceof TFile && child.extension === "md") {
            const ctx = buildContext(child);
            const rendered = renderTemplate(tpl, ctx);
            const cur = await plugin.app.vault.read(child);
            await plugin.app.vault.modify(child, mergeRendered(cur, section, rendered));
            n++;
          }
        }
        new Notice(`Applied blueprint '${section}' to ${n} notes in ${folder.path}.`);
      }).open();
    },
  });

  // Auto-rerender on file-open if template mtime is newer than the marker's
  // recorded stamp. Stamp is the blueprint file's mtime, stored as an HTML
  // comment after the BEGIN marker on first render.
  plugin.registerEvent(
    plugin.app.workspace.on("file-open", async (file) => {
      if (!file || file.extension !== "md") return;
      const cur = await plugin.app.vault.read(file).catch(() => null);
      if (!cur) return;
      const sections = Array.from(cur.matchAll(/<!-- BLUEPRINT-BEGIN:([\w-]+) -->/g)).map((m) => m[1]);
      if (!sections.length) return;
      const items = listBlueprints(plugin.app, getSettings());
      let next = cur;
      let changed = false;
      for (const section of sections) {
        const tpl = items.find((p) => blueprintSectionName(p) === section);
        if (!tpl) continue;
        try {
          const tplStat = fs.statSync(tpl);
          const stampRe = new RegExp(`<!-- BLUEPRINT-BEGIN:${section} -->\\s*<!-- stamp:(\\d+) -->`);
          const m = next.match(stampRe);
          const noteStamp = m ? parseInt(m[1], 10) : 0;
          if (tplStat.mtimeMs > noteStamp) {
            const ctx = buildContext(file);
            const rendered = `<!-- stamp:${Math.floor(tplStat.mtimeMs)} -->\n` + renderTemplate(tpl, ctx);
            next = mergeRendered(next, section, rendered);
            changed = true;
          }
        } catch { /* ignore */ }
      }
      if (changed) {
        await plugin.app.vault.modify(file, next);
      }
    })
  );
}
