/**
 * linter — vendored markdown / frontmatter linter for reckon vaults.
 *
 * Why vendor a linter: configuring obsidian-linter is the most annoying
 * part of standing up an Obsidian vault. We ship a curated rule set that
 * matches the reckon frontmatter conventions out of the box — no third
 * party plugin install, no rule-by-rule toggling.
 *
 * Rules (all default-on, individually toggleable in settings):
 *   - frontmatter-required-fields: ensure `type`, `created`, `tags`
 *     keys exist (configurable list). Missing keys are added with stub
 *     values.
 *   - frontmatter-canonical-order: re-order frontmatter keys to a
 *     canonical order (type → created → updated → tags → up/down/same/prev
 *     → everything else alphabetised).
 *   - trim-trailing-whitespace: strip whitespace at end of each line.
 *   - collapse-multiple-blank-lines: max 1 blank line between blocks.
 *   - newline-at-eof: ensure file ends with exactly one newline.
 *   - heading-blank-line-before: ensure a blank line before every `#`,
 *     `##`, `###` heading (except first one in document).
 *   - bullet-dash-style: convert `*` and `+` bullets to `-` for consistency.
 *
 * Commands:
 *   - `reckon-lint-current-file` — applies enabled rules to active note.
 *   - `reckon-lint-vault`        — applies enabled rules to every md file
 *     (confirmation modal first).
 *
 * Settings tab section is contributed via getLinterSettingsRenderer().
 *
 * No external deps. All transforms are pure-string regex / line ops.
 */

import { App, MarkdownView, Modal, Notice, Plugin, Setting, TFile } from "obsidian";

export interface LinterSettings {
  lintEnabled: boolean;
  lintOnSave: boolean;
  lintRules: {
    requireFields: boolean;
    canonicalOrder: boolean;
    trimTrailingWs: boolean;
    collapseBlankLines: boolean;
    newlineAtEof: boolean;
    headingBlankLineBefore: boolean;
    bulletDashStyle: boolean;
  };
  requiredFields: string[];
}

export const DEFAULT_LINTER_SETTINGS: LinterSettings = {
  lintEnabled: true,
  lintOnSave: false,
  lintRules: {
    requireFields: true,
    canonicalOrder: true,
    trimTrailingWs: true,
    collapseBlankLines: true,
    newlineAtEof: true,
    headingBlankLineBefore: true,
    bulletDashStyle: true,
  },
  requiredFields: ["type", "created"],
};

const CANONICAL_KEY_ORDER = [
  "type", "charter_id", "manifest_id", "task_id",
  "created", "updated", "ts",
  "status", "phase",
  "tags",
  "up", "down", "same", "prev",
  "north", "south", "east", "west",
  "mission", "investigation_label",
  "authors", "author",
];

interface ParsedFrontmatter {
  pre: string;
  body: string;
  fm: Record<string, string>;     // raw line-keyed map (value = raw YAML line content after "key:")
  keyOrder: string[];
  exists: boolean;
}

function parseFrontmatter(text: string): ParsedFrontmatter {
  const m = text.match(/^(---\n([\s\S]*?)\n---\n?)([\s\S]*)$/);
  if (!m) return { pre: "", body: text, fm: {}, keyOrder: [], exists: false };
  const block = m[2];
  const body = m[3];
  const fm: Record<string, string> = {};
  const keyOrder: string[] = [];
  let curKey: string | null = null;
  for (const line of block.split("\n")) {
    const kvMatch = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (kvMatch) {
      curKey = kvMatch[1];
      fm[curKey] = kvMatch[2];
      keyOrder.push(curKey);
    } else if (curKey && (line.startsWith("  ") || line.startsWith("-"))) {
      // Continuation (list item, multi-line value).
      fm[curKey] = (fm[curKey] || "") + "\n" + line;
    }
  }
  return { pre: m[1], body, fm, keyOrder, exists: true };
}

function serializeFrontmatter(fm: Record<string, string>, keyOrder: string[]): string {
  const lines: string[] = ["---"];
  for (const k of keyOrder) {
    const v = fm[k] ?? "";
    if (v.includes("\n")) {
      lines.push(`${k}:` + v);
    } else {
      lines.push(`${k}: ${v}`.replace(/\s+$/, ""));
    }
  }
  lines.push("---", "");
  return lines.join("\n");
}

