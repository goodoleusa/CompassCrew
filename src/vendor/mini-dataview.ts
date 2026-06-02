/**
 * mini-dataview — vendored subset of obsidian-dataview.
 *
 * Source: https://github.com/blacksmithgu/obsidian-dataview (MIT)
 * License: MIT (see THIRD_PARTY_NOTICES.md)
 *
 * Why vendor a subset: today's swarmy vault uses dataview blocks for
 * publication indexes, charter rollups, and manifest lists. The full
 * dataview plugin is a substantial dependency tree. We re-implement only
 * the query shapes actually present in vault templates, so a user can
 * "just install swarmy-hive-plugin" and see correct results.
 *
 * Supported query forms:
 *   ```dataview
 *   TABLE field1, field2 FROM "folder"
 *   WHERE startswith(file.name, "X")
 *   SORT field DESC
 *   ```
 *
 *   ```dataview
 *   LIST FROM "folder"
 *   WHERE field = "value"
 *   SORT file.mtime DESC
 *   ```
 *
 * Supported pieces:
 *   - SELECT: TABLE <fields...> | LIST
 *   - FROM:   "folder"  (single folder, recursive)
 *   - WHERE:  field <op> literal     where <op> is: = != < <= > >=
 *             startswith(field, "X") | endswith(field, "X") | contains(field, "X")
 *             AND-combined (no OR, no NOT, intentionally)
 *   - SORT:   field [ASC|DESC]   (single key only)
 *
 * Intentionally OMITTED (use full dataview if you need them):
 *   - FROM #tag, FROM [[link]], FROM combinations
 *   - GROUP BY, FLATTEN, JOIN, FROM exclusion
 *   - Inline DQL queries, JS queries (`dataviewjs`)
 *   - Calendar / time-series renderers
 *   - Implicit fields beyond file.name, file.path, file.mtime, file.ctime
 *
 * Register via:
 *   plugin.registerMarkdownCodeBlockProcessor("dataview", miniDataviewProcessor(app));
 */

import { App, MarkdownPostProcessorContext, TFile } from "obsidian";

interface ParsedQuery {
  kind: "TABLE" | "LIST";
  fields: string[];               // empty for LIST (just file.name)
  folder: string;                 // "" = whole vault
  where: WhereClause[];
  sortField: string | null;
  sortDir: "ASC" | "DESC";
}

type WhereOp = "=" | "!=" | "<" | "<=" | ">" | ">=";

type WhereClause =
  | { kind: "compare"; field: string; op: WhereOp; value: string | number }
  | { kind: "func"; func: "startswith" | "endswith" | "contains"; field: string; arg: string };

const PARSE_ERR_PREFIX = "[mini-dataview] parse error: ";

/** Tokenise a sort/where line — preserves quoted strings as single tokens. */
function tokenize(src: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === " " || c === "\t") { i++; continue; }
    if (c === '"') {
      let j = i + 1;
      while (j < src.length && src[j] !== '"') j++;
      out.push(src.slice(i + 1, j));
      i = j + 1;
      continue;
    }
    if (c === "," || c === "(" || c === ")") {
      out.push(c);
      i++;
      continue;
    }
    let j = i;
    while (j < src.length && !/[\s,()"]/.test(src[j])) j++;
    out.push(src.slice(i, j));
    i = j;
  }
  return out;
}

