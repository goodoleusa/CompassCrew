import { App, ItemView, Plugin, WorkspaceLeaf } from "obsidian";
import * as fs from "fs";
import * as path from "path";

export const VIEW_TYPE_FAERIE_LIVE = "faerie-live";

export interface McpBridgeSettings {
  mcpUrl: string;
  tokenPath: string;
  refreshSeconds: number;
}

export const DEFAULT_MCP_BRIDGE_SETTINGS: McpBridgeSettings = {
  mcpUrl: "http://localhost:8765",
  tokenPath: ".faerie-token",
  refreshSeconds: 60,
};

function vaultRoot(app: App): string {
  return (app.vault.adapter as unknown as { basePath: string }).basePath;
}
function readToken(app: App, s: McpBridgeSettings): string | null {
  try { return fs.readFileSync(path.join(vaultRoot(app), s.tokenPath), "utf8").trim(); } catch { return null; }
}

async function callMcp(s: McpBridgeSettings, token: string | null, tool: string, args: any = {}): Promise<any> {
  const url = s.mcpUrl.replace(/\/+$/, "") + "/tools/" + tool;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const r = await fetch(url, { method: "POST", headers, body: JSON.stringify(args) });
  if (!r.ok) throw new Error(`${tool}: ${r.status}`);
  return await r.json();
}

export class FaerieLiveView extends ItemView {
  private timer: number | null = null;
  constructor(leaf: WorkspaceLeaf, private getSettings: () => McpBridgeSettings) {
    super(leaf);
  }
  getViewType() { return VIEW_TYPE_FAERIE_LIVE; }
  getDisplayText() { return "Faerie Live"; }
  getIcon() { return "compass"; }

  async onOpen() {
    this.render();
    this.timer = window.setInterval(() => this.render(), this.getSettings().refreshSeconds * 1000);
    this.registerEvent(this.app.workspace.on("file-open", () => this.render()));
  }
  async onClose() {
    if (this.timer != null) window.clearInterval(this.timer);
  }

  async render() {
    const root = this.containerEl.children[1] as HTMLElement;
    root.empty();
    root.addClass("faerie-live-pane");
    root.createEl("h2", { text: "Faerie Live" });
    const status = root.createEl("div", { cls: "faerie-live-status", text: "Connecting…" });
    const settings = this.getSettings();
    const token = readToken(this.app, settings);

    const sections = [
      { name: "Dashboard", tool: "faerie_dashboard" },
      { name: "Metrics", tool: "faerie_metrics" },
      { name: "Charters", tool: "faerie_charters" },
    ];

    for (const sec of sections) {
      const h = root.createEl("h3", { text: sec.name });
      const box = root.createEl("pre", { cls: "faerie-live-section" });
      try {
        const data = await callMcp(settings, token, sec.tool, {});
        box.setText(typeof data === "string" ? data : JSON.stringify(data, null, 2));
        // Charters as clickable list
        if (sec.tool === "faerie_charters" && Array.isArray((data as any)?.charters)) {
          box.empty();
          for (const c of (data as any).charters) {
            const a = box.createEl("a", { text: c.title || c.path });
            a.href = "#";
            a.onclick = (e) => {
              e.preventDefault();
              if (c.path) this.app.workspace.openLinkText(c.path, "", false);
            };
            box.createEl("br");
          }
        }
      } catch (e) {
        box.setText("⚠ " + (e as Error).message);
      }
      h.appendText("");
    }
    status.setText(`Last refresh: ${new Date().toLocaleTimeString()}  •  MCP: ${settings.mcpUrl}`);
  }
}

export function registerMcpBridge(plugin: Plugin, getSettings: () => McpBridgeSettings) {
  plugin.registerView(VIEW_TYPE_FAERIE_LIVE, (leaf) => new FaerieLiveView(leaf, getSettings));
  plugin.addCommand({
    id: "faerie-open-live-pane",
    name: "Faerie: open Live pane",
    callback: async () => {
      const { workspace } = plugin.app;
      let leaf = workspace.getLeavesOfType(VIEW_TYPE_FAERIE_LIVE)[0];
      if (!leaf) {
        leaf = workspace.getRightLeaf(false)!;
        await leaf.setViewState({ type: VIEW_TYPE_FAERIE_LIVE, active: true });
      }
      workspace.revealLeaf(leaf);
    },
  });
}
