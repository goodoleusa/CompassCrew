import { App, Notice, Plugin } from "obsidian";
import * as fs from "fs";
import * as path from "path";

/**
 * System-prompt round-trip flow:
 *
 *   faerie2/prompts/system/faerie.njk
 *           │
 *           │  (1) "Faerie: import system prompt"
 *           ▼
 *   vault/00-SHARED/SystemPrompts/<name>.md  (mirror, with frontmatter)
 *           │
 *           │  (2) Human drops annotations inline
 *           ▼
 *   vault/Human/<date>/a-*.md  (linked back to source)
 *           │
 *           │  (3) "Faerie: push prompt back" → POST faerie_update_system_prompt
 *           ▼
 *   faerie2 repo branch + PR  (commit-only, never pushed without user)
 *           │
 *           │  (4) Next session reads updated prompt
 *           ▼
 *   loop closed.
 *
 * The plugin never writes to faerie2 directly. It hands the assembled diff
 * + annotations to the MCP tool and lets the server-side perform the git
 * operation under user-controlled credentials.
 */

export interface SystemPromptSettings {
  promptsDir: string;       // absolute path to faerie2/prompts/system
  mcpUrl: string;
  tokenPath: string;
}

export const DEFAULT_SYSTEM_PROMPT_SETTINGS: SystemPromptSettings = {
  promptsDir: "/mnt/d/0local/gitrepos/faerie2/prompts/system",
  mcpUrl: "http://localhost:8765",
  tokenPath: ".faerie-token",
};

function vaultRoot(app: App): string {
  return (app.vault.adapter as unknown as { basePath: string }).basePath;
}
function readToken(app: App, s: SystemPromptSettings): string | null {
  try { return fs.readFileSync(path.join(vaultRoot(app), s.tokenPath), "utf8").trim(); } catch { return null; }
}

export function registerSystemPrompt(plugin: Plugin, getSettings: () => SystemPromptSettings) {
  plugin.addCommand({
    id: "faerie-import-system-prompt",
    name: "Faerie: import system prompt (mirror into vault)",
    callback: async () => {
      const s = getSettings();
      if (!fs.existsSync(s.promptsDir)) {
        new Notice(`Prompts dir not found: ${s.promptsDir}`); return;
      }
      const root = vaultRoot(plugin.app);
      const destDir = path.join(root, "00-SHARED", "SystemPrompts");
      fs.mkdirSync(destDir, { recursive: true });
      let n = 0;
      for (const f of fs.readdirSync(s.promptsDir)) {
        if (!f.endsWith(".njk")) continue;
        const src = fs.readFileSync(path.join(s.promptsDir, f), "utf8");
        const stamp = fs.statSync(path.join(s.promptsDir, f)).mtimeMs;
        const dst = path.join(destDir, f.replace(/\.njk$/, ".md"));
        const body = [
          "---",
          "type: system-prompt-mirror",
          `prompt_file: prompts/system/${f}`,
          `imported: ${new Date().toISOString()}`,
          `source_mtime_ms: ${Math.floor(stamp)}`,
          "---",
          "",
          "> [!propolis] Source-of-truth mirror",
          `> Canonical file: \`prompts/system/${f}\` in **faerie2**. Annotate via Human annotations (CMD+Shift+M). Push edits back with \`Faerie: push prompt back\`.`,
          "",
          "```njk",
          src,
          "```",
          "",
        ].join("\n");
        fs.writeFileSync(dst, body, "utf8");
        n++;
      }
      new Notice(`Imported ${n} system prompts → 00-SHARED/SystemPrompts/`);
    },
  });

  plugin.addCommand({
    id: "faerie-push-system-prompt",
    name: "Faerie: push prompt back (annotations → MCP → faerie2 PR)",
    callback: async () => {
      const file = plugin.app.workspace.getActiveFile();
      if (!file) { new Notice("Open a system-prompt mirror note first."); return; }
      const cache = plugin.app.metadataCache.getFileCache(file);
      const promptFile = cache?.frontmatter?.prompt_file as string | undefined;
      if (!promptFile) { new Notice("This note is not a system-prompt mirror (missing `prompt_file` frontmatter)."); return; }
      const body = await plugin.app.vault.read(file);

      const s = getSettings();
      const token = readToken(plugin.app, s);
      const url = s.mcpUrl.replace(/\/+$/, "") + "/tools/faerie_update_system_prompt";
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      // Extract the fenced njk block as the proposed new body.
      const m = body.match(/```njk\n([\s\S]*?)\n```/);
      const proposed = m ? m[1] : body;
      try {
        const r = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify({
            prompt_file: promptFile,
            proposed_body: proposed,
            mirror_note_path: file.path,
            human_id: process.env.USER || process.env.USERNAME || "obsidian",
          }),
        });
        if (r.ok) new Notice("Prompt update submitted — MCP will open PR on faerie2.");
        else new Notice(`Push failed: ${r.status}`, 8000);
      } catch (e) {
        new Notice(`MCP unreachable: ${(e as Error).message}`, 8000);
      }
    },
  });
}
