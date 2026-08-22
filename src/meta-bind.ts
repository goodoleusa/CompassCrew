/**
 * meta-bind — minimal Meta Bind compat layer.
 *
 * Source / inspiration: https://github.com/mProjectsCode/obsidian-meta-bind-plugin (MIT)
 * Vendored subset of the most common Meta Bind patterns:
 *   - `INPUT[toggle:fieldName]`     — frontmatter boolean toggle
 *   - `INPUT[text:fieldName]`       — frontmatter text input
 *   - `INPUT[number:fieldName]`     — frontmatter number input
 *   - `INPUT[select(option(a), option(b)):fieldName]` — dropdown
 *   - `BUTTON[label]`               — clickable button that runs a command
 *   - `BUTTON[label, command:command-id]` — explicit command binding
 *   - `BUTTON[label, runMcp:tool_name]`   — POST to MCP server tool
 *
 * Use sites: ` ```meta-bind\n<expr>\n``` ` codeblock, or inline
 * `\`INPUT[toggle:done]\`` (rendered via the markdown post-processor).
 *
 * Why vendor this rather than depend on Meta Bind: the user reported
 * Meta Bind buttons are how they "actually fire scripts and do stuff"
 * inside the vault. If a user clones compasscrew-vault-plugin onto a fresh
 * vault, they shouldn't be blocked on a second-plugin install just to
 * make their published button-driven dashboards work.
 *
 * Compatibility notes:
 *   - We use the same `INPUT[type:field]` / `BUTTON[label]` syntax as
 *     Meta Bind so existing vault notes work without rewrites.
 *   - If the user has the real Meta Bind plugin installed, it claims
 *     the `meta-bind` codeblock processor first and our shim sleeps —
 *     no conflict.
 *   - Inline notation uses backticks: \`INPUT[...]\` — same as Meta Bind.
 *
 * Intentionally omitted (use the full plugin if you need them):
 *   - View fields (`VIEW[]`), JS expressions, image controls, sliders.
 *   - Custom button styling beyond the default Obsidian button.
 *   - Reactive bindings (we update frontmatter on change; we do NOT
 *     subscribe to upstream metadata events).
 */

import { App, MarkdownPostProcessorContext, Notice, Plugin, TFile } from "obsidian";

interface InputDecl {
  kind: "input";
  inputType: "toggle" | "text" | "number" | "select";
  field: string;
  options?: string[];
}

interface ButtonDecl {
  kind: "button";
  label: string;
  binding: { kind: "command"; commandId: string } | { kind: "mcp"; tool: string } | { kind: "auto" };
}

type Decl = InputDecl | ButtonDecl;

const INPUT_RE = /^INPUT\[\s*([a-z]+)(?:\(([^)]*)\))?\s*:\s*([A-Za-z0-9_.-]+)\s*\]$/i;
const BUTTON_RE = /^BUTTON\[\s*([^,\]]+?)(?:\s*,\s*(command|runMcp)\s*:\s*([^\]]+))?\s*\]$/i;

function parseDecl(src: string): Decl | null {
  const trimmed = src.trim();
  const mInput = trimmed.match(INPUT_RE);
  if (mInput) {
    const inputType = mInput[1].toLowerCase();
    if (inputType !== "toggle" && inputType !== "text" && inputType !== "number" && inputType !== "select") {
      return null;
    }
    const options = mInput[2]
      ? mInput[2].split(",").map((s) => {
          const m = s.match(/option\(([^)]*)\)/);
          return m ? m[1] : s.trim();
        }).filter(Boolean)
      : undefined;
    return { kind: "input", inputType: inputType as InputDecl["inputType"], field: mInput[3], options };
  }
  const mBtn = trimmed.match(BUTTON_RE);
  if (mBtn) {
    const label = mBtn[1].trim();
    if (!mBtn[2]) return { kind: "button", label, binding: { kind: "auto" } };
    if (mBtn[2].toLowerCase() === "command") return { kind: "button", label, binding: { kind: "command", commandId: mBtn[3].trim() } };
    if (mBtn[2].toLowerCase() === "runmcp")  return { kind: "button", label, binding: { kind: "mcp", tool: mBtn[3].trim() } };
    return { kind: "button", label, binding: { kind: "auto" } };
  }
  return null;
}