// ─── Rules ─────────────────────────────────────────────────────────────────

function ruleRequireFields(parsed: ParsedFrontmatter, required: string[]): ParsedFrontmatter {
  if (!parsed.exists) {
    parsed = { ...parsed, exists: true };
  }
  for (const k of required) {
    if (!(k in parsed.fm)) {
      if (k === "created") parsed.fm[k] = new Date().toISOString();
      else if (k === "tags") parsed.fm[k] = "[]";
      else if (k === "type") parsed.fm[k] = "note";
      else parsed.fm[k] = "";
      parsed.keyOrder.push(k);
    }
  }
  return parsed;
}

function ruleCanonicalOrder(parsed: ParsedFrontmatter): ParsedFrontmatter {
  if (!parsed.exists) return parsed;
  const remaining = new Set(parsed.keyOrder);
  const newOrder: string[] = [];
  for (const k of CANONICAL_KEY_ORDER) {
    if (remaining.has(k)) {
      newOrder.push(k);
      remaining.delete(k);
    }
  }
  const rest = Array.from(remaining).sort();
  return { ...parsed, keyOrder: [...newOrder, ...rest] };
}

function ruleTrimTrailingWs(text: string): string {
  return text.replace(/[ \t]+$/gm, "");
}

function ruleCollapseBlankLines(text: string): string {
  return text.replace(/\n{3,}/g, "\n\n");
}

function ruleNewlineAtEof(text: string): string {
  return text.replace(/\n*$/, "\n");
}

function ruleHeadingBlankLineBefore(text: string): string {
  // Insert a blank line before any heading line that doesn't already have one.
  // Skip the first line of the file.
  const lines = text.split("\n");
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (i > 0 && /^#{1,6}\s/.test(line) && lines[i - 1].trim() !== "") {
      out.push("");
    }
    out.push(line);
  }
  return out.join("\n");
}

function ruleBulletDashStyle(text: string): string {
  // Only convert lines that start with whitespace+* or whitespace+ + bullet.
  // Avoid touching emphasis markers inside text.
  return text.replace(/^(\s*)[*+](\s)/gm, "$1-$2");
}

// ─── Driver ────────────────────────────────────────────────────────────────

export function lintMarkdown(raw: string, s: LinterSettings): { out: string; changed: boolean } {
  let parsed = parseFrontmatter(raw);
  if (s.lintRules.requireFields) parsed = ruleRequireFields(parsed, s.requiredFields);
  if (s.lintRules.canonicalOrder) parsed = ruleCanonicalOrder(parsed);

  let body = parsed.body;
  if (s.lintRules.trimTrailingWs)         body = ruleTrimTrailingWs(body);
  if (s.lintRules.collapseBlankLines)     body = ruleCollapseBlankLines(body);
  if (s.lintRules.headingBlankLineBefore) body = ruleHeadingBlankLineBefore(body);
  if (s.lintRules.bulletDashStyle)        body = ruleBulletDashStyle(body);
  if (s.lintRules.newlineAtEof)           body = ruleNewlineAtEof(body);

  const fmText = parsed.exists ? serializeFrontmatter(parsed.fm, parsed.keyOrder) : "";
  const out = fmText + body;
  return { out, changed: out !== raw };
}

// ─── Registration ──────────────────────────────────────────────────────────

class LintVaultConfirmModal extends Modal {
  constructor(app: App, private fileCount: number, private onAccept: () => void) { super(app); }
  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h2", { text: "Lint entire vault?" });
    contentEl.createEl("p", { text: `This will modify up to ${this.fileCount} markdown files using your enabled lint rules. Run a backup or commit your vault first.` });
    const row = contentEl.createEl("div");
    row.style.cssText = "display:flex;gap:8px;margin-top:12px;";
    const go = row.createEl("button", { text: "Lint vault" });
    go.onclick = () => { this.onAccept(); this.close(); };
    const cancel = row.createEl("button", { text: "Cancel" });
    cancel.onclick = () => this.close();
  }
  onClose() { this.contentEl.empty(); }
}

