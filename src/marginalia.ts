import { App, Modal, Notice, Plugin } from "obsidian";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

export interface MarginaliaSettings {
  mcpUrl: string;        // e.g. http://localhost:8765
  tokenPath: string;     // relative to vault root; default ".faerie-token"
}

export const DEFAULT_MARGINALIA_SETTINGS: MarginaliaSettings = {
  mcpUrl: "http://localhost:8765",
  tokenPath: ".faerie-token",
};

function vaultRoot(app: App): string {
  return (app.vault.adapter as unknown as { basePath: string }).basePath;
}

function readToken(app: App, settings: MarginaliaSettings): string | null {
  try {
    return fs.readFileSync(path.join(vaultRoot(app), settings.tokenPath), "utf8").trim();
  } catch { return null; }
}

function sha256OfFile(p: string): string | null {
  try {
    const buf = fs.readFileSync(p);
    return crypto.createHash("sha256").update(buf).digest("hex");
  } catch { return null; }
}

class MarginaliaModal extends Modal {
  textarea!: HTMLTextAreaElement;
  refInput!: HTMLInputElement;
  constructor(
    app: App,
    private defaultRef: string,
    private onSubmit: (note: string, refPath: string) => void,
  ) { super(app); }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Add margin note" });
    contentEl.createEl("label", { text: "References AI artifact (vault-relative path):" });
    this.refInput = contentEl.createEl("input", { type: "text" });
    this.refInput.style.width = "100%";
    this.refInput.value = this.defaultRef;
    contentEl.createEl("label", { text: "Margin note:" });
    this.textarea = contentEl.createEl("textarea");
    this.textarea.style.width = "100%";
    this.textarea.style.minHeight = "120px";
    const btn = contentEl.createEl("button", { text: "Save + POST to MCP" });
    btn.onclick = () => {
      const v = this.textarea.value.trim();
      if (!v) { new Notice("Margin note is empty."); return; }
      this.onSubmit(v, this.refInput.value.trim());
      this.close();
    };
  }
  onClose() { this.contentEl.empty(); }
}

export function registerMarginalia(
  plugin: Plugin,
  getSettings: () => MarginaliaSettings,
) {
  plugin.addCommand({
    id: "faerie-add-margin-note",
    name: "Faerie: add margin note (attach to current note)",
    callback: () => {
      const file = plugin.app.workspace.getActiveFile();
      const defaultRef = file ? file.path : "";
      new MarginaliaModal(plugin.app, defaultRef, async (note, refPath) => {
        const root = vaultRoot(plugin.app);
        const date = new Date().toISOString().slice(0, 10);
        const ts = Date.now();
        const dir = path.join(root, "00-SHARED", "Marginalia", date);
        fs.mkdirSync(dir, { recursive: true });
        const filename = `m-${ts}.md`;
        const absRef = refPath ? path.join(root, refPath) : "";
        const sha = absRef ? sha256OfFile(absRef) : null;
        const fm = [
          "---",
          `source: human`,
          `agent_id: human:${process.env.USER || process.env.USERNAME || "obsidian"}`,
          `created: ${new Date().toISOString()}`,
          `references_ai_artifact:`,
          `  path: ${refPath || ""}`,
          `  sha256: ${sha || ""}`,
          "---",
          "",
          note,
          "",
        ].join("\n");
        fs.writeFileSync(path.join(dir, filename), fm, "utf8");

        // POST to MCP. faerie_record_marginalia tool.
        const url = getSettings().mcpUrl.replace(/\/+$/, "") + "/tools/faerie_record_marginalia";
        const token = readToken(plugin.app, getSettings());
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (token) headers["Authorization"] = `Bearer ${token}`;
        try {
          const res = await fetch(url, {
            method: "POST",
            headers,
            body: JSON.stringify({
              marginalia_path: path.join("00-SHARED", "Marginalia", date, filename),
              references: { path: refPath, sha256: sha },
              note,
            }),
          });
          if (res.ok) new Notice(`Margin note saved + MCP recorded (${filename}).`);
          else new Notice(`Margin note saved locally; MCP POST failed: ${res.status}`, 6000);
        } catch (e) {
          new Notice(`Margin note saved locally; MCP unreachable: ${(e as Error).message}`, 6000);
        }
      }).open();
    },
  });
}
