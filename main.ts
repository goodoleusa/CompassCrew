import { App, Notice, Plugin, PluginSettingTab, Setting } from "obsidian";
import HivePdfPlugin from "./src/pdf-export";
import { registerDepOrchestrator } from "./src/dep-orchestrator";
import {
  registerBlueprintEngine,
  DEFAULT_BLUEPRINT_SETTINGS,
  BlueprintSettings,
} from "./src/blueprint-engine";
import { registerTrailRefs } from "./src/trail-refs";
import { registerBreadcrumbsThreading } from "./src/breadcrumbs-threading";
import {
  registerAnnotations,
  DEFAULT_ANNOTATION_SETTINGS,
  AnnotationSettings,
} from "./src/annotations";
import { registerCompassOverlay } from "./src/compass-overlay";
import {
  registerMcpBridge,
  DEFAULT_MCP_BRIDGE_SETTINGS,
  McpBridgeSettings,
  VIEW_TYPE_FAERIE_LIVE,
} from "./src/mcp-bridge";
import { registerFileDecorator } from "./src/file-decorator";
import { registerQuickAddMacros } from "./src/quickadd-macros";
import {
  registerSystemPrompt,
  DEFAULT_SYSTEM_PROMPT_SETTINGS,
  SystemPromptSettings,
} from "./src/system-prompt";
import {
  registerSpiderfoot,
  DEFAULT_SPIDERFOOT_SETTINGS,
  SpiderfootSettings,
} from "./src/spiderfoot";
import { registerChatPanel, VIEW_TYPE_FAERIE_CHAT } from "./src/chat-panel";
import { registerExcalidrawSetup } from "./src/excalidraw-setup";
import { registerBreadcrumbsOnboarding } from "./src/breadcrumbs-onboarding";
import { initOntology } from "./src/ontology-loader";
import { registerOntologyCommands } from "./src/ontology-commands";
import { registerCanonicalInstaller } from "./src/canonical-installer";

interface HiveSettings extends
  BlueprintSettings,
  AnnotationSettings,
  McpBridgeSettings,
  SystemPromptSettings,
  SpiderfootSettings {
  // PDF settings live on the parent class.
}

const DEFAULT_HIVE_SETTINGS: HiveSettings = {
  ...DEFAULT_BLUEPRINT_SETTINGS,
  ...DEFAULT_ANNOTATION_SETTINGS,
  ...DEFAULT_MCP_BRIDGE_SETTINGS,
  ...DEFAULT_SYSTEM_PROMPT_SETTINGS,
  ...DEFAULT_SPIDERFOOT_SETTINGS,
};

/**
 * Hive — the unified Faerie Obsidian orchestrator.
 *
 * Extends the existing HivePdfPlugin so the PDF export commands keep working
 * untouched. All new feature modules are wired in `onload()` after the
 * superclass has booted.
 */
export default class HivePlugin extends HivePdfPlugin {
  hiveSettings!: HiveSettings;

  async onload() {
    await super.onload();
    await this.loadHiveSettings();

    // Initialize pluggable ontology (display layer for NSEW bearings) BEFORE
    // any UI module reads BEARING_LABEL/COLOR/GLYPH. The internal data model
    // is always N/S/E/W — only the display surface adapts to user preference.
    initOntology(this.app);

    // The plugin folder bundles a canonical `Blueprints/` directory at the
    // repo root. Resolve its absolute path so the blueprint engine can use
    // it as the primary template source (vault `00-SHARED/Blueprints/`
    // remains the user-override layer).
    const vaultRoot = (this.app.vault.adapter as any).basePath as string;
    const pluginDir = this.manifest.dir ?? `.obsidian/plugins/${this.manifest.id}`;
    const bundledBlueprints = `${vaultRoot}/${pluginDir}/Blueprints`;
    this.hiveSettings.faerieRepoBlueprintsDir = this.hiveSettings.faerieRepoBlueprintsDir || bundledBlueprints;

    const getHiveSettings = () => this.hiveSettings;

    registerDepOrchestrator(this);
    registerBlueprintEngine(this, getHiveSettings);
    registerBreadcrumbsThreading(this);
    registerTrailRefs(this);
    registerAnnotations(this, getHiveSettings);
    registerCompassOverlay(this);
    registerMcpBridge(this, getHiveSettings);
    registerFileDecorator(this);
    registerQuickAddMacros(this);
    registerSystemPrompt(this, getHiveSettings);
    registerSpiderfoot(this, getHiveSettings);
    registerChatPanel(this,
      () => this.hiveSettings.mcpUrl,
      () => this.hiveSettings.tokenPath,
    );
    registerExcalidrawSetup(this);
    registerBreadcrumbsOnboarding(this);
    registerOntologyCommands(this);
    registerCanonicalInstaller(this);

    this.addSettingTab(new HiveSettingTab(this.app, this));

    new Notice("Hive v2.0.0 ready — run 'Faerie: doctor' to check dependencies.", 5000);
  }

