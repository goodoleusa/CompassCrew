import { ItemView, Notice, Plugin, WorkspaceLeaf } from "obsidian";
import * as fs from "fs";
import * as path from "path";

export const VIEW_TYPE_SWARMY_CHAT = "swarmy-chat";

/**
 * Lightweight in-vault Swarmy session.
 *
 * Mode: "Plugin-only Swarmy" — the user can run an entire light session
 * without ever leaving Obsidian. The chat panel POSTs messages to the MCP
 * `swarmy_chat` tool, streams the response (rendered as markdown), and
 * provides an EXPLICIT "Push to vault" button that promotes the current
 * conversation into a session report + commits the touched files (via the
 * `swarmy_session_finalize` MCP tool).
 *
 * Nothing leaves the vault automatically. Every push is human-initiated.
 */
export class SwarmyChatView extends ItemView {
  private messages: { role: "user" | "assistant"; text: string }[] = [];
  private input!: HTMLTextAreaElement;
  private log!: HTMLDivElement;

  constructor(
    leaf: WorkspaceLeaf,
    private getMcpUrl: () => string,
    private getTokenPath: () => string,
  ) { super(leaf); }

  getViewType() { return VIEW_TYPE_SWARMY_CHAT; }
  getDisplayText() { return "Swarmy Chat"; }
  getIcon() { return "message-circle"; }

  async onOpen() {
    const root = this.containerEl.children[1] as HTMLElement;
    root.empty();
    root.addClass("swarmy-chat-pane");
    root.createEl("h2", { text: "Swarmy Chat (plugin-only session)" });
    this.log = root.createEl("div", { cls: "swarmy-chat-log" });
    this.input = root.createEl("textarea", { cls: "swarmy-chat-input" });
    this.input.placeholder = "Talk to Swarmy… (Ctrl+Enter to send)";
    this.input.style.width = "100%";
    this.input.style.minHeight = "80px";
    this.input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        this.send();
      }
    });
    const row = root.createDiv({ cls: "swarmy-chat-buttons" });
    const sendBtn = row.createEl("button", { text: "Send" });
    sendBtn.onclick = () => this.send();
    const pushBtn = row.createEl("button", { text: "Push session to vault" });
    pushBtn.onclick = () => this.pushSession();
  }

  private renderLog() {
    this.log.empty();
    for (const m of this.messages) {
      const el = this.log.createEl("div", { cls: `swarmy-chat-msg swarmy-chat-${m.role}` });
      el.createEl("strong", { text: m.role === "user" ? "You" : "Swarmy" });
      const body = el.createEl("div");
      body.setText(m.text);
    }
    this.log.scrollTop = this.log.scrollHeight;
  }

  private token(): string | null {
    try {
      const vault = (this.app.vault.adapter as any).basePath as string;
      return fs.readFileSync(path.join(vault, this.getTokenPath()), "utf8").trim();
    } catch { return null; }
  }

  private async send() {
    const text = this.input.value.trim();
    if (!text) return;
    this.messages.push({ role: "user", text });
    this.input.value = "";
    this.renderLog();

    const url = this.getMcpUrl().replace(/\/+$/, "") + "/tools/swarmy_chat";
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const tok = this.token();
    if (tok) headers["Authorization"] = `Bearer ${tok}`;
    try {
      const r = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({ messages: this.messages.slice(-20) }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      const reply = (data as any).reply || (data as any).text || JSON.stringify(data);
      this.messages.push({ role: "assistant", text: reply });
      this.renderLog();
    } catch (e) {
      new Notice("Swarmy unreachable: " + (e as Error).message, 6000);
      this.messages.push({ role: "assistant", text: `⚠ MCP unreachable: ${(e as Error).message}` });
      this.renderLog();
    }
  }

  private async pushSession() {
    const url = this.getMcpUrl().replace(/\/+$/, "") + "/tools/swarmy_session_finalize";
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const tok = this.token();
    if (tok) headers["Authorization"] = `Bearer ${tok}`;
    try {
      const r = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({ messages: this.messages, mode: "plugin-only-light" }),
      });
      if (r.ok) {
        new Notice("Session pushed → forensics/ session report created.");
      } else {
        new Notice("Push failed: " + r.status, 6000);
      }
    } catch (e) {
      new Notice("MCP unreachable: " + (e as Error).message, 6000);
    }
  }
}

export function registerChatPanel(plugin: Plugin, getMcpUrl: () => string, getTokenPath: () => string) {
  plugin.registerView(VIEW_TYPE_SWARMY_CHAT, (leaf) => new SwarmyChatView(leaf, getMcpUrl, getTokenPath));
  plugin.addCommand({
    id: "swarmy-open-chat",
    name: "Swarmy: open chat panel (plugin-only light session)",
    callback: async () => {
      const { workspace } = plugin.app;
      let leaf = workspace.getLeavesOfType(VIEW_TYPE_SWARMY_CHAT)[0];
      if (!leaf) {
        leaf = workspace.getRightLeaf(false)!;
        await leaf.setViewState({ type: VIEW_TYPE_SWARMY_CHAT, active: true });
      }
      workspace.revealLeaf(leaf);
    },
  });
}
