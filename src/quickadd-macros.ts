import { App, Notice, Plugin } from "obsidian";
import * as fs from "fs";
import * as path from "path";

/**
 * Writes a set of QuickAdd-native JS macros into the vault so users can wire
 * them to QuickAdd's "User Script" choices. We do NOT modify QuickAdd's
 * data.json directly — the user adds the choices manually after running
 * "Reckon: install QuickAdd macros". This keeps Templater out of the loop
 * entirely (QuickAdd's macros use plain async params/quickAddApi).
 */

function vaultRoot(app: App): string {
  return (app.vault.adapter as unknown as { basePath: string }).basePath;
}

const MACROS: Array<{ name: string; body: string }> = [
  {
    name: "reckon-new-charter.js",
    body: `// Reckon: New charter — wizard prompts 3 slots, writes basic-template, applies charter.njk blueprint.
module.exports = async (params) => {
  const { quickAddApi, app } = params;
  const slot1 = await quickAddApi.inputPrompt("Charter slot 1 (title)");
  if (!slot1) return;
  const slot2 = await quickAddApi.inputPrompt("Charter slot 2 (intent)");
  const slot3 = await quickAddApi.inputPrompt("Charter slot 3 (success-criteria)");
  const date = new Date().toISOString().slice(0,10);
  const dir = \`forensics/charters/\${date}\`;
  const folder = app.vault.getAbstractFileByPath(dir);
  if (!folder) await app.vault.createFolder(dir);
  const filename = \`\${dir}/charter-\${Date.now()}.md\`;
  const body = [
    "---",
    \`title: "\${slot1}"\`,
    \`intent: "\${slot2 || ''}"\`,
    \`success: "\${slot3 || ''}"\`,
    \`created: \${new Date().toISOString()}\`,
    "type: charter",
    "---",
    "",
    "> [!charter] " + slot1,
    "> " + (slot2 || ""),
    "",
    "<!-- BLUEPRINT-BEGIN:charter -->",
    "<!-- BLUEPRINT-END:charter -->",
    "",
  ].join("\\n");
  const file = await app.vault.create(filename, body);
  await app.workspace.getLeaf(true).openFile(file);
  // Apply blueprint via Reckon command
  app.commands.executeCommandById("reckon:reckon-apply-blueprint");
};
`,
  },
  {
    name: "reckon-new-manifest.js",
    body: `// Reckon: New manifest — requires charter_ref from dropdown.
module.exports = async (params) => {
  const { quickAddApi, app } = params;
  const charters = app.vault.getMarkdownFiles().filter(f => f.path.includes("forensics/charters/"));
  const choices = charters.map(f => ({ label: f.basename, value: f.path }));
  if (!choices.length) { new Notice("No charters found."); return; }
  const charter_ref = await quickAddApi.suggester(choices.map(c => c.label), choices.map(c => c.value));
  if (!charter_ref) return;
  const task = await quickAddApi.inputPrompt("Task ID (short slug)");
  const date = new Date().toISOString().slice(0,10);
  const dir = \`forensics/manifests/\${date}\`;
  const folder = app.vault.getAbstractFileByPath(dir);
  if (!folder) await app.vault.createFolder(dir);
  const filename = \`\${dir}/manifest-\${task || Date.now()}.md\`;
  const body = [
    "---",
    \`task_id: \${task || 'task-' + Date.now()}\`,
    \`charter_ref: "\${charter_ref}"\`,
    \`bearing: S\`,
    \`mission: ""\`,
    \`created: \${new Date().toISOString()}\`,
    "type: manifest",
    "---",
    "",
    "## Dashboard line",
    "",
    "## Next mission node",
    "",
  ].join("\\n");
  const file = await app.vault.create(filename, body);
  await app.workspace.getLeaf(true).openFile(file);
};
`,
  },
  {
    name: "reckon-promote-anchor.js",
    body: `// Reckon: Promote anchor — reckon_consolidate tier=anchor_promote with current file.
module.exports = async (params) => {
  const { app } = params;
  const file = app.workspace.getActiveFile();
  if (!file) return;
  const reckon = app.plugins.plugins["reckon"];
  if (!reckon || !reckon.settings) { new Notice("Reckon plugin not loaded."); return; }
  const url = reckon.settings.mcpUrl.replace(/\\/+$/, "") + "/tools/reckon_consolidate";
  const fs = require("fs"); const pathmod = require("path");
  let token = null;
  try { token = fs.readFileSync(pathmod.join(app.vault.adapter.basePath, reckon.settings.tokenPath || ".swarmy-token"), "utf8").trim(); } catch {}
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = "Bearer " + token;
  try {
    const r = await fetch(url, { method: "POST", headers, body: JSON.stringify({ tier: "anchor_promote", anchor_path: file.path }) });
    new Notice(r.ok ? "Anchor promoted." : "Promote failed: " + r.status);
  } catch(e) { new Notice("MCP unreachable: " + e.message); }
};
`,
  },
  {
    name: "reckon-cap-honey.js",
    body: `// Reckon: Cap honey droplet — crystallizes current note → forensics/honey/{date}/
module.exports = async (params) => {
  const { app } = params;
  const file = app.workspace.getActiveFile();
  if (!file) return;
  const date = new Date().toISOString().slice(0,10);
  const dir = \`forensics/honey/\${date}\`;
  if (!app.vault.getAbstractFileByPath(dir)) await app.vault.createFolder(dir);
  const target = \`\${dir}/honey-\${Date.now()}-\${file.basename}.md\`;
  const src = await app.vault.read(file);
  const fm = [
    "---",
    "type: honey-droplet",
    \`crystallized_from: "\${file.path}"\`,
    \`crystallized_at: \${new Date().toISOString()}\`,
    "---",
    "",
    "> [!honey] Crystallized droplet",
    "",
    src,
  ].join("\\n");
  await app.vault.create(target, fm);
  new Notice("Honey droplet capped: " + target);
};
`,
  },
];

export function registerQuickAddMacros(plugin: Plugin) {
  plugin.addCommand({
    id: "reckon-install-quickadd-macros",
    name: "Reckon: install QuickAdd macros",
    callback: () => {
      const root = vaultRoot(plugin.app);
      const dir = path.join(root, "00-SHARED", "QuickAdd-Macros");
      fs.mkdirSync(dir, { recursive: true });
      let n = 0;
      for (const m of MACROS) {
        fs.writeFileSync(path.join(dir, m.name), m.body, "utf8");
        n++;
      }
      new Notice(`Installed ${n} QuickAdd macros to 00-SHARED/QuickAdd-Macros/. Wire them via QuickAdd → Manage Macros → User Script.`, 10000);
    },
  });
}
