import { App, Notice, Plugin, Modal } from "obsidian";
import * as fs from "fs";
import * as path from "path";

const REQUIRED_PLUGINS = [
  "dataview",
  "obsidian-meta-bind-plugin",
  "quickadd",
  "breadcrumbs",
  "excalibrain",                  // canonical compass-overlay engine
  "obsidian-excalidraw-plugin",   // ExcaliBrain dependency + draft canvas
  "obsidian-linter",
];

const OPTIONAL_PLUGINS = [
  "juggl",                        // optional alternative graph view
  "extended-graph",               // optional richer graph styling
  "advanced-uri",                 // enables CLI-driven QuickAdd shell macros
  "mehrmaid",                     // full Markdown + KaTeX inside Mermaid node labels
];

const FORBIDDEN_PLUGINS = ["templater-obsidian"];

/** Canonical config sources from vault `00-SHARED/Snippets/` (vault-relative). */
const CANONICAL_CONFIGS: Array<{
  source: string;
  destPluginId: string;
  destFile: string;
}> = [
  {
    source: "00-SHARED/Snippets/linter-settings-compasscrew.json",
    destPluginId: "obsidian-linter",
    destFile: "data.json",
  },
  {
    source: "00-SHARED/Snippets/breadcrumbs-config-compasscrew.json",
    destPluginId: "breadcrumbs",
    destFile: "data.json",
  },
];

function vaultRoot(app: App): string {
  return (app.vault.adapter as unknown as { basePath: string }).basePath;
}

function pluginsDir(app: App): string {
  return path.join(vaultRoot(app), ".obsidian", "plugins");
}

function snippetsDir(app: App): string {
  return path.join(vaultRoot(app), ".obsidian", "snippets");
}

function readJsonSafe(p: string): Record<string, unknown> | null {
  try {
    const raw = fs.readFileSync(p, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function deepMerge<T extends Record<string, any>>(base: T, overlay: Record<string, any>): T {
  const out: Record<string, any> = { ...base };
  for (const [k, v] of Object.entries(overlay)) {
    if (v && typeof v === "object" && !Array.isArray(v) && typeof out[k] === "object" && out[k] && !Array.isArray(out[k])) {
      out[k] = deepMerge(out[k], v);
    } else {
      out[k] = v;
    }
  }
  return out as T;
}

class DoctorReportModal extends Modal {
  constructor(app: App, private report: { missing: string[]; forbidden: string[]; present: string[] }) {
    super(app);
  }
  onOpen() {
    const { contentEl, report } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "CompassCrew Doctor — Plugin Health" });
    if (report.missing.length) {
      contentEl.createEl("h3", { text: "Missing (please install)" });
      const ul = contentEl.createEl("ul");
      report.missing.forEach((p) => ul.createEl("li", { text: p }));
    }
    if (report.forbidden.length) {
      contentEl.createEl("h3", { text: "⚠ Forbidden (must be removed)" });
      const ul = contentEl.createEl("ul");
      report.forbidden.forEach((p) => ul.createEl("li", { text: p }));
    }
    contentEl.createEl("h3", { text: "Present" });
    const ul2 = contentEl.createEl("ul");
    report.present.forEach((p) => ul2.createEl("li", { text: p }));
    const btn = contentEl.createEl("button", { text: "Open Community Plugins" });
    btn.onclick = () => {
      (this.app as any).setting?.open?.();
      (this.app as any).setting?.openTabById?.("community-plugins");
      this.close();
    };
  }
  onClose() {
    this.contentEl.empty();
  }
}

export function registerDepOrchestrator(plugin: Plugin) {
  plugin.addCommand({
    id: "compasscrew-doctor",
    name: "CompassCrew: doctor (check plugin dependencies)",
    callback: () => {
      const dir = pluginsDir(plugin.app);
      let installed: string[] = [];
      try {
        installed = fs.readdirSync(dir);
      } catch {
        new Notice("Could not read plugins directory.");
        return;
      }
      const missing = REQUIRED_PLUGINS.filter((p) => !installed.includes(p));
      const forbidden = FORBIDDEN_PLUGINS.filter((p) => installed.includes(p));
      const present = REQUIRED_PLUGINS.filter((p) => installed.includes(p));
      new DoctorReportModal(plugin.app, { missing, forbidden, present }).open();
      if (forbidden.length) {
        new Notice(`⚠ Forbidden plugins detected: ${forbidden.join(", ")}. CompassCrew uses QuickAdd + Nunjucks, NOT Templater.`, 12000);
      }
    },
  });

  plugin.addCommand({
    id: "compasscrew-install-canonical-configs",
    name: "CompassCrew: install canonical configs",
    callback: () => {
      const root = vaultRoot(plugin.app);
      const reports: string[] = [];

      for (const cfg of CANONICAL_CONFIGS) {
        const srcPath = path.join(root, cfg.source);
        if (!fs.existsSync(srcPath)) {
          reports.push(`SKIP ${cfg.source} (source not found)`);
          continue;
        }
        const overlay = readJsonSafe(srcPath);
        if (!overlay) {
          reports.push(`SKIP ${cfg.source} (parse error)`);
          continue;
        }
        const destDir = path.join(pluginsDir(plugin.app), cfg.destPluginId);
        if (!fs.existsSync(destDir)) {
          reports.push(`SKIP ${cfg.destPluginId} (plugin not installed)`);
          continue;
        }
        const destPath = path.join(destDir, cfg.destFile);
        const base = readJsonSafe(destPath) ?? {};
        const merged = deepMerge(base, overlay);
        fs.writeFileSync(destPath, JSON.stringify(merged, null, 2), "utf8");
        reports.push(`OK   ${cfg.destPluginId} (merged)`);
      }

      // CSS snippets — enable all compasscrew-*.css in .obsidian/appearance.json
      const snippetsDstDir = snippetsDir(plugin.app);
      const appearancePath = path.join(vaultRoot(plugin.app), ".obsidian", "appearance.json");
      try {
        const existing = readJsonSafe(appearancePath) as Record<string, any> ?? {};
        const enabled: string[] = Array.isArray(existing.enabledCssSnippets) ? existing.enabledCssSnippets : [];
        let added = 0;
        if (fs.existsSync(snippetsDstDir)) {
          for (const f of fs.readdirSync(snippetsDstDir)) {
            if (f.startsWith("compasscrew-") && f.endsWith(".css")) {
              const name = f.slice(0, -4); // strip .css
              if (!enabled.includes(name)) { enabled.push(name); added++; }
            }
          }
        }
        existing.enabledCssSnippets = enabled;
        fs.writeFileSync(appearancePath, JSON.stringify(existing, null, 2), "utf8");
        reports.push(`CSS  ${added} snippet(s) enabled in appearance.json`);
      } catch (e) {
        reports.push(`CSS  error: ${(e as Error).message}`);
      }

      new Notice("Canonical configs:\n" + reports.join("\n"), 10000);
    },
  });
}
