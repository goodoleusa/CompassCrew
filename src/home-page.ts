/**
 * home-page.ts — open a configured home page on Obsidian startup.
 *
 * Aligns with the one-plugin philosophy: no external Home Tab plugin required.
 * Settings tab gets a "Home page path" field (default 00-SHARED/Dashboards/00-Home.md).
 * On layout-ready, if no file is active, opens the home page.
 * Also registers `CompassCrew: open home` command for manual jump.
 *
 * Graceful degradation: if the configured file doesn't exist, shows a Notice
 * with the configured path so user can fix it; does not crash.
 */
import { App, Plugin, PluginSettingTab, Setting, Notice, TFile, normalizePath } from "obsidian";

export interface HomePageSettings {
  homePagePath: string;        // vault-relative path
  openOnStartup: boolean;      // open home if no file is active
  alwaysOpenOnStartup: boolean; // open home regardless of restore-last-session
}

export const DEFAULT_HOME_PAGE_SETTINGS: HomePageSettings = {
  homePagePath: "00-SHARED/Dashboards/00-Home.md",
  openOnStartup: true,
  alwaysOpenOnStartup: false,
};

export async function openHomePage(app: App, settings: HomePageSettings): Promise<void> {
  const path = normalizePath(settings.homePagePath);
  const file = app.vault.getAbstractFileByPath(path);
  if (!file || !(file instanceof TFile)) {
    new Notice(
      `CompassCrew home page not found at "${path}". Set a valid path in plugin Settings → Home Page.`,
      8000,
    );
    return;
  }
  const leaf = app.workspace.getLeaf(false); // current leaf or new
  await leaf.openFile(file, { active: true });
}

export function registerHomePage(
  plugin: Plugin,
  getSettings: () => HomePageSettings,
  saveSettings: () => Promise<void>,
): void {
  // Open home on startup if configured + no file currently active
  plugin.app.workspace.onLayoutReady(async () => {
    const settings = getSettings();
    if (!settings.openOnStartup) return;

    const activeFile = plugin.app.workspace.getActiveFile();
    if (activeFile && !settings.alwaysOpenOnStartup) return; // respect last-session restore

    await openHomePage(plugin.app, settings);
  });

  // Manual jump command
  plugin.addCommand({
    id: "compasscrew-open-home",
    name: "CompassCrew: open home",
    callback: async () => {
      await openHomePage(plugin.app, getSettings());
    },
  });
}

/**
 * Settings tab section. Call from the plugin's main SettingTab.display() method.
 */
export function renderHomePageSettings(
  containerEl: HTMLElement,
  getSettings: () => HomePageSettings,
  saveSettings: (next: Partial<HomePageSettings>) => Promise<void>,
): void {
  containerEl.createEl("h3", { text: "Home page" });

  new Setting(containerEl)
    .setName("Home page path")
    .setDesc(
      "Vault-relative path to your home note. Default is 00-SHARED/Dashboards/00-Home.md. " +
        "The plugin opens this file when Obsidian starts (if no file is restored).",
    )
    .addText((text) =>
      text
        .setPlaceholder("00-SHARED/Dashboards/00-Home.md")
        .setValue(getSettings().homePagePath)
        .onChange(async (value) => {
          await saveSettings({ homePagePath: value.trim() || DEFAULT_HOME_PAGE_SETTINGS.homePagePath });
        }),
    );

  new Setting(containerEl)
    .setName("Open home on startup")
    .setDesc("Open the home page when Obsidian launches if no file is active.")
    .addToggle((toggle) =>
      toggle.setValue(getSettings().openOnStartup).onChange(async (value) => {
        await saveSettings({ openOnStartup: value });
      }),
    );

  new Setting(containerEl)
    .setName("Always open home (override restore)")
    .setDesc(
      "Open the home page even if Obsidian restored a previous session. Useful for keeping " +
        "orientation as the default landing experience.",
    )
    .addToggle((toggle) =>
      toggle.setValue(getSettings().alwaysOpenOnStartup).onChange(async (value) => {
        await saveSettings({ alwaysOpenOnStartup: value });
      }),
    );
}
