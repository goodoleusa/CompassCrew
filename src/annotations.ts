/**
 * Annotations (formerly "marginalia") — human-side note that attaches to
 * an AI artifact and POSTs to the MCP server for COC capture.
 *
 * Vocabulary lock (task #37): folder = `Human/` (vault root), noun =
 * "annotation". MCP contract is `compasscrew_collab` verb=record_annotation
 * (content + address).
 */
import { App, Modal, Notice, Plugin } from "obsidian";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

export interface AnnotationSettings {
  mcpUrl: string;        // e.g. http://localhost:8765
  tokenPath: string;     // relative to vault root; default ".swarmy-token"
  annotationsDir: string; // vault-relative; default "Human"
}

export const DEFAULT_ANNOTATION_SETTINGS: AnnotationSettings = {
  mcpUrl: "http://localhost:8765",
  tokenPath: ".swarmy-token",
  annotationsDir: "Human",
};

/** Back-compat alias (do not use in new code). */
export type MarginaliaSettings = AnnotationSettings;
export const DEFAULT_MARGINALIA_SETTINGS = DEFAULT_ANNOTATION_SETTINGS;

function vaultRoot(app: App): string {
  return (app.vault.adapter as unknown as { basePath: string }).basePath;
}

function readToken(app: App, settings: AnnotationSettings): string | null {
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

class AnnotationModal extends Modal {
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
    contentEl.createEl("h2", { text: "Drop annotation" });
    contentEl.createEl("label", { text: "References AI artifact (vault-relative path):" });
    this.refInput = contentEl.createEl("input", { type: "text" });
    this.refInput.style.width = "100%";
    this.refInput.value = this.defaultRef;
    contentEl.createEl("label", { text: "Annotation:" });
    this.textarea = contentEl.createEl("textarea");
    this.textarea.style.width = "100%";
    this.textarea.style.minHeight = "120px";
    const btn = contentEl.createEl("button", { text: "Save + POST to MCP" });
    btn.onclick = () => {
      const v = this.textarea.value.trim();
      if (!v) { new Notice("Annotation is empty."); return; }
      this.onSubmit(v, this.refInput.value.trim());
      this.close();
    };
  }
  onClose() { this.contentEl.empty(); }
}

async function postAnnotation(baseUrl: string, headers: Record<string, string>, body: any): Promise<{ ok: boolean; status: number }> {
  const base = baseUrl.replace(/\/+$/, "");
  // Canonical contract: compasscrew_collab verb=record_annotation (content + address).
  const res = await fetch(`${base}/tools/compasscrew_collab`, {
    method: "POST", headers, body: JSON.stringify(body),
  });
  return { ok: res.ok, status: res.status };
}

async function maybeOfferMigration(plugin: Plugin) {
  const root = vaultRoot(plugin.app);
  const legacy = path.join(root, "00-SHARED", "Marginalia");
  const target = path.join(root, "Human");
  if (!fs.existsSync(legacy)) return;
  // Only prompt once per session.
  const flag = (plugin as any)._annotationMigrationPromptShown;
  if (flag) return;
  (plugin as any)._annotationMigrationPromptShown = true;

  const notice = new Notice(
    "CompassCrew: legacy 00-SHARED/Marginalia/ found. Click to migrate to Human/.",
    0,
  );
  // @ts-ignore obsidian's Notice exposes noticeEl
  const el = (notice as any).noticeEl as HTMLElement | undefined;
  if (!el) return;
  el.style.cursor = "pointer";
  el.addEventListener("click", () => {
    try {
      fs.mkdirSync(target, { recursive: true });
      const walk = (d: string) => {
        for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
          const src = path.join(d, entry.name);
          const rel = path.relative(legacy, src);
          const dest = path.join(target, rel);
          if (entry.isDirectory()) {
            fs.mkdirSync(dest, { recursive: true });
            walk(src);
          } else {
            fs.mkdirSync(path.dirname(dest), { recursive: true });
            fs.renameSync(src, dest);
            // Rewrite frontmatter references that point at old path.
            try {
              const txt = fs.readFileSync(dest, "utf8");
              const rewritten = txt
                .replace(/00-SHARED\/Marginalia\//g, "Human/")
                .replace(/marginalia_path:/g, "annotation_path:");
              if (rewritten !== txt) fs.writeFileSync(dest, rewritten, "utf8");
            } catch { /* leave file content untouched on read failure */ }
          }
        }
      };
      walk(legacy);
      new Notice(`Migrated annotations to ${path.relative(root, target)}/.`, 6000);
    } catch (e) {
      new Notice(`Migration failed: ${(e as Error).message}`, 8000);
    }
    notice.hide();
  });
}

export function registerAnnotations(
  plugin: Plugin,
  getSettings: () => AnnotationSettings,
) {
  // One-time migration offer on plugin load.
  maybeOfferMigration(plugin);

  plugin.addCommand({
    id: "compasscrew-drop-annotation",
    name: "CompassCrew: drop annotation (attach to current note)",
    callback: () => {
      const file = plugin.app.workspace.getActiveFile();
      const defaultRef = file ? file.path : "";
      new AnnotationModal(plugin.app, defaultRef, async (note, refPath) => {
        const settings = getSettings();
        const root = vaultRoot(plugin.app);
        const date = new Date().toISOString().slice(0, 10);
        const ts = Date.now();
        const annDir = settings.annotationsDir || "Human";
        const dir = path.join(root, annDir, date);
        fs.mkdirSync(dir, { recursive: true });
        const filename = `a-${ts}.md`;
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

        const token = readToken(plugin.app, settings);
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (token) headers["Authorization"] = `Bearer ${token}`;
        const body = {
          verb: "record_annotation",
          content: note,
          address: path.join(annDir, date, filename),
          references_ai_artifact: { path: refPath, sha256: sha },
        };
        try {
          const r = await postAnnotation(settings.mcpUrl, headers, body);
          if (r.ok) {
            new Notice(`Annotation saved + MCP recorded (${filename}).`);
          } else {
            new Notice(`Annotation saved locally; MCP POST failed: ${r.status}`, 6000);
          }
        } catch (e) {
          new Notice(`Annotation saved locally; MCP unreachable: ${(e as Error).message}`, 6000);
        }
      }).open();
    },
  });

  // Back-compat command id (so existing user keybindings keep working).
  plugin.addCommand({
    id: "compasscrew-add-margin-note",
    name: "CompassCrew: add margin note (deprecated alias)",
    callback: () => {
      (plugin as any).app.commands.executeCommandById(`${plugin.manifest.id}:compasscrew-drop-annotation`);
    },
  });
}

/** Back-compat export so callers using the old name keep compiling. */
export const registerMarginalia = registerAnnotations;
