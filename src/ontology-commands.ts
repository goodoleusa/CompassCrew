/**
 * Ontology commands: switch preset, export current, doctor.
 */
import { App, FuzzySuggestModal, Notice, Plugin } from "obsidian";
import * as fs from "fs";
import * as path from "path";
import {
  applyOntology,
  getActiveOntology,
  loadOntologyFromFile,
  ontologyDoctor,
  ontologyToYaml,
  writeOntologyToVault,
  Ontology,
} from "./ontology-loader";

function vaultRoot(app: App): string {
  return (app.vault.adapter as unknown as { basePath: string }).basePath;
}

function presetsDir(plugin: Plugin): string {
  const pluginDir = plugin.manifest.dir ?? `.obsidian/plugins/${plugin.manifest.id}`;
  return path.join(vaultRoot(plugin.app), pluginDir, "presets");
}

function listPresets(plugin: Plugin): { name: string; absPath: string }[] {
  const dir = presetsDir(plugin);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith(".yaml"))
    .map((f) => ({ name: f.replace(/\.yaml$/, ""), absPath: path.join(dir, f) }));
}

class PresetPicker extends FuzzySuggestModal<{ name: string; absPath: string }> {
  constructor(app: App, private presets: { name: string; absPath: string }[], private onPick: (p: { name: string; absPath: string }) => void) { super(app); }
  getItems() { return this.presets; }
  getItemText(p: { name: string; absPath: string }) { return p.name; }
  onChooseItem(p: { name: string; absPath: string }) { this.onPick(p); }
}

export function registerOntologyCommands(plugin: Plugin) {
  plugin.addCommand({
    id: "faerie-switch-ontology-preset",
    name: "Faerie: switch ontology preset",
    callback: () => {
      const presets = listPresets(plugin);
      if (!presets.length) { new Notice("No presets found in plugin's presets/ folder."); return; }
      new PresetPicker(plugin.app, presets, (p) => {
        try {
          const o = loadOntologyFromFile(p.absPath);
          writeOntologyToVault(plugin.app, o);
          applyOntology(o);
          new Notice(`Ontology switched to "${o.name}". Reload Obsidian for full effect.`, 6000);
        } catch (e) {
          new Notice(`Switch failed: ${(e as Error).message}`, 6000);
        }
      }).open();
    },
  });

  plugin.addCommand({
    id: "faerie-export-ontology",
    name: "Faerie: export current ontology",
    callback: () => {
      const o: Ontology = getActiveOntology();
      const date = new Date().toISOString().slice(0, 10);
      const dir = path.join(vaultRoot(plugin.app), "00-SHARED", "Exports");
      fs.mkdirSync(dir, { recursive: true });
      const out = path.join(dir, `ontology-${o.name}-${date}.yaml`);
      fs.writeFileSync(out, ontologyToYaml(o), "utf8");
      new Notice(`Exported ontology to ${path.relative(vaultRoot(plugin.app), out)}`, 5000);
    },
  });

  plugin.addCommand({
    id: "faerie-ontology-doctor",
    name: "Faerie: ontology doctor",
    callback: () => {
      const report = ontologyDoctor(getActiveOntology());
      if (report.ok) {
        new Notice(`Ontology "${report.ontology.name}" is healthy. ✓`, 5000);
      } else {
        new Notice(`Ontology issues:\n- ${report.issues.join("\n- ")}`, 12000);
        console.warn("[hive] ontology doctor:", report.issues);
      }
    },
  });
}
