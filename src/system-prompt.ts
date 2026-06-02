import { App, Notice, Plugin } from "obsidian";
import * as fs from "fs";
import * as path from "path";
import { DEMO_BEARER } from "./mcp-bridge";

/**
 * System-prompt round-trip flow:
 *
 *   swarmy/prompts/system/swarmy.njk
 *           │
 *           │  (1) "Swarmy: import system prompt"
 *           ▼
 *   vault/00-SHARED/SystemPrompts/<name>.md  (mirror, with frontmatter)
 *           │
 *           │  (2) Human drops annotations inline
 *           ▼
 *   vault/Human/<date>/a-*.md  (linked back to source)
 *           │
 *           │  (3) "Swarmy: push prompt back" → POST swarmy_update_system_prompt
 *           ▼
 *   swarmy repo branch + PR  (commit-only, never pushed without user)
 *           │
 *           │  (4) Next session reads updated prompt
 *           ▼
 *   loop closed.
 *
 * The plugin never writes to swarmy directly. It hands the assembled diff
 * + annotations to the MCP tool and lets the server-side perform the git
 * operation under user-controlled credentials.
 */

export interface SystemPromptSettings {
  promptsDir: string;       // absolute path to swarmy/prompts/system
  mcpUrl: string;
  tokenPath: string;
}

export const DEFAULT_SYSTEM_PROMPT_SETTINGS: SystemPromptSettings = {
  promptsDir: "/mnt/d/0local/gitrepos/swarmy/prompts/system",
  mcpUrl: "http://localhost:8765",
  tokenPath: ".swarmy-token",
};

function vaultRoot(app: App): string {
  return (app.vault.adapter as unknown as { basePath: string }).basePath;
}
/**
 * Resolve the effective bearer token. Falls back to DEMO_BEARER so the
 * plugin auto-connects in read-only demo mode on a fresh vault clone.
 */
function readToken(app: App, s: SystemPromptSettings): string {
  try {
    const t = fs.readFileSync(path.join(vaultRoot(app), s.tokenPath), "utf8").trim();
    if (t) return t;
  } catch { /* absent */ }
  return DEMO_BEARER;
}

export function registerSystemPrompt(plugin: Plugin, getSettings: () => SystemPromptSettings) {
  plugin.addCommand({
    id: "swarmy-import-system-prompt",
    name: "Swarmy: import system prompt (mirror into vault)",
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
          `> Canonical file: \`prompts/system/${f}\` in **swarmy**. Annotate via Human annotations (CMD+Shift+M). Push edits back with \`Swarmy: push prompt back\`.`,
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
    id: "swarmy-push-system-prompt",
    name: "Swarmy: push prompt back (annotations → MCP → swarmy PR)",
    callback: async () => {
      const file = plugin.app.workspace.getActiveFile();
      if (!file) { new Notice("Open a system-prompt mirror note first."); return; }
      const cache = plugin.app.metadataCache.getFileCache(file);
      const promptFile = cache?.frontmatter?.prompt_file as string | undefined;
      if (!promptFile) { new Notice("This note is not a system-prompt mirror (missing `prompt_file` frontmatter)."); return; }
      const body = await plugin.app.vault.read(file);

      const s = getSettings();
      const token = readToken(plugin.app, s);
      const url = s.mcpUrl.replace(/\/+$/, "") + "/tools/swarmy_update_system_prompt";
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      };

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
        if (!r.ok) { new Notice(`Push failed: ${r.status}`, 8000); return; }
        const data = await r.json();
        if (data?.error_type === "tier_gate") {
          new Notice(
            `Sign-in required to push prompts.\nUpgrade: ${data.upgrade_url || "https://swarmy.retrofuture.tech/signup"}`,
            10000
          );
          return;
        }
        new Notice("Prompt update submitted — MCP will open PR on swarmy.");
      } catch (e) {
        new Notice(`MCP unreachable: ${(e as Error).message}`, 8000);
      }
    },
  });

  /**
   * "Push system prompt to session" — D3 hive command.
   *
   * Reads the current note (must be in OH-System-Prompts/ or 00-SHARED/SystemPrompts/).
   * Calls swarmy_prompt verb=update via MCP to write back to the .njk file and
   * broadcast a reload signal so active OH sessions pick up the new prompt on
   * the next agent turn.
   *
   * On tier_gate (demo or free caller) — shows the upgrade prompt modal.
   */
  plugin.addCommand({
    id: "swarmy-push-system-prompt-to-session",
    name: "Swarmy: push system prompt to OH session (pro required)",
    callback: async () => {
      const file = plugin.app.workspace.getActiveFile();
      if (!file) { new Notice("Open an OH-System-Prompts note first."); return; }

      // Accept notes in OH-System-Prompts/ or 00-SHARED/SystemPrompts/
      const inPromptFolder =
        file.path.startsWith("OH-System-Prompts/") ||
        file.path.startsWith("00-SHARED/SystemPrompts/");
      if (!inPromptFolder) {
        new Notice(
          "This command works only on notes inside OH-System-Prompts/ or 00-SHARED/SystemPrompts/.",
          8000
        );
        return;
      }

      const body = await plugin.app.vault.read(file);
      const cache = plugin.app.metadataCache.getFileCache(file);
      // Derive prompt_name from frontmatter or filename
      const promptName: string =
        (cache?.frontmatter?.prompt_file as string | undefined) ||
        file.basename + ".njk";

      // Extract .njk content from fenced block if present, otherwise use full body
      const m = body.match(/```njk\n([\s\S]*?)\n```/);
      const newContent = m ? m[1] : body;

      const s = getSettings();
      const token = readToken(plugin.app, s);
      const url = s.mcpUrl.replace(/\/+$/, "") + "/tools/swarmy_prompt";
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      };

      try {
        const r = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify({
            verb: "update",
            prompt_name: promptName,
            new_content: newContent,
          }),
        });
        if (!r.ok) { new Notice(`Push failed: HTTP ${r.status}`, 8000); return; }
        const data = await r.json();
        if (data?.error_type === "tier_gate") {
          new Notice(
            `Pro subscription required to push system prompts to OH sessions.\n` +
            `Upgrade at: ${data.upgrade_url || "https://swarmy.retrofuture.tech/signup"}`,
            12000
          );
          return;
        }
        if (data?.ok) {
          new Notice(
            `System prompt "${promptName}" pushed to OH session.\n` +
            `Reload signal broadcast — active agents pick up on next turn.`,
            8000
          );
        } else {
          new Notice(`Push failed: ${data?.error || "unknown error"}`, 8000);
        }
      } catch (e) {
        new Notice(`MCP unreachable: ${(e as Error).message}`, 8000);
      }
    },
  });
}
