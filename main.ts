import { App, Notice, Plugin, PluginSettingTab, Setting } from "obsidian";
import ReckonPdfPlugin from "./src/pdf-export";
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
import { registerCompassOverlay, registerMermaidCompass } from "./src/compass-overlay";
import {
  registerMcpBridge,
  DEFAULT_MCP_BRIDGE_SETTINGS,
  McpBridgeSettings,
  VIEW_TYPE_RECKON_LIVE,
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
import { registerChatPanel, VIEW_TYPE_RECKON_CHAT } from "./src/chat-panel";
import { registerExcalidrawSetup } from "./src/excalidraw-setup";
import { registerCanvasRecursive } from "./src/canvas-recursive";
import { registerDesignFolder } from "./src/design-folder";
import { registerCharterDashboard } from "./src/charter-dashboard";
import { registerBreadcrumbsOnboarding } from "./src/breadcrumbs-onboarding";
import { initOntology } from "./src/ontology-loader";
import { registerOntologyCommands } from "./src/ontology-commands";
import { registerCanonicalInstaller } from "./src/canonical-installer";
import { registerCsvPreview } from "./src/csv-preview";
import { registerTokenGrabber, getTokenFingerprint } from "./src/token-grabber";
import { registerNativePdfExport } from "./src/native-pdf-export";
import { miniDataviewProcessor } from "./src/vendor/mini-dataview";
import { getRelations, renderRelations } from "./src/vendor/breadcrumbs-resolver";
import { registerLinter, renderLinterSettings, DEFAULT_LINTER_SETTINGS, LinterSettings } from "./src/linter";
import { registerMetaBind } from "./src/meta-bind";
import {
  registerHomePage,
  renderHomePageSettings,
  HomePageSettings,
  DEFAULT_HOME_PAGE_SETTINGS,
} from "./src/home-page";
import {
  DEFAULT_BREADCRUMBS_THREADING_SETTINGS,
  BreadcrumbsThreadingSettings,
} from "./src/breadcrumbs-threading";
import {
  registerLatticework,
  DEFAULT_LATTICEWORK_SETTINGS,
  LatticeworkSettings,
  LATTICEWORK_STYLES,
} from "./src/latticework";

interface ReckonSettings extends
  BlueprintSettings,
  AnnotationSettings,
  McpBridgeSettings,
  SystemPromptSettings,
  SpiderfootSettings,
  BreadcrumbsThreadingSettings,
  LinterSettings,
  HomePageSettings,
  LatticeworkSettings {
  // PDF settings live on the parent class.
}

const DEFAULT_RECKON_SETTINGS: ReckonSettings = {
  ...DEFAULT_BLUEPRINT_SETTINGS,
  ...DEFAULT_ANNOTATION_SETTINGS,
  ...DEFAULT_MCP_BRIDGE_SETTINGS,
  ...DEFAULT_SYSTEM_PROMPT_SETTINGS,
  ...DEFAULT_SPIDERFOOT_SETTINGS,
  ...DEFAULT_BREADCRUMBS_THREADING_SETTINGS,
  ...DEFAULT_LINTER_SETTINGS,
  ...DEFAULT_HOME_PAGE_SETTINGS,
  ...DEFAULT_LATTICEWORK_SETTINGS,
};

/**
 * Reckon — the unified Reckon Obsidian orchestrator.
 *
 * Extends the existing ReckonPdfPlugin so the PDF export commands keep working
 * untouched. All new feature modules are wired in `onload()` after the
 * superclass has booted.
 */
export default class ReckonPlugin extends ReckonPdfPlugin {
  reckonSettings!: ReckonSettings;

  async onload() {
    await super.onload();
    await this.loadReckonSettings();

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
    this.reckonSettings.reckonRepoBlueprintsDir = this.reckonSettings.reckonRepoBlueprintsDir || bundledBlueprints;

    const getReckonSettings = () => this.reckonSettings;

    registerDepOrchestrator(this);
    registerBlueprintEngine(this, getReckonSettings);
    registerBreadcrumbsThreading(this, () => this.reckonSettings.emitBreadcrumbsAliases);
    registerTrailRefs(this);
    registerLatticework(this);
    // Inject Latticework CSS so chip styles render without requiring
    // operators to edit their own snippets.css.
    const lwStyle = document.createElement("style");
    lwStyle.id = "latticework-styles";
    lwStyle.textContent = LATTICEWORK_STYLES;
    document.head.appendChild(lwStyle);
    this.register(() => lwStyle.remove());
    registerAnnotations(this, getReckonSettings);
    registerCompassOverlay(this);
    registerMcpBridge(this, getReckonSettings);
    registerFileDecorator(this);
    registerQuickAddMacros(this);
    registerSystemPrompt(this, getReckonSettings);
    registerSpiderfoot(this, getReckonSettings);
    registerChatPanel(this,
      () => this.reckonSettings.mcpUrl,
      () => this.reckonSettings.tokenPath,
    );
    registerExcalidrawSetup(this);
    registerCanvasRecursive(this);
    registerDesignFolder(this);
    registerCharterDashboard(this,
      () => this.reckonSettings.mcpUrl,
      () => this.reckonSettings.tokenPath,
    );
    registerBreadcrumbsOnboarding(this);
    registerOntologyCommands(this);
    registerCanonicalInstaller(this);
    registerCsvPreview(this);
    registerTokenGrabber(this);
    registerMermaidCompass(this);
    registerNativePdfExport(this);
    registerLinter(this, getReckonSettings, () => this.saveReckonSettings());
    registerMetaBind(this);
    registerHomePage(
      this,
      getReckonSettings,
      async () => {
        await this.saveReckonSettings();
      },
    );

    // Vendored dataview + breadcrumbs renderers — register markdown
    // codeblock processors so ``` dataview / dataviewjs / meta-bind ```
    // blocks render natively without requiring the Dataview community
    // plugin. If the real Dataview plugin is installed, its processor
    // takes precedence (Obsidian uses last-registered for codeblock
    // processors, but most users won't have both — and if they do, our
    // vendored renderer simply doesn't run because the user-installed
    // plugin handles the block first).
    this.registerMarkdownCodeBlockProcessor("dataview", miniDataviewProcessor(this.app));
    // Inline dataview queries inside paragraphs use markdown post-processor.
    this.registerMarkdownPostProcessor((el, _ctx) => {
      // Render `= file.name` inline-style dataview queries inside <p> tags.
      // Walks text nodes looking for the inline pattern; replaces with the
      // resolved field value (read-only).
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      const nodes: Text[] = [];
      let n: Node | null;
      while ((n = walker.nextNode())) nodes.push(n as Text);
      for (const node of nodes) {
        const text = node.nodeValue || "";
        const re = /`=\s*([^`]+)`/g;
        if (!re.test(text)) continue;
        const file = this.app.workspace.getActiveFile();
        if (!file) continue;
        const fm = this.app.metadataCache.getFileCache(file)?.frontmatter ?? null;
        re.lastIndex = 0;
        const replaced = text.replace(re, (_m, expr: string) => {
          const path = String(expr).trim();
          if (path.startsWith("file.")) {
            const sub = path.slice(5);
            if (sub === "name") return file.basename;
            if (sub === "path") return file.path;
            if (sub === "mtime") return new Date(file.stat.mtime).toISOString().slice(0, 10);
            if (sub === "ctime") return new Date(file.stat.ctime).toISOString().slice(0, 10);
          }
          if (!fm) return "(no fm)";
          const parts = path.split(".");
          let cur: any = fm;
          for (const p of parts) { if (cur == null) break; cur = cur[p]; }
          return cur == null ? "" : String(cur);
        });
        if (replaced !== text) {
          const span = document.createElement("span");
          span.className = "reckon-inline-dataview";
          span.textContent = replaced;
          node.parentNode?.replaceChild(span, node);
        }
      }
    });

    // Auto-render a Breadcrumbs relations banner at the top of any note
    // that has up/down/same/prev (or NSEW aliases) in frontmatter. This
    // replaces the vendored "matrix view" — the part of Breadcrumbs the
    // reckon vault actually relies on.
    this.registerMarkdownPostProcessor((el, ctx) => {
      // Only render once per top-level section.
      if (!el.querySelector("h1, h2, h3, p, ul, ol")) return;
      const file = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
      if (!(file instanceof (require("obsidian").TFile))) return;
      // Only render if this is the first chunk of the document (avoid
      // injecting the banner before every section).
      const root = el.closest(".markdown-preview-section, .markdown-reading-view");
      if (root && root.querySelector(".reckon-breadcrumbs-block")) return;
      const rel = getRelations(this.app, file as any);
      const html = renderRelations(rel, "Breadcrumbs");
      if (!html) return;
      const banner = document.createElement("div");
      banner.innerHTML = html;
      el.insertBefore(banner, el.firstChild);
    });

    this.addSettingTab(new ReckonSettingTab(this.app, this));

    new Notice("Reckon v2.0.0 ready — run 'Reckon: doctor' to check dependencies.", 5000);
  }

  async loadReckonSettings() {
    const data = (await this.loadData()) || {};
    // Settings persist under `data.reckon`. Migration: a vault that ran the
    // pre-rebrand plugin stored them under the legacy `data.hive` key — read
    // that as a fallback so existing users keep their configuration.
    const persisted = data.reckon ?? data.hive ?? {};
    this.reckonSettings = Object.assign({}, DEFAULT_RECKON_SETTINGS, persisted);

    // Environment override for the MCP endpoint. RECKON_MCP_URL is the
    // preferred variable; SWARMY_MCP_URL is honored as a deprecated alias so
    // pre-rebrand operator configs keep working. An explicit env var wins over
    // the persisted/default setting; if neither is set the saved value stands.
    const envMcpUrl = process.env.RECKON_MCP_URL || process.env.SWARMY_MCP_URL;
    if (envMcpUrl) this.reckonSettings.mcpUrl = envMcpUrl;
  }

  async saveReckonSettings() {
    const data = (await this.loadData()) || {};
    data.reckon = this.reckonSettings;
    await this.saveData(data);
  }

  // Convenience getter so QuickAdd macros can fish out MCP url from
  // `app.plugins.plugins["reckon"].settings`.
  get settings(): ReckonSettings { return this.reckonSettings; }
}

class ReckonSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: ReckonPlugin) { super(app, plugin); }
  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Reckon — Orchestrator" });

    new Setting(containerEl)
      .setName("Blueprints directory (vault-relative)")
      .setDesc("Primary blueprint folder inside the vault. Plugin-bundled blueprints in Blueprints/ are also available.")
      .addText((t) => t.setValue(this.plugin.reckonSettings.blueprintsDir)
        .onChange(async (v) => { this.plugin.reckonSettings.blueprintsDir = v; await this.plugin.saveReckonSettings(); }));

    new Setting(containerEl)
      .setName("Bundled Blueprints absolute path")
      .setDesc("Auto-resolved to plugin's Blueprints/ folder. Override to point at a reckon prompts dir if you want.")
      .addText((t) => t.setValue(this.plugin.reckonSettings.reckonRepoBlueprintsDir || "")
        .onChange(async (v) => { this.plugin.reckonSettings.reckonRepoBlueprintsDir = v; await this.plugin.saveReckonSettings(); }));

    new Setting(containerEl)
      .setName("MCP URL")
      .setDesc("Reckon MCP server base URL")
      .addText((t) => t.setValue(this.plugin.reckonSettings.mcpUrl)
        .onChange(async (v) => {
          this.plugin.reckonSettings.mcpUrl = v;
          await this.plugin.saveReckonSettings();
        }));

    new Setting(containerEl)
      .setName("MCP token path (vault-relative)")
      .setDesc("File containing the bearer token. Should be gitignored.")
      .addText((t) => t.setValue(this.plugin.reckonSettings.tokenPath)
        .onChange(async (v) => { this.plugin.reckonSettings.tokenPath = v; await this.plugin.saveReckonSettings(); }));

    new Setting(containerEl)
      .setName("Human folder (vault-relative)")
      .setDesc("Where annotations are written. Default: Human/ (vault root). Renamed from 'Marginalia folder'.")
      .addText((t) => t.setValue(this.plugin.reckonSettings.annotationsDir)
        .onChange(async (v) => { this.plugin.reckonSettings.annotationsDir = v || "Human"; await this.plugin.saveReckonSettings(); }));

    new Setting(containerEl)
      .setName("MCP refresh seconds (Live pane)")
      .addText((t) => t.setValue(String(this.plugin.reckonSettings.refreshSeconds))
        .onChange(async (v) => { this.plugin.reckonSettings.refreshSeconds = parseInt(v) || 60; await this.plugin.saveReckonSettings(); }));

    new Setting(containerEl)
      .setName("System prompts dir (absolute, reckon repo)")
      .addText((t) => t.setValue(this.plugin.reckonSettings.promptsDir)
        .onChange(async (v) => { this.plugin.reckonSettings.promptsDir = v; await this.plugin.saveReckonSettings(); }));

    new Setting(containerEl)
      .setName("Emit Breadcrumbs aliases (up/next/same)")
      .setDesc("Write canonical N/S/E/W keys AND legacy Breadcrumbs aliases. Disable to keep frontmatter NSEW-only.")
      .addToggle((t) => t.setValue(this.plugin.reckonSettings.emitBreadcrumbsAliases)
        .onChange(async (v) => { this.plugin.reckonSettings.emitBreadcrumbsAliases = v; await this.plugin.saveReckonSettings(); }));

    // Plugin health
    containerEl.createEl("h3", { text: "Plugin Health" });
    new Setting(containerEl)
      .setName("Health check")
      .setDesc("Verify required plugins are installed and no forbidden plugins are present.")
      .addButton((b) => b.setButtonText("🐝 Run doctor").onClick(() => {
        (this.app as any).commands.executeCommandById("reckon:reckon-doctor");
      }));
    new Setting(containerEl)
      .setName("Install canonical configs")
      .setDesc("Push linter + breadcrumbs configs from vault and enable all reckon-*.css snippets.")
      .addButton((b) => b.setButtonText("⬇ Install configs").onClick(() => {
        (this.app as any).commands.executeCommandById("reckon:reckon-install-canonical-configs");
      }));

    // MCP token grab UI.
    containerEl.createEl("h3", { text: "MCP Token" });
    const fpEl = containerEl.createEl("div", { cls: "reckon-token-fingerprint", text: "Loading token fingerprint…" });
    getTokenFingerprint(this.app).then((fp) => {
      if (!fp) { fpEl.setText("No token saved."); return; }
      const when = fp.lastModified ? new Date(fp.lastModified).toISOString().slice(0, 10) : "?";
      fpEl.setText(`Token: ${fp.short}… sha8=${fp.sha8} (rotated ${when})`);
    });
    new Setting(containerEl)
      .setName("Grab token from reckon")
      .setDesc("Opens swarmy.retrofuture.tech and writes .swarmy-token / .swarmy-user-key on callback.")
      .addButton((b) => b.setButtonText("🐝 Grab token from reckon").onClick(() => {
        (this.app as any).commands.executeCommandById("reckon:reckon-token-grab");
      }));
    new Setting(containerEl)
      .setName("Rotate token")
      .setDesc("Calls swarmy_token_rotate via the configured MCP URL.")
      .addButton((b) => b.setButtonText("Rotate token").onClick(() => {
        (this.app as any).commands.executeCommandById("reckon:reckon-token-rotate");
      }));

    // Linter settings (vendored, no external plugin needed).
    renderLinterSettings(
      containerEl,
      () => this.plugin.reckonSettings,
      () => this.plugin.saveReckonSettings(),
    );

    // Home page settings (vendored — vault opens to a configurable home).
    renderHomePageSettings(
      containerEl,
      () => this.plugin.reckonSettings,
      async (next) => {
        Object.assign(this.plugin.reckonSettings, next);
        await this.plugin.saveReckonSettings();
      },
    );
  }
}

// Re-export view types for completeness.
export { VIEW_TYPE_RECKON_LIVE, VIEW_TYPE_RECKON_CHAT };
