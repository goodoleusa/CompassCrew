/**
 * Canonical installer — opt-in copy of plugin-bundled reference skills,
 * agents, and commands into the user's ~/.claude/ directory.
 *
 * The plugin ships these as READ-ONLY reference. Nothing auto-installs.
 * The user runs "Swarmy: install canonical skills" to copy from
 * <plugin-dir>/skills/ → ~/.claude/skills/, etc.
 */
import { App, Notice, Plugin } from "obsidian";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

function vaultRoot(app: App): string {
  return (app.vault.adapter as unknown as { basePath: string }).basePath;
}

function pluginDirAbs(plugin: Plugin): string {
  const pluginDir = plugin.manifest.dir ?? `.obsidian/plugins/${plugin.manifest.id}`;
  return path.join(vaultRoot(plugin.app), pluginDir);
}

function claudeHome(): string {
  // CLAUDE_HOME env > $HOME/.claude
  return process.env.CLAUDE_HOME || path.join(os.homedir(), ".claude");
}

function copyDirRecursive(src: string, dst: string): number {
  let count = 0;
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      count += copyDirRecursive(s, d);
    } else if (entry.isFile()) {
      fs.copyFileSync(s, d);
      count++;
    }
  }
  return count;
}

export function registerCanonicalInstaller(plugin: Plugin) {
  plugin.addCommand({
    id: "swarmy-install-canonical-skills",
    name: "Swarmy: install canonical skills (copies plugin/skills → ~/.claude/skills)",
    callback: () => {
      const srcRoot = path.join(pluginDirAbs(plugin), "skills");
      const dstRoot = path.join(claudeHome(), "skills");
      if (!fs.existsSync(srcRoot)) { new Notice(`No plugin skills/ folder at ${srcRoot}`); return; }
      try {
        let total = 0;
        for (const skill of fs.readdirSync(srcRoot, { withFileTypes: true })) {
          if (!skill.isDirectory()) continue;
          total += copyDirRecursive(path.join(srcRoot, skill.name), path.join(dstRoot, skill.name));
        }
        new Notice(`Installed ${total} skill files → ${dstRoot}`, 6000);
      } catch (e) {
        new Notice(`Skill install failed: ${(e as Error).message}`, 8000);
      }
    },
  });

  plugin.addCommand({
    id: "swarmy-install-canonical-eval-command",
    name: "Swarmy: install canonical /eval command (→ ~/.claude/commands/eval.md)",
    callback: () => {
      const src = path.join(pluginDirAbs(plugin), "commands-canonical", "eval.md");
      const dst = path.join(claudeHome(), "commands", "eval.md");
      if (!fs.existsSync(src)) { new Notice(`Source missing: ${src}`); return; }
      try {
        fs.mkdirSync(path.dirname(dst), { recursive: true });
        fs.copyFileSync(src, dst);
        new Notice(`Installed /eval command → ${dst}`, 6000);
      } catch (e) {
        new Notice(`Install failed: ${(e as Error).message}`, 8000);
      }
    },
  });

  plugin.addCommand({
    id: "swarmy-install-canonical-agents",
    name: "Swarmy: install canonical agents (→ ~/.claude/agents/)",
    callback: () => {
      const srcRoot = path.join(pluginDirAbs(plugin), "agents");
      const dstRoot = path.join(claudeHome(), "agents");
      if (!fs.existsSync(srcRoot)) { new Notice(`No plugin agents/ folder`); return; }
      try {
        const n = copyDirRecursive(srcRoot, dstRoot);
        new Notice(`Installed ${n} agent file(s) → ${dstRoot}`, 6000);
      } catch (e) {
        new Notice(`Install failed: ${(e as Error).message}`, 8000);
      }
    },
  });
}
