import { App, MarkdownPostProcessorContext, Notice, Plugin } from "obsidian";
import * as fs from "fs";
import * as path from "path";

/**
 * Hand-rolled CSV reader and Markdown table renderer for the `faerie-csv`
 * codeblock + clipboard-path preview command.
 *
 * - Tolerant of quoted fields containing commas, escaped double-quotes ("")
 *   and CRLF line endings.
 * - Stops after `maxRows` data rows (header excluded) to keep previews cheap.
 */

export interface CsvPreview {
  header: string[];
  rows: string[][];
  truncated: boolean;
  totalRows: number;
}

/** Parse a single CSV line respecting quoted fields. */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = false;
      } else {
        cur += c;
      }
    } else {
      if (c === '"') inQ = true;
      else if (c === ",") { out.push(cur); cur = ""; }
      else cur += c;
    }
  }
  out.push(cur);
  return out;
}

/** Split text into lines, respecting quoted newlines. */
function splitCsvLines(raw: string): string[] {
  const lines: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c === '"') {
      if (inQ && raw[i + 1] === '"') { cur += '""'; i++; continue; }
      inQ = !inQ;
      cur += c;
    } else if (!inQ && (c === "\n" || c === "\r")) {
      if (c === "\r" && raw[i + 1] === "\n") i++;
      if (cur.length > 0) { lines.push(cur); cur = ""; }
    } else {
      cur += c;
    }
  }
  if (cur.length > 0) lines.push(cur);
  return lines;
}

export function readCsvPreview(filePath: string, maxRows = 50): CsvPreview {
  const raw = fs.readFileSync(filePath, "utf8");
  const lines = splitCsvLines(raw);
  if (!lines.length) return { header: [], rows: [], truncated: false, totalRows: 0 };
  const header = parseCsvLine(lines[0]);
  const rows: string[][] = [];
  const dataLines = lines.slice(1);
  const limit = Math.min(maxRows, dataLines.length);
  for (let i = 0; i < limit; i++) rows.push(parseCsvLine(dataLines[i]));
  return {
    header,
    rows,
    truncated: dataLines.length > limit,
    totalRows: dataLines.length,
  };
}

function escMd(s: string): string {
  return (s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
}

export function renderMarkdownTable(preview: CsvPreview): string {
  if (!preview.header.length) return "_(empty CSV)_";
  const head = "| " + preview.header.map(escMd).join(" | ") + " |";
  const sep = "| " + preview.header.map(() => "---").join(" | ") + " |";
  const body = preview.rows.map((r) => "| " + r.map(escMd).join(" | ") + " |").join("\n");
  let out = [head, sep, body].filter(Boolean).join("\n");
  if (preview.truncated) {
    out += `\n\n_…showing ${preview.rows.length} of ${preview.totalRows} rows._`;
  }
  return out;
}

function vaultRoot(app: App): string {
  return (app.vault.adapter as unknown as { basePath: string }).basePath;
}

function resolveCsvPath(app: App, p: string): string {
  if (path.isAbsolute(p)) return p;
  return path.join(vaultRoot(app), p);
}

export function registerCsvPreview(plugin: Plugin) {
  plugin.registerMarkdownCodeBlockProcessor(
    "faerie-csv",
    async (source: string, el: HTMLElement, _ctx: MarkdownPostProcessorContext) => {
      try {
        const lines = source.split(/\r?\n/);
        let pathLine = "";
        let maxRows = 50;
        for (const ln of lines) {
          const m = ln.match(/^\s*(path|file)\s*:\s*(.+?)\s*$/i);
          if (m) pathLine = m[2].replace(/^["']|["']$/g, "");
          const mr = ln.match(/^\s*(maxRows|limit)\s*:\s*(\d+)\s*$/i);
          if (mr) maxRows = parseInt(mr[2], 10);
        }
        if (!pathLine) {
          el.createEl("pre", { text: "faerie-csv: missing `path:` directive" });
          return;
        }
        const abs = resolveCsvPath(plugin.app, pathLine);
        if (!fs.existsSync(abs)) {
          el.createEl("pre", { text: `faerie-csv: file not found: ${abs}` });
          return;
        }
        const preview = readCsvPreview(abs, maxRows);
        const tbl = el.createEl("table", { cls: "faerie-csv-preview" });
        const thead = tbl.createEl("thead").createEl("tr");
        for (const h of preview.header) thead.createEl("th", { text: h });
        const tbody = tbl.createEl("tbody");
        for (const r of preview.rows) {
          const tr = tbody.createEl("tr");
          for (const c of r) tr.createEl("td", { text: c });
        }
        if (preview.truncated) {
          el.createEl("div", {
            text: `…showing ${preview.rows.length} of ${preview.totalRows} rows.`,
            cls: "faerie-csv-truncated",
          });
        }
      } catch (e) {
        el.createEl("pre", { text: "faerie-csv error: " + (e as Error).message });
      }
    },
  );

  plugin.addCommand({
    id: "faerie-csv-preview-clipboard",
    name: "Faerie: preview CSV from clipboard path",
    callback: async () => {
      const cb = await navigator.clipboard.readText().catch(() => "");
      const p = cb.trim();
      if (!p) { new Notice("Clipboard is empty."); return; }
      const abs = resolveCsvPath(plugin.app, p);
      if (!fs.existsSync(abs)) { new Notice(`File not found: ${abs}`, 8000); return; }
      try {
        const preview = readCsvPreview(abs, 50);
        const md = renderMarkdownTable(preview);
        const file = plugin.app.workspace.getActiveFile();
        if (file) {
          const cur = await plugin.app.vault.read(file);
          await plugin.app.vault.modify(file, cur + "\n\n" + md + "\n");
          new Notice(`CSV preview appended (${preview.rows.length} rows).`);
        } else {
          await navigator.clipboard.writeText(md);
          new Notice("CSV preview copied to clipboard (no active file).");
        }
      } catch (e) {
        new Notice("CSV preview failed: " + (e as Error).message, 8000);
      }
    },
  });
}