export function registerLinter(
  plugin: Plugin,
  getSettings: () => LinterSettings,
  _save: () => Promise<void>,
) {
  plugin.addCommand({
    id: "reckon-lint-current-file",
    name: "Reckon: lint current note (frontmatter + markdown style)",
    checkCallback: (checking: boolean) => {
      const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
      if (!view || !view.file) return false;
      if (checking) return true;
      void (async () => {
        const file = view.file!;
        const raw = await plugin.app.vault.read(file);
        const s = getSettings();
        if (!s.lintEnabled) { new Notice("Reckon linter disabled in settings."); return; }
        const { out, changed } = lintMarkdown(raw, s);
        if (changed) {
          await plugin.app.vault.modify(file, out);
          new Notice(`Linted ${file.basename}.`, 3000);
        } else {
          new Notice(`No changes — ${file.basename} already conforms.`, 3000);
        }
      })();
      return true;
    },
  });

  plugin.addCommand({
    id: "reckon-lint-vault",
    name: "Reckon: lint entire vault (frontmatter + markdown style)",
    callback: () => {
      const s = getSettings();
      if (!s.lintEnabled) { new Notice("Reckon linter disabled in settings."); return; }
      const files = plugin.app.vault.getMarkdownFiles();
      new LintVaultConfirmModal(plugin.app, files.length, async () => {
        let changed = 0;
        for (const f of files) {
          const raw = await plugin.app.vault.read(f);
          const { out, changed: c } = lintMarkdown(raw, s);
          if (c) {
            await plugin.app.vault.modify(f, out);
            changed++;
          }
        }
        new Notice(`Linter pass complete — ${changed}/${files.length} files modified.`, 6000);
      }).open();
    },
  });
}

/**
 * Settings UI fragment — call from the plugin's main settings tab to
 * render the linter section. Keeps all settings in one place for the
 * user.
 */
export function renderLinterSettings(
  containerEl: HTMLElement,
  getSettings: () => LinterSettings,
  save: () => Promise<void>,
) {
  containerEl.createEl("h3", { text: "Linter (vendored — no external plugin needed)" });

  new Setting(containerEl)
    .setName("Enable linter")
    .setDesc("Master toggle. Disables both the manual lint commands and any future lint-on-save behaviour.")
    .addToggle((t) => t.setValue(getSettings().lintEnabled).onChange(async (v) => {
      getSettings().lintEnabled = v; await save();
    }));

  const rules: Array<[keyof LinterSettings["lintRules"], string, string]> = [
    ["requireFields",          "Require frontmatter fields", "Add missing `type` and `created` keys with safe defaults."],
    ["canonicalOrder",         "Canonical frontmatter key order", "Re-order keys: type → created → tags → bearings → rest alphabetical."],
    ["trimTrailingWs",         "Trim trailing whitespace", "Strip spaces/tabs at end of every line."],
    ["collapseBlankLines",     "Collapse multiple blank lines", "Max one blank line between blocks."],
    ["newlineAtEof",           "Newline at end of file", "Ensure file ends with exactly one newline."],
    ["headingBlankLineBefore", "Blank line before headings", "Insert a blank line before any `#` heading missing one."],
    ["bulletDashStyle",        "Bullet style: dashes only", "Convert `*` and `+` list bullets to `-`."],
  ];
  for (const [key, name, desc] of rules) {
    new Setting(containerEl)
      .setName(name)
      .setDesc(desc)
      .addToggle((t) => t.setValue(getSettings().lintRules[key]).onChange(async (v) => {
        getSettings().lintRules[key] = v; await save();
      }));
  }

  new Setting(containerEl)
    .setName("Required frontmatter fields")
    .setDesc("Comma-separated list of frontmatter keys to auto-add when missing. Defaults: type, created.")
    .addText((t) => t
      .setValue(getSettings().requiredFields.join(", "))
      .onChange(async (v) => {
        getSettings().requiredFields = v.split(",").map((s) => s.trim()).filter(Boolean);
        await save();
      }));
}