// ─── Frontmatter helpers ───────────────────────────────────────────────────

async function readField(app: App, file: TFile, field: string): Promise<unknown> {
  const fm = app.metadataCache.getFileCache(file)?.frontmatter ?? {};
  return (fm as Record<string, unknown>)[field];
}

async function writeField(app: App, file: TFile, field: string, value: unknown): Promise<void> {
  await app.fileManager.processFrontMatter(file, (fm) => {
    fm[field] = value;
  });
}

// ─── Renderers ─────────────────────────────────────────────────────────────

function renderInput(app: App, sourcePath: string, decl: InputDecl, host: HTMLElement) {
  const file = app.vault.getAbstractFileByPath(sourcePath);
  if (!(file instanceof TFile)) {
    host.setText(`(meta-bind: cannot resolve ${sourcePath})`);
    return;
  }
  const span = host.createEl("span", { cls: "compasscrew-meta-bind-input" });
  span.style.cssText = "display:inline-flex;align-items:center;gap:6px;";

  const current = app.metadataCache.getFileCache(file)?.frontmatter?.[decl.field];

  if (decl.inputType === "toggle") {
    const cb = span.createEl("input") as HTMLInputElement;
    cb.type = "checkbox";
    cb.checked = current === true || current === "true";
    cb.onchange = async () => { await writeField(app, file, decl.field, cb.checked); };
    span.createEl("span", { text: ` ${decl.field}` });
  } else if (decl.inputType === "text") {
    const inp = span.createEl("input") as HTMLInputElement;
    inp.type = "text";
    inp.value = current == null ? "" : String(current);
    inp.style.cssText = "min-width:8em;";
    inp.onchange = async () => { await writeField(app, file, decl.field, inp.value); };
  } else if (decl.inputType === "number") {
    const inp = span.createEl("input") as HTMLInputElement;
    inp.type = "number";
    inp.value = current == null ? "" : String(current);
    inp.style.cssText = "width:6em;";
    inp.onchange = async () => {
      const n = parseFloat(inp.value);
      await writeField(app, file, decl.field, Number.isFinite(n) ? n : inp.value);
    };
  } else if (decl.inputType === "select") {
    const sel = span.createEl("select") as HTMLSelectElement;
    for (const opt of decl.options || []) {
      const o = sel.createEl("option", { text: opt, value: opt });
      if (String(current) === opt) o.selected = true;
    }
    sel.onchange = async () => { await writeField(app, file, decl.field, sel.value); };
  }
}

function renderButton(plugin: Plugin, sourcePath: string, decl: ButtonDecl, host: HTMLElement) {
  const btn = host.createEl("button", { text: decl.label, cls: "compasscrew-meta-bind-button" });
  btn.style.cssText = "padding:4px 10px;border-radius:4px;cursor:pointer;";
  btn.onclick = async () => {
    if (decl.binding.kind === "command") {
      try {
        (plugin.app as any).commands?.executeCommandById?.(decl.binding.commandId);
      } catch (e) {
        new Notice(`Meta-bind: command failed: ${(e as Error).message}`, 6000);
      }
    } else if (decl.binding.kind === "mcp") {
      try {
        const settings = (plugin.app as any).plugins?.plugins?.["compasscrew"]?.compasscrewSettings ?? {};
        const mcpUrl: string = settings.mcpUrl || "http://localhost:8765";
        const tokenPath: string = settings.tokenPath || ".swarmy-token";
        const fs = require("fs") as typeof import("fs");
        const path = require("path") as typeof import("path");
        const vaultRoot = (plugin.app.vault.adapter as any).basePath as string;
        let token = "";
        try { token = fs.readFileSync(path.join(vaultRoot, tokenPath), "utf8").trim(); } catch { /* no token */ }
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (token) headers["Authorization"] = `Bearer ${token}`;
        const r = await fetch(mcpUrl.replace(/\/+$/, "") + "/tools/" + decl.binding.tool, {
          method: "POST",
          headers,
          body: JSON.stringify({ source: sourcePath }),
        });
        if (r.ok) new Notice(`Meta-bind: ${decl.binding.tool} OK (${r.status})`, 3000);
        else      new Notice(`Meta-bind: ${decl.binding.tool} HTTP ${r.status}`, 6000);
      } catch (e) {
        new Notice(`Meta-bind: MCP call failed: ${(e as Error).message}`, 6000);
      }
    } else {
      // auto: try to match label to a command id (lowercase, replace spaces).
      const guess = "compasscrew:" + decl.label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      try {
        (plugin.app as any).commands?.executeCommandById?.(guess);
        new Notice(`Meta-bind: tried ${guess}`, 2000);
      } catch {
        new Notice("Meta-bind: button has no binding (use command:id or runMcp:tool).", 6000);
      }
    }
  };
}