export function parseQuery(src: string): ParsedQuery | string {
  // Normalise: collapse whitespace, but keep line breaks as keyword separators.
  const text = src.trim();
  if (!text) return PARSE_ERR_PREFIX + "empty query";

  // Split into lines but allow inline keywords too (FROM/WHERE/SORT often on same line).
  // Strategy: split on the four major keywords and re-assemble.
  const lower = text.toLowerCase();
  const keywords = ["table", "list", "from", "where", "sort"] as const;
  type KW = (typeof keywords)[number];
  const positions: Array<{ kw: KW; idx: number }> = [];
  for (const kw of keywords) {
    const re = new RegExp(`(^|[\\s\\n])${kw}(\\s|$)`, "gi");
    let m: RegExpExecArray | null;
    while ((m = re.exec(lower)) !== null) {
      positions.push({ kw, idx: m.index + (m[1] === "" ? 0 : 1) });
    }
  }
  positions.sort((a, b) => a.idx - b.idx);
  if (positions.length === 0 || (positions[0].kw !== "table" && positions[0].kw !== "list")) {
    return PARSE_ERR_PREFIX + "query must begin with TABLE or LIST";
  }

  // Slice into sections by keyword position.
  const sections: Partial<Record<KW, string>> = {};
  for (let i = 0; i < positions.length; i++) {
    const p = positions[i];
    const end = i + 1 < positions.length ? positions[i + 1].idx : text.length;
    sections[p.kw] = text.slice(p.idx + p.kw.length, end).trim();
  }

  const kind: ParsedQuery["kind"] = sections.table !== undefined ? "TABLE" : "LIST";
  const fieldsRaw = sections.table ?? "";
  const fields = kind === "TABLE"
    ? fieldsRaw.split(",").map((f) => f.trim()).filter(Boolean)
    : [];

  // FROM "folder" — single quoted folder only.
  let folder = "";
  if (sections.from !== undefined) {
    const m = sections.from.match(/^\s*"([^"]+)"\s*$/);
    if (!m) {
      return PARSE_ERR_PREFIX + 'FROM only supports a single quoted folder like FROM "folder/sub"';
    }
    folder = m[1].replace(/^\/+|\/+$/g, "");
  }

  // WHERE — AND-chained comparisons / functions.
  const where: WhereClause[] = [];
  if (sections.where !== undefined) {
    const clauses = sections.where.split(/\s+and\s+/i);
    for (const raw of clauses) {
      const c = parseWhereClause(raw.trim());
      if (typeof c === "string") return c;
      where.push(c);
    }
  }

  // SORT field [ASC|DESC]
  let sortField: string | null = null;
  let sortDir: "ASC" | "DESC" = "ASC";
  if (sections.sort !== undefined) {
    const tokens = tokenize(sections.sort);
    if (tokens.length >= 1) {
      sortField = tokens[0];
      if (tokens.length >= 2) {
        const dir = tokens[1].toUpperCase();
        if (dir === "ASC" || dir === "DESC") sortDir = dir;
      }
    }
  }

  return { kind, fields, folder, where, sortField, sortDir };
}

function parseWhereClause(src: string): WhereClause | string {
  // Function-style: startswith(field, "X") / endswith(...) / contains(...)
  const fnMatch = src.match(/^(startswith|endswith|contains)\s*\(\s*([A-Za-z0-9_.]+)\s*,\s*"([^"]*)"\s*\)$/i);
  if (fnMatch) {
    return {
      kind: "func",
      func: fnMatch[1].toLowerCase() as "startswith" | "endswith" | "contains",
      field: fnMatch[2],
      arg: fnMatch[3],
    };
  }
  // Comparison: field <op> value
  const cmpMatch = src.match(/^([A-Za-z0-9_.]+)\s*(=|!=|<=|>=|<|>)\s*(.+)$/);
  if (cmpMatch) {
    const field = cmpMatch[1];
    const op = cmpMatch[2] as WhereOp;
    let rawVal = cmpMatch[3].trim();
    let value: string | number;
    if (rawVal.startsWith('"') && rawVal.endsWith('"')) {
      value = rawVal.slice(1, -1);
    } else if (/^-?\d+(\.\d+)?$/.test(rawVal)) {
      value = parseFloat(rawVal);
    } else {
      value = rawVal;
    }
    return { kind: "compare", field, op, value };
  }
  return PARSE_ERR_PREFIX + `unsupported WHERE clause: ${src}`;
}

// ─── Field resolution ──────────────────────────────────────────────────────

