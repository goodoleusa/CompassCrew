/**
 * micro-njk — a tiny Nunjucks-flavored template renderer.
 *
 * Supports a curated subset of Nunjucks syntax sufficient for the Hive
 * blueprint library:
 *   - {{ var }}              variable interpolation (with dotted paths)
 *   - {{ var | default(x) }} pipe filters: default, upper, lower, length,
 *                             join, slice, replace, date, float, int
 *   - {{ var.path.to.field }} dotted paths into objects
 *   - {% if expr %} ... {% else %} ... {% endif %}
 *   - {% for x in xs %} ... {% endfor %}     (with loop.index)
 *   - {% set x = ... %}      simple assignment
 *
 * Intentionally OMITTED (use full nunjucks if you need them):
 *   - {% include %} / {% extends %} / {% block %}
 *   - Macros
 *   - Complex filter chaining beyond 2 deep
 *   - Custom test functions
 *
 * Why ship our own: we want zero runtime npm dependencies. The plugin
 * bundles to a single main.js with nothing but Obsidian API stubs as
 * externals. ~250 lines beats a 100KB nunjucks dependency.
 */

type Ctx = Record<string, any>;

function resolvePath(ctx: Ctx, path: string): any {
  const parts = path.split(".");
  let cur: any = ctx;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

const FILTERS: Record<string, (v: any, ...args: any[]) => any> = {
  default: (v, d) => (v == null || v === "" ? d : v),
  upper: (v) => String(v ?? "").toUpperCase(),
  lower: (v) => String(v ?? "").toLowerCase(),
  length: (v) => (v == null ? 0 : (Array.isArray(v) ? v.length : String(v).length)),
  join: (v, sep = ", ") => Array.isArray(v) ? v.join(sep) : String(v ?? ""),
  slice: (v, start, end) => Array.isArray(v) || typeof v === "string" ? (v as any).slice(start, end) : v,
  replace: (v, a, b) => String(v ?? "").split(a).join(b),
  date: (v, fmt = "YYYY-MM-DD") => {
    try {
      const d = v ? new Date(v) : new Date();
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      return fmt.replace("YYYY", String(yyyy)).replace("MM", mm).replace("DD", dd);
    } catch { return String(v ?? ""); }
  },
  float: (v) => parseFloat(String(v ?? "0")) || 0,
  int: (v) => parseInt(String(v ?? "0"), 10) || 0,
  string: (v) => String(v ?? ""),
};

function evalLiteral(s: string, ctx: Ctx): any {
  s = s.trim();
  if (!s) return undefined;
  if (s === "true") return true;
  if (s === "false") return false;
  if (s === "null") return null;
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  if (s.startsWith("[") && s.endsWith("]")) {
    try { return JSON.parse(s.replace(/'/g, '"')); } catch { return []; }
  }
  return resolvePath(ctx, s);
}

function evalExpr(expr: string, ctx: Ctx): any {
  // Pipe filters: split on `|` outside of parentheses/quotes.
  const parts = splitPipes(expr);
  let val = evalLiteral(parts[0].trim(), ctx);
  for (let i = 1; i < parts.length; i++) {
    const seg = parts[i].trim();
    const m = seg.match(/^(\w+)\s*(?:\((.*)\))?$/);
    if (!m) continue;
    const fname = m[1];
    const args = m[2] ? splitArgs(m[2]).map((a) => evalLiteral(a, ctx)) : [];
    const fn = FILTERS[fname];
    if (fn) val = fn(val, ...args);
  }
  return val;
}

function splitPipes(s: string): string[] {
  const out: string[] = [];
  let depth = 0, quote: string | null = null, last = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === "|" && depth === 0) {
      out.push(s.slice(last, i));
      last = i + 1;
    }
  }
  out.push(s.slice(last));
  return out;
}

function splitArgs(s: string): string[] {
  const out: string[] = [];
  let depth = 0, quote: string | null = null, last = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth--;
    else if (ch === "," && depth === 0) {
      out.push(s.slice(last, i));
      last = i + 1;
    }
  }
  out.push(s.slice(last));
  return out.filter((x) => x.trim().length > 0);
}

function evalCondition(cond: string, ctx: Ctx): boolean {
  // Support: x, !x, x == y, x != y, x > y, x < y, x >= y, x <= y
  const ops: Array<[string, (a: any, b: any) => boolean]> = [
    [">=", (a, b) => Number(a) >= Number(b)],
    ["<=", (a, b) => Number(a) <= Number(b)],
    ["==", (a, b) => a == b],
    ["!=", (a, b) => a != b],
    [">", (a, b) => Number(a) > Number(b)],
    ["<", (a, b) => Number(a) < Number(b)],
  ];
  for (const [op, fn] of ops) {
    const idx = cond.indexOf(op);
    if (idx > 0) {
      const left = evalExpr(cond.slice(0, idx), ctx);
      const right = evalExpr(cond.slice(idx + op.length), ctx);
      return fn(left, right);
    }
  }
  if (cond.startsWith("!")) return !evalExpr(cond.slice(1), ctx);
  const v = evalExpr(cond, ctx);
  if (Array.isArray(v)) return v.length > 0;
  return !!v;
}

export function renderString(tpl: string, ctx: Ctx): string {
  // Tokenize: split on {% ... %} and {{ ... }}.
  const tokens: Array<{ type: "text" | "var" | "tag"; v: string }> = [];
  const re = /(\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\})/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tpl)) !== null) {
    if (m.index > last) tokens.push({ type: "text", v: tpl.slice(last, m.index) });
    if (m[0].startsWith("{{")) tokens.push({ type: "var", v: m[0].slice(2, -2).trim() });
    else tokens.push({ type: "tag", v: m[0].slice(2, -2).trim() });
    last = m.index + m[0].length;
  }
  if (last < tpl.length) tokens.push({ type: "text", v: tpl.slice(last) });

  // Render with a pointer-based interpreter (handles nested if / for).
  let i = 0;
  function render(stopAt: string[] = []): string {
    let out = "";
    while (i < tokens.length) {
      const t = tokens[i];
      if (t.type === "tag") {
        const head = t.v.split(/\s+/)[0];
        if (stopAt.includes(head)) return out;
        i++;
        if (head === "if") {
          const cond = t.v.slice(2).trim();
          const branch1: number[] = [i, -1];   // [start, end)
          // scan to elif/else/endif
          let depth = 1;
          let elseStart = -1;
          let endIdx = -1;
          for (let j = i; j < tokens.length; j++) {
            if (tokens[j].type !== "tag") continue;
            const h = tokens[j].v.split(/\s+/)[0];
            if (h === "if") depth++;
            else if (h === "endif") { depth--; if (depth === 0) { endIdx = j; break; } }
            else if (h === "else" && depth === 1) elseStart = j;
          }
          if (endIdx === -1) return out + "{% if " + cond + " ?? unclosed %}";
          const ok = evalCondition(cond, ctx);
          if (ok) {
            const saved = i;
            const stopJ = elseStart >= 0 ? elseStart : endIdx;
            const sliceTokens = tokens.slice(saved, stopJ);
            out += renderSlice(sliceTokens, ctx);
          } else if (elseStart >= 0) {
            const sliceTokens = tokens.slice(elseStart + 1, endIdx);
            out += renderSlice(sliceTokens, ctx);
          }
          i = endIdx + 1;
        } else if (head === "for") {
          const m2 = t.v.match(/^for\s+(\w+)\s+in\s+(.+)$/);
          let endIdx = -1;
          let depth = 1;
          for (let j = i; j < tokens.length; j++) {
            if (tokens[j].type !== "tag") continue;
            const h = tokens[j].v.split(/\s+/)[0];
            if (h === "for") depth++;
            else if (h === "endfor") { depth--; if (depth === 0) { endIdx = j; break; } }
          }
          if (!m2 || endIdx === -1) return out + "{% for ?? unclosed %}";
          const varName = m2[1];
          const seq = evalExpr(m2[2], ctx) || [];
          const bodyTokens = tokens.slice(i, endIdx);
          if (Array.isArray(seq)) {
            for (let k = 0; k < seq.length; k++) {
              const sub = { ...ctx, [varName]: seq[k], loop: { index: k + 1, index0: k, first: k === 0, last: k === seq.length - 1 } };
              out += renderSlice(bodyTokens, sub);
            }
          }
          i = endIdx + 1;
        } else if (head === "set") {
          const m3 = t.v.match(/^set\s+(\w+)\s*=\s*(.+)$/);
          if (m3) ctx[m3[1]] = evalExpr(m3[2], ctx);
        } else {
          // unknown tag — emit as-is
          out += `{% ${t.v} %}`;
        }
      } else if (t.type === "var") {
        const v = evalExpr(t.v, ctx);
        out += v == null ? "" : String(v);
        i++;
      } else {
        out += t.v;
        i++;
      }
    }
    return out;
  }

  function renderSlice(slice: typeof tokens, sliceCtx: Ctx): string {
    // Sub-render by serializing slice into a string and recursing.
    // Cheaper alternative: re-tokenize wouldn't preserve fidelity.
    // We use a mini-interpreter that mirrors the main loop.
    let out = "";
    let k = 0;
    while (k < slice.length) {
      const t = slice[k];
      if (t.type === "text") { out += t.v; k++; continue; }
      if (t.type === "var") { const v = evalExpr(t.v, sliceCtx); out += v == null ? "" : String(v); k++; continue; }
      const head = t.v.split(/\s+/)[0];
      if (head === "if") {
        let depth = 1, endK = -1, elseK = -1;
        for (let j = k + 1; j < slice.length; j++) {
          if (slice[j].type !== "tag") continue;
          const h = slice[j].v.split(/\s+/)[0];
          if (h === "if") depth++;
          else if (h === "endif") { depth--; if (depth === 0) { endK = j; break; } }
          else if (h === "else" && depth === 1) elseK = j;
        }
        if (endK === -1) { out += "{% if ?? %}"; k++; continue; }
        const cond = t.v.slice(2).trim();
        const ok = evalCondition(cond, sliceCtx);
        if (ok) out += renderSlice(slice.slice(k + 1, elseK >= 0 ? elseK : endK), sliceCtx);
        else if (elseK >= 0) out += renderSlice(slice.slice(elseK + 1, endK), sliceCtx);
        k = endK + 1;
      } else if (head === "for") {
        let depth = 1, endK = -1;
        for (let j = k + 1; j < slice.length; j++) {
          if (slice[j].type !== "tag") continue;
          const h = slice[j].v.split(/\s+/)[0];
          if (h === "for") depth++;
          else if (h === "endfor") { depth--; if (depth === 0) { endK = j; break; } }
        }
        const m2 = t.v.match(/^for\s+(\w+)\s+in\s+(.+)$/);
        if (!m2 || endK === -1) { out += "{% for ?? %}"; k++; continue; }
        const varName = m2[1];
        const seq = evalExpr(m2[2], sliceCtx) || [];
        const bodyTokens = slice.slice(k + 1, endK);
        if (Array.isArray(seq)) {
          for (let i2 = 0; i2 < seq.length; i2++) {
            const sub = { ...sliceCtx, [varName]: seq[i2], loop: { index: i2 + 1, index0: i2, first: i2 === 0, last: i2 === seq.length - 1 } };
            out += renderSlice(bodyTokens, sub);
          }
        }
        k = endK + 1;
      } else if (head === "set") {
        const m3 = t.v.match(/^set\s+(\w+)\s*=\s*(.+)$/);
        if (m3) sliceCtx[m3[1]] = evalExpr(m3[2], sliceCtx);
        k++;
      } else {
        out += `{% ${t.v} %}`;
        k++;
      }
    }
    return out;
  }

  return render();
}
