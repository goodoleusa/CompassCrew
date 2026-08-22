import { Plugin, TFile } from "obsidian";

const ONE_HOUR = 60 * 60 * 1000;

/**
 * Decorates the file explorer:
 *  - 🐝 icon next to files whose frontmatter has agent_type (AI-authored)
 *  - .compasscrew-honey-glow class on files modified <1h ago
 *
 * Uses Obsidian's metadataCache for frontmatter, and DOM observation on the
 * file-explorer leaf for icon injection.
 */
export function registerFileDecorator(plugin: Plugin) {
  const decorate = () => {
    const explorers = plugin.app.workspace.getLeavesOfType("file-explorer");
    if (!explorers.length) return;
    const now = Date.now();
    for (const leaf of explorers) {
      const root = (leaf.view as any).containerEl as HTMLElement;
      if (!root) continue;
      const items = root.querySelectorAll(".nav-file-title");
      items.forEach((el) => {
        const dataPath = el.getAttribute("data-path");
        if (!dataPath) return;
        const file = plugin.app.vault.getAbstractFileByPath(dataPath);
        if (!(file instanceof TFile)) return;

        // Bee icon for AI-authored notes
        const cache = plugin.app.metadataCache.getFileCache(file);
        const isAi = !!cache?.frontmatter?.agent_type;
        const existing = el.querySelector(".compasscrew-bee-icon");
        if (isAi && !existing) {
          const icon = document.createElement("span");
          icon.className = "compasscrew-bee-icon";
          icon.textContent = "🐝";
          icon.style.marginLeft = "4px";
          el.appendChild(icon);
        } else if (!isAi && existing) {
          existing.remove();
        }

        // Honey glow for fresh files
        const fresh = (now - file.stat.mtime) < ONE_HOUR;
        el.classList.toggle("compasscrew-honey-glow", fresh);
      });
    }
  };

  plugin.registerEvent(plugin.app.workspace.on("layout-change", decorate));
  plugin.registerEvent(plugin.app.metadataCache.on("changed", () => decorate()));
  plugin.registerEvent(plugin.app.vault.on("modify", () => decorate()));
  plugin.app.workspace.onLayoutReady(() => decorate());
  // Periodic refresh to age out the honey-glow class
  const interval = window.setInterval(decorate, 5 * 60 * 1000);
  plugin.register(() => window.clearInterval(interval));
}