  async loadHiveSettings() {
    const data = (await this.loadData()) || {};
    this.hiveSettings = Object.assign({}, DEFAULT_HIVE_SETTINGS, data.hive || {});
  }

  async saveHiveSettings() {
    const data = (await this.loadData()) || {};
    data.hive = this.hiveSettings;
    await this.saveData(data);
  }

  // Convenience getter so QuickAdd macros can fish out MCP url from
  // `app.plugins.plugins["hive"].settings`.
  get settings(): HiveSettings { return this.hiveSettings; }
}

class HiveSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: HivePlugin) { super(app, plugin); }
  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Hive — Faerie Orchestrator" });

    new Setting(containerEl)
      .setName("Blueprints directory (vault-relative)")
      .setDesc("Primary blueprint folder inside the vault. Plugin-bundled blueprints in Blueprints/ are also available.")
      .addText((t) => t.setValue(this.plugin.hiveSettings.blueprintsDir)
        .onChange(async (v) => { this.plugin.hiveSettings.blueprintsDir = v; await this.plugin.saveHiveSettings(); }));

    new Setting(containerEl)
      .setName("Bundled Blueprints absolute path")
      .setDesc("Auto-resolved to plugin's Blueprints/ folder. Override to point at a faerie2 prompts dir if you want.")
      .addText((t) => t.setValue(this.plugin.hiveSettings.faerieRepoBlueprintsDir || "")
        .onChange(async (v) => { this.plugin.hiveSettings.faerieRepoBlueprintsDir = v; await this.plugin.saveHiveSettings(); }));

    new Setting(containerEl)
      .setName("MCP URL")
      .setDesc("Faerie MCP server base URL")
      .addText((t) => t.setValue(this.plugin.hiveSettings.mcpUrl)
        .onChange(async (v) => {
          this.plugin.hiveSettings.mcpUrl = v;
          await this.plugin.saveHiveSettings();
        }));

    new Setting(containerEl)
      .setName("MCP token path (vault-relative)")
      .setDesc("File containing the bearer token. Should be gitignored.")
      .addText((t) => t.setValue(this.plugin.hiveSettings.tokenPath)
        .onChange(async (v) => { this.plugin.hiveSettings.tokenPath = v; await this.plugin.saveHiveSettings(); }));

    new Setting(containerEl)
      .setName("Human folder (vault-relative)")
      .setDesc("Where annotations are written. Default: Human/ (vault root). Renamed from 'Marginalia folder'.")
      .addText((t) => t.setValue(this.plugin.hiveSettings.annotationsDir)
        .onChange(async (v) => { this.plugin.hiveSettings.annotationsDir = v || "Human"; await this.plugin.saveHiveSettings(); }));

    new Setting(containerEl)
      .setName("MCP refresh seconds (Live pane)")
      .addText((t) => t.setValue(String(this.plugin.hiveSettings.refreshSeconds))
        .onChange(async (v) => { this.plugin.hiveSettings.refreshSeconds = parseInt(v) || 60; await this.plugin.saveHiveSettings(); }));

    new Setting(containerEl)
      .setName("System prompts dir (absolute, faerie2 repo)")
      .addText((t) => t.setValue(this.plugin.hiveSettings.promptsDir)
        .onChange(async (v) => { this.plugin.hiveSettings.promptsDir = v; await this.plugin.saveHiveSettings(); }));
  }
}

// Re-export view types for completeness.
export { VIEW_TYPE_FAERIE_LIVE, VIEW_TYPE_FAERIE_CHAT };
