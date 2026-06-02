import { App, ItemView, Plugin, WorkspaceLeaf } from "obsidian";
import * as fs from "fs";
import * as path from "path";

export const VIEW_TYPE_SWARMY_LIVE = "swarmy-live";

/**
 * DEMO_BEARER — public no-signup fallback token.
 *
 * When the vault has no .swarmy-token file, the plugin uses this constant
 * so a fresh clone auto-connects to the MCP server in read-only demo mode.
 * The MCP server recognises this exact string in validate_token() and returns
 * tier="demo" with user_id="public-demo" (no tokens.json lookup).
 *
 * Demo callers can access read-only tools (swarmy_prompt list/get/view,
 * manifest_list, mission_graph, etc.) but are denied write/spawn tools with
 * a {error_type:"tier_gate"} response that the hive plugin renders as an
 * upgrade prompt instead of a raw error.
 *
 * See: deploy/mcp-server/auth.py DEMO_BEARER constant (must stay in sync).
 * See: deploy/mcp-server/tools/_TIER-AUDIT-2026-05-25.md for the full
 *      demo-safe tool list.
 */
export const DEMO_BEARER = "demo:public-readonly:v1";

export interface McpBridgeSettings {
  mcpUrl: string;
  tokenPath: string;
  refreshSeconds: number;
}

export const DEFAULT_MCP_BRIDGE_SETTINGS: McpBridgeSettings = {
  mcpUrl: "http://localhost:8765",
  tokenPath: ".swarmy-token",
  refreshSeconds: 60,
};

function vaultRoot(app: App): string {
  return (app.vault.adapter as unknown as { basePath: string }).basePath;
}

/**
 * Resolve the effective bearer token for MCP calls.
 *
 * Priority:
 *   1. Contents of the .swarmy-token file in the vault root (user-provisioned).
 *   2. DEMO_BEARER constant — used when the file is absent or empty.
 *      This enables zero-signup auto-connect for a fresh vault clone.
 */
function readToken(app: App, s: McpBridgeSettings): string {
  try {
    const t = fs.readFileSync(path.join(vaultRoot(app), s.tokenPath), "utf8").trim();
    if (t) return t;
  } catch { /* file absent — fall through to demo */ }
  return DEMO_BEARER;
}

async function callMcp(s: McpBridgeSettings, token: string, tool: string, args: any = {}): Promise<any> {
  const url = s.mcpUrl.replace(/\/+$/, "") + "/tools/" + tool;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`,
  };
  const r = await fetch(url, { method: "POST", headers, body: JSON.stringify(args) });
  if (!r.ok) throw new Error(`${tool}: ${r.status}`);
  const data = await r.json();
  // Surface tier-gate responses as a special error type so the UI can show
  // an upgrade prompt instead of a raw error message.
  if (data && data.error_type === "tier_gate") {
    const upgradeUrl = data.upgrade_url || "https://swarmy.retrofuture.tech/signup";
    throw Object.assign(
      new Error(`${tool}: sign-in required — ${upgradeUrl}`),
      { isTierGate: true, upgradeUrl }
    );
  }
  return data;
}

export class SwarmyLiveView extends ItemView {
  private timer: number | null = null;
  constructor(leaf: WorkspaceLeaf, private getSettings: () => McpBridgeSettings) {
    super(leaf);
  }
  getViewType() { return VIEW_TYPE_SWARMY_LIVE; }
  getDisplayText() { return "Swarmy Live"; }
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
    root.addClass("swarmy-live-pane");
    root.createEl("h2", { text: "Swarmy Live" });
    const status = root.createEl("div", { cls: "swarmy-live-status", text: "Connecting…" });
    const settings = this.getSettings();
    const token = readToken(this.app, settings); // always non-null (DEMO_BEARER fallback)
    const isDemo = token === DEMO_BEARER;

    const sections = [
      { name: "Dashboard", tool: "swarmy_dashboard" },
      { name: "Metrics", tool: "swarmy_metrics" },
      { name: "Charters", tool: "swarmy_charters" },
    ];

    // Show demo mode banner so users know they're in read-only mode.
    if (isDemo) {
      const banner = root.createEl("div", { cls: "swarmy-demo-banner" });
      banner.style.cssText = "background:#1a1a2e;border:1px solid #f0a500;border-radius:4px;padding:6px 10px;margin-bottom:8px;font-size:0.85em;";
      banner.innerHTML = `<span style="color:#f0a500;">Demo mode</span> — read-only. <a href="https://swarmy.retrofuture.tech/signup" style="color:#f0a500;">Sign in</a> for full access.`;
    }

    for (const sec of sections) {
      const h = root.createEl("h3", { text: sec.name });
      const box = root.createEl("pre", { cls: "swarmy-live-section" });
      try {
        const data = await callMcp(settings, token, sec.tool, {});
        box.setText(typeof data === "string" ? data : JSON.stringify(data, null, 2));
        // Charters as clickable list
        if (sec.tool === "swarmy_charters" && Array.isArray((data as any)?.charters)) {
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
        const err = e as any;
        if (err.isTierGate) {
          box.setText(`Sign in for full access → ${err.upgradeUrl || "https://swarmy.retrofuture.tech/signup"}`);
        } else {
          box.setText("⚠ " + err.message);
        }
      }
      h.appendText("");
    }
    status.setText(`Last refresh: ${new Date().toLocaleTimeString()}  •  MCP: ${settings.mcpUrl}${isDemo ? "  •  demo mode" : ""}`);
  }
}

export function registerMcpBridge(plugin: Plugin, getSettings: () => McpBridgeSettings) {
  plugin.registerView(VIEW_TYPE_SWARMY_LIVE, (leaf) => new SwarmyLiveView(leaf, getSettings));
  plugin.addCommand({
    id: "swarmy-open-live-pane",
    name: "Swarmy: open Live pane",
    callback: async () => {
      const { workspace } = plugin.app;
      let leaf = workspace.getLeavesOfType(VIEW_TYPE_SWARMY_LIVE)[0];
      if (!leaf) {
        leaf = workspace.getRightLeaf(false)!;
        await leaf.setViewState({ type: VIEW_TYPE_SWARMY_LIVE, active: true });
      }
      workspace.revealLeaf(leaf);
    },
  });
}