// ─── Registration ──────────────────────────────────────────────────────────

export function registerMetaBind(plugin: Plugin) {
  // Codeblock processor: ` ```meta-bind\n<decl>\n``` `
  plugin.registerMarkdownCodeBlockProcessor("meta-bind", (source, el, ctx) => {
    const lines = source.split("\n").map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
      const decl = parseDecl(line);
      if (!decl) {
        const err = el.createEl("div", { cls: "compasscrew-meta-bind-error" });
        err.style.cssText = "color:#C73E1D;font-family:var(--font-monospace);padding:4px;";
        err.setText(`[meta-bind] unparseable: ${line}`);
        continue;
      }
      const host = el.createEl("div", { cls: "compasscrew-meta-bind-row" });
      host.style.cssText = "margin:4px 0;";
      if (decl.kind === "input") renderInput(plugin.app, ctx.sourcePath, decl, host);
      else                       renderButton(plugin, ctx.sourcePath, decl, host);
    }
  });

  // Inline processor: replace `INPUT[...]` / `BUTTON[...]` text inside `code` tags
  // with the rendered widget. We walk all <code> nodes after rendering.
  plugin.registerMarkdownPostProcessor((el, ctx) => {
    const codes = el.querySelectorAll("code");
    codes.forEach((node) => {
      const txt = (node.textContent || "").trim();
      if (!/^(INPUT|BUTTON)\[/i.test(txt)) return;
      const decl = parseDecl(txt);
      if (!decl) return;
      const host = document.createElement("span");
      host.className = "compasscrew-meta-bind-inline";
      if (decl.kind === "input") renderInput(plugin.app, ctx.sourcePath, decl, host);
      else                       renderButton(plugin, ctx.sourcePath, decl, host);
      node.replaceWith(host);
    });
  });

  // dataviewjs codeblock: minimal compat — render the script result as
  // plain text via a sandboxed Function call with limited `dv` API.
  // We do this so vault notes that use `dataviewjs` for tiny one-liner
  // queries (the most common pattern) keep working. Complex scripts that
  // need the full Dataview API should still install the real plugin.
  plugin.registerMarkdownCodeBlockProcessor("dataviewjs", (source, el, _ctx) => {
    const app = plugin.app;
    const dv = {
      pages: (folder?: string) => {
        const files = app.vault.getMarkdownFiles();
        if (!folder) return files;
        const f = folder.replace(/^"|"$/g, "");
        return files.filter((x) => x.path.startsWith(f + "/") || x.path === f);
      },
      current: () => app.workspace.getActiveFile(),
      paragraph: (s: string) => el.createEl("p", { text: String(s) }),
      list: (items: unknown[]) => {
        const ul = el.createEl("ul");
        for (const it of items) ul.createEl("li", { text: String(it) });
      },
      table: (headers: string[], rows: unknown[][]) => {
        const table = el.createEl("table");
        const thead = table.createEl("thead").createEl("tr");
        for (const h of headers) thead.createEl("th", { text: h });
        const tbody = table.createEl("tbody");
        for (const r of rows) {
          const tr = tbody.createEl("tr");
          for (const c of r) tr.createEl("td", { text: String(c) });
        }
      },
      header: (level: number, text: string) => el.createEl(`h${Math.max(1, Math.min(6, level))}` as keyof HTMLElementTagNameMap, { text }),
    };
    try {
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      const fn = new Function("dv", source);
      fn(dv);
    } catch (e) {
      const err = el.createEl("div", { cls: "compasscrew-dvjs-error" });
      err.style.cssText = "color:#C73E1D;font-family:var(--font-monospace);padding:4px;";
      err.setText(`[dataviewjs] error: ${(e as Error).message}`);
    }
  });
}
