import { ItemView, Notice, Plugin, WorkspaceLeaf } from "obsidian";
import * as fs from "fs";
import * as path from "path";
import { TOOL, callReckonTool } from "./reckon-contract";

export const VIEW_TYPE_COMPASSCREW_CHAT = "compasscrew-chat";

/**
 * Lightweight in-vault CompassCrew session.
 *
 * Mode: "Plugin-only CompassCrew" — the user can run an entire light session
 * without ever leaving Obsidian. The chat panel POSTs messages to the MCP
 * `reckon_chat` tool, streams the response (rendered as markdown), and
 * provides an EXPLICIT "Push to vault" button that promotes the current
 * conversation into a session report + commits the touched files (via the
 * `reckon_system` verb=session_finalize MCP tool).
 *
 * Nothing leaves the vault automatically. Every push is human-initiated.
 */
export class CompassCrewChatView extends ItemView {
  private messages: { role: "user" | "assistant"; text: string }[] = [];
  private input!: HTMLTextAreaElement;
  private log!: HTMLDivElement;

  constructor(
    leaf: WorkspaceLeaf,
    private getMcpUrl: () => string,
    private getTokenPath: () => string,
  ) { super(leaf); }

  getViewType() { return VIEW_TYPE_COMPASSCREW_CHAT; }
  getDisplayText() { return "CompassCrew Chat"; }
  getIcon() { return "message-circle"; }

  async onOpen() {
    const root = this.containerEl.children[1] as HTMLElement;
    root.empty();
    root.addClass("compasscrew-chat-pane");
    root.createEl("h2", { text: "CompassCrew Chat (plugin-only session)" });
    this.log = root.createEl("div", { cls: "compasscrew-chat-log" });
    this.input = root.createEl("textarea", { cls: "compasscrew-chat-input" });
    this.input.placeholder = "Talk to CompassCrew… (Ctrl+Enter to send)";
    this.input.style.width = "100%";
    this.input.style.minHeight = "80px";
    this.input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        this.send();
      }
    });
    const row = root.createDiv({ cls: "compasscrew-chat-buttons" });
    const sendBtn = row.createEl("button", { text: "Send" });
    sendBtn.onclick = () => this.send();
    const pushBtn = row.createEl("button", { text: "Push session to vault" });
    pushBtn.onclick = () => this.pushSession();
  }

  private renderLog() {
    this.log.empty();
    for (const m of this.messages) {
      const el = this.log.createEl("div", { cls: `compasscrew-chat-msg compasscrew-chat-${m.role}` });
      el.createEl("strong", { text: m.role === "user" ? "You" : "CompassCrew" });
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

    try {
      // reckon_chat is single-shot (no server-side conversation persistence);
      // send the latest user turn as `message`. TIER: pro — a free/demo caller gets a
      // TierGateError, which is a different fact from an unreachable server and says so.
      const data = await callReckonTool<Record<string, unknown>>({
        mcpUrl: this.getMcpUrl(), token: this.token() ?? "", tool: TOOL.CHAT, args: { message: text },
      });
      const reply = (data.response || data.reply || data.text || JSON.stringify(data)) as string;
      this.messages.push({ role: "assistant", text: reply });
      this.renderLog();
    } catch (e) {
      new Notice("CompassCrew unreachable: " + (e as Error).message, 6000);
      this.messages.push({ role: "assistant", text: `⚠ MCP unreachable: ${(e as Error).message}` });
      this.renderLog();
    }
  }

  private async pushSession() {
    try {
      const transcript = this.messages.map((m) => `${m.role}: ${m.text}`).join("\n\n");
      await callReckonTool({
        mcpUrl: this.getMcpUrl(), token: this.token() ?? "", tool: TOOL.SYSTEM,
        args: { verb: "session_finalize", session_id: `plugin-${Date.now()}`, transcript_text: transcript },
      });
      new Notice("Session pushed → forensics/ session report created.");
    } catch (e) {
      // callReckonTool throws on non-2xx and on a tier gate, so anything reaching here is a
      // real failure with a real cause — never a silently-swallowed bad status.
      new Notice("Session push failed: " + (e as Error).message, 6000);
    }
  }
}

export function registerChatPanel(plugin: Plugin, getMcpUrl: () => string, getTokenPath: () => string) {
  plugin.registerView(VIEW_TYPE_COMPASSCREW_CHAT, (leaf) => new CompassCrewChatView(leaf, getMcpUrl, getTokenPath));
  plugin.addCommand({
    id: "compasscrew-open-chat",
    name: "CompassCrew: open chat panel (plugin-only light session)",
    callback: async () => {
      const { workspace } = plugin.app;
      let leaf = workspace.getLeavesOfType(VIEW_TYPE_COMPASSCREW_CHAT)[0];
      if (!leaf) {
        leaf = workspace.getRightLeaf(false)!;
        await leaf.setViewState({ type: VIEW_TYPE_COMPASSCREW_CHAT, active: true });
      }
      workspace.revealLeaf(leaf);
    },
  });
}
