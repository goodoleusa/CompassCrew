import { ItemView, Plugin, WorkspaceLeaf } from "obsidian";
import * as fs from "fs";
import * as path from "path";
import {
  RECKON_MCP_CONTRACT_REV,
  RECKON_SIGNUP_URL,
  TOOL,
  TierGateError,
  callReckonTool,
  resolveToken,
  vaultRoot,
  type McpBridgeSettings,
  type ReckonTool,
} from "./reckon-contract";

/**
 * mcp-bridge.ts — the Live pane. Reads three surfaces off a reckon MCP server on a timer.
 *
 * The tool names, the verbs and the call door all come from `reckon-contract.ts`; nothing in this
 * file may hard-code a wire string. Before that split, this view called the rebranded names
 * `compasscrew_dashboard` / `compasscrew_metrics` / `compasscrew_charter` — three names no
 * reckon server has ever registered — and rendered the resulting 404 with the same "⚠" as a connection
 * refusal, so the pane looked broken in exactly the same way whether the server was down or the
 * client was talking nonsense. Distinguishing those two is the reason `callReckonTool` throws
 * `McpHttpError` with a status instead of a bare Error.
 */

export const VIEW_TYPE_COMPASSCREW_LIVE = "compasscrew-live";

// Re-exported for the settings tab and other callers. The DEFINITIONS live in reckon-contract.ts
// — one home, so a rename cannot land in half the codebase.
export {
  DEMO_BEARER,
  DEFAULT_MCP_BRIDGE_SETTINGS,
  RECKON_SIGNUP_URL as COMPASSCREW_SIGNUP_URL,
  RECKON_WEB_HOST as COMPASSCREW_WEB_HOST,
  type McpBridgeSettings,
} from "./reckon-contract";

/** The three reads the Live pane makes, as data. */
const LIVE_SECTIONS: ReadonlyArray<{ name: string; tool: ReckonTool; args: Record<string, unknown> }> = [
  { name: "Dashboard", tool: TOOL.DASHBOARD, args: { verb: "status" } },
  { name: "Metrics", tool: TOOL.METRICS, args: { verb: "read" } },
  { name: "Charters", tool: TOOL.CHARTER, args: { verb: "list", status: "active" } },
];

export class CompassCrewLiveView extends ItemView {
  private timer: number | null = null;
  constructor(leaf: WorkspaceLeaf, private getSettings: () => McpBridgeSettings) { super(leaf); }
  getViewType() { return VIEW_TYPE_COMPASSCREW_LIVE; }
  getDisplayText() { return "CompassCrew Live"; }
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
    root.addClass("compasscrew-live-pane");
    root.createEl("h2", { text: "CompassCrew Live" });
    const status = root.createEl("div", { cls: "compasscrew-live-status", text: "Connecting…" });
    const settings = this.getSettings();
    const { token, isDemo } = resolveToken(fs, path.join, vaultRoot(this.app as never), settings.tokenPath);

    if (isDemo) {
      const banner = root.createEl("div", { cls: "compasscrew-demo-banner" });
      const label = banner.createEl("span", { text: "Demo mode", cls: "compasscrew-demo-label" });
      label.setAttr("aria-label", "read-only demo tier");
      banner.appendText(" — read-only. ");
      const link = banner.createEl("a", { text: "Sign in", href: RECKON_SIGNUP_URL });
      link.addClass("compasscrew-demo-link");
      banner.appendText(" for full access.");
    }

    for (const sec of LIVE_SECTIONS) {
      root.createEl("h3", { text: sec.name });
      const box = root.createEl("pre", { cls: "compasscrew-live-section" });
      try {
        const data = await callReckonTool<Record<string, unknown>>({
          mcpUrl: settings.mcpUrl, token, tool: sec.tool, args: sec.args,
        });
        box.setText(typeof data === "string" ? data : JSON.stringify(data, null, 2));
        if (sec.tool === TOOL.CHARTER && Array.isArray(data["charters"])) {
          box.empty();
          for (const c of data["charters"] as Array<{ title?: string; path?: string }>) {
            const a = box.createEl("a", { text: c.title || c.path || "(untitled)" });
            a.href = "#";
            a.onclick = (e) => { e.preventDefault(); if (c.path) this.app.workspace.openLinkText(c.path, "", false); };
            box.createEl("br");
          }
        }
      } catch (e) {
        // Three distinct failures, three distinct messages. Collapsing them is what hid the
        // wrong tool names for three rebrands.
        if (e instanceof TierGateError) box.setText(`Sign in for full access → ${e.upgradeUrl}`);
        else if ((e as { status?: number }).status === 404) {
          box.setText(`⚠ ${sec.tool} is not registered on ${settings.mcpUrl} (HTTP 404).\n` +
                      `This client speaks the reckon MCP surface as of ${RECKON_MCP_CONTRACT_REV}.`);
        } else box.setText("⚠ " + (e as Error).message);
      }
    }
    status.setText(
      `Last refresh: ${new Date().toLocaleTimeString()}  •  MCP: ${settings.mcpUrl}` +
      `  •  contract ${RECKON_MCP_CONTRACT_REV}${isDemo ? "  •  demo mode" : ""}`,
    );
  }
}

export function registerMcpBridge(plugin: Plugin, getSettings: () => McpBridgeSettings) {
  plugin.registerView(VIEW_TYPE_COMPASSCREW_LIVE, (leaf) => new CompassCrewLiveView(leaf, getSettings));
  plugin.addCommand({
    id: "compasscrew-open-live-pane",
    name: "CompassCrew: open Live pane",
    callback: async () => {
      const { workspace } = plugin.app;
      let leaf = workspace.getLeavesOfType(VIEW_TYPE_COMPASSCREW_LIVE)[0];
      if (!leaf) {
        leaf = workspace.getRightLeaf(false)!;
        await leaf.setViewState({ type: VIEW_TYPE_COMPASSCREW_LIVE, active: true });
      }
      workspace.revealLeaf(leaf);
    },
  });
}