function resolveField(file: TFile, fm: Record<string, unknown> | null, fieldPath: string): unknown {
  if (fieldPath.startsWith("file.")) {
    const sub = fieldPath.slice(5);
    switch (sub) {
      case "name":  return file.basename;
      case "path":  return file.path;
      case "mtime": return file.stat.mtime;
      case "ctime": return file.stat.ctime;
      case "size":  return file.stat.size;
      case "ext":   return file.extension;
      default:      return undefined;
    }
  }
  if (!fm) return undefined;
  // Dotted path into frontmatter.
  const parts = fieldPath.split(".");
  let cur: unknown = fm;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

function compare(a: unknown, op: WhereOp, b: unknown): boolean {
  if (op === "=") return String(a) === String(b);
  if (op === "!=") return String(a) !== String(b);
  const an = typeof a === "number" ? a : parseFloat(String(a));
  const bn = typeof b === "number" ? b : parseFloat(String(b));
  if (!Number.isFinite(an) || !Number.isFinite(bn)) {
    // Lexicographic fallback
    const as = String(a), bs = String(b);
    if (op === "<")  return as < bs;
    if (op === "<=") return as <= bs;
    if (op === ">")  return as > bs;
    if (op === ">=") return as >= bs;
    return false;
  }
  if (op === "<")  return an < bn;
  if (op === "<=") return an <= bn;
  if (op === ">")  return an > bn;
  if (op === ">=") return an >= bn;
  return false;
}

function evalWhere(file: TFile, fm: Record<string, unknown> | null, where: WhereClause[]): boolean {
  for (const w of where) {
    if (w.kind === "compare") {
      const v = resolveField(file, fm, w.field);
      if (!compare(v, w.op, w.value)) return false;
    } else {
      const v = resolveField(file, fm, w.field);
      const s = v == null ? "" : String(v);
      if (w.func === "startswith" && !s.startsWith(w.arg)) return false;
      if (w.func === "endswith"   && !s.endsWith(w.arg))   return false;
      if (w.func === "contains"   && !s.includes(w.arg))   return false;
    }
  }
  return true;
}

// ─── Execution ─────────────────────────────────────────────────────────────

interface QueryRow {
  file: TFile;
  values: unknown[];
}

function collectFiles(app: App, folder: string): TFile[] {
  const all = app.vault.getMarkdownFiles();
  if (!folder) return all;
  const prefix = folder + "/";
  return all.filter((f) => f.path === folder || f.path.startsWith(prefix));
}

export function runQuery(app: App, q: ParsedQuery): QueryRow[] {
  const files = collectFiles(app, q.folder);
  const rows: QueryRow[] = [];
  for (const file of files) {
    const fm = app.metadataCache.getFileCache(file)?.frontmatter ?? null;
    if (!evalWhere(file, fm as Record<string, unknown> | null, q.where)) continue;
    const values = q.kind === "TABLE"
      ? q.fields.map((f) => resolveField(file, fm as Record<string, unknown> | null, f))
      : [];
    rows.push({ file, values });
  }
  if (q.sortField) {
    const dirMult = q.sortDir === "DESC" ? -1 : 1;
    rows.sort((a, b) => {
      const av = resolveField(a.file, app.metadataCache.getFileCache(a.file)?.frontmatter ?? null, q.sortField!);
      const bv = resolveField(b.file, app.metadataCache.getFileCache(b.file)?.frontmatter ?? null, q.sortField!);
      const an = typeof av === "number" ? av : parseFloat(String(av));
      const bn = typeof bv === "number" ? bv : parseFloat(String(bv));
      if (Number.isFinite(an) && Number.isFinite(bn)) return (an - bn) * dirMult;
      return String(av ?? "").localeCompare(String(bv ?? "")) * dirMult;
    });
  }
  return rows;
}

function fmtCell(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number" && v > 1e12) {
    // Probably an mtime/ctime ms timestamp
    return new Date(v).toISOString().slice(0, 10);
  }
  if (Array.isArray(v)) return v.map((x) => String(x)).join(", ");
  return String(v);
}

// ─── Rendering ─────────────────────────────────────────────────────────────

function renderError(el: HTMLElement, msg: string) {
  const box = el.createEl("div", { cls: "swarmy-mini-dataview-error" });
  box.style.cssText = "padding:6px 8px;border:1px solid #C73E1D;border-radius:4px;color:#C73E1D;font-family:var(--font-monospace);";
  box.setText(msg);
}

function renderTable(el: HTMLElement, q: ParsedQuery, rows: QueryRow[]) {
  const table = el.createEl("table", { cls: "swarmy-mini-dataview-table" });
  const thead = table.createEl("thead");
  const trH = thead.createEl("tr");
  trH.createEl("th", { text: "File" });
  for (const f of q.fields) trH.createEl("th", { text: f });
  const tbody = table.createEl("tbody");
  for (const row of rows) {
    const tr = tbody.createEl("tr");
    const tdFile = tr.createEl("td");
    const a = tdFile.createEl("a", { cls: "internal-link", text: row.file.basename });
    a.setAttr("href", row.file.path);
    for (const v of row.values) tr.createEl("td", { text: fmtCell(v) });
  }
  if (rows.length === 0) {
    const tr = tbody.createEl("tr");
    const td = tr.createEl("td");
    td.setAttr("colspan", String(q.fields.length + 1));
    td.setText("(no matching rows)");
    td.style.cssText = "color:var(--text-muted);font-style:italic;";
  }
}

function renderList(el: HTMLElement, rows: QueryRow[]) {
  if (rows.length === 0) {
    const p = el.createEl("p");
    p.setText("(no matching rows)");
    p.style.cssText = "color:var(--text-muted);font-style:italic;";
    return;
  }
  const ul = el.createEl("ul", { cls: "swarmy-mini-dataview-list" });
  for (const row of rows) {
    const li = ul.createEl("li");
    const a = li.createEl("a", { cls: "internal-link", text: row.file.basename });
    a.setAttr("href", row.file.path);
  }
}

/**
 * MarkdownCodeBlockProcessor implementation. Register via:
 *   plugin.registerMarkdownCodeBlockProcessor("dataview", miniDataviewProcessor(plugin.app));
 */
export function miniDataviewProcessor(app: App) {
  return (source: string, el: HTMLElement, _ctx: MarkdownPostProcessorContext) => {
    const parsed = parseQuery(source);
    if (typeof parsed === "string") {
      renderError(el, parsed);
      return;
    }
    const rows = runQuery(app, parsed);
    if (parsed.kind === "TABLE") renderTable(el, parsed, rows);
    else renderList(el, rows);
  };
}
