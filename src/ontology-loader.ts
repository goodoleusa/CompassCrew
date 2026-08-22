/**
 * Ontology Loader — pluggable display-layer ontology for NSEW bearings.
 * Internal data model is ALWAYS N/S/E/W in frontmatter / COC / MCP. Only
 * the labels/colors/glyphs swap per user preference. Mutates the exported
 * BEARING_LABEL/COLOR/GLYPH/ROLE records in-place so UI consumers don't
 * need re-imports.
 */
import { App, Notice } from "obsidian";
import * as fs from "fs";
import * as path from "path";
import {
  Bearing,
  BEARING_LABEL,
  BEARING_COLOR,
  BEARING_GLYPH,
  BEARING_ROLE,
} from "./bearings";

export interface OntologyBearing { label: string; color: string; glyph: string; role: string; }
export interface OntologyCallout { id: string; icon?: string; color?: string; color_uses_bearing?: Bearing; }
export interface Ontology {
  name: string;
  bearings: Record<Bearing, OntologyBearing>;
  callouts?: OntologyCallout[];
  blueprint_pack?: string;
  mcp_servers?: string[];
}

export const DEFAULT_ONTOLOGY: Ontology = {
  name: "compasscrew",
  bearings: {
    N: { label: "N — unblock predecessor", color: "#C73E1D", glyph: "↑", role: "North — unblock predecessor (reverse-dependency, upstream anchor)" },
    S: { label: "S — conclude downstream", color: "#2E8540", glyph: "↓", role: "South — conclude / ship downstream (forward-dependency, next deliverable)" },
    E: { label: "E — parallel sister",     color: "#FF8E3C", glyph: "→", role: "East — parallel sister work (same DAG level, same mission)" },
    W: { label: "W — return to baseline",  color: "#FFB300", glyph: "←", role: "West — return to baseline / re-seat assumptions (backtrack to HQ)" },
  },
  callouts: [],
  blueprint_pack: "compasscrew",
};

let ACTIVE: Ontology = JSON.parse(JSON.stringify(DEFAULT_ONTOLOGY));
export function getActiveOntology(): Ontology { return ACTIVE; }

export function applyOntology(o: Ontology): void {
  ACTIVE = o;
  (["N", "S", "E", "W"] as Bearing[]).forEach((b) => {
    const def = o.bearings[b];
    if (!def) return;
    BEARING_LABEL[b] = def.label;
    BEARING_COLOR[b] = def.color;
    BEARING_GLYPH[b] = def.glyph;
    BEARING_ROLE[b]  = def.role;
  });
}

function stripQuotes(s: string): string {
  s = s.trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return s.slice(1, -1);
  return s;
}

function parseInlineMap(s: string): Record<string, string> {
  const inner = s.trim().replace(/^\{/, "").replace(/\}$/, "");
  const out: Record<string, string> = {};
  let depth = 0, buf = "", parts: string[] = [];
  for (const ch of inner) {
    if (ch === "{" || ch === "[") depth++;
    if (ch === "}" || ch === "]") depth--;
    if (ch === "," && depth === 0) { parts.push(buf); buf = ""; continue; }
    buf += ch;
  }
  if (buf.trim()) parts.push(buf);
  for (const p of parts) {
    const i = p.indexOf(":");
    if (i === -1) continue;
    out[p.slice(0, i).trim()] = stripQuotes(p.slice(i + 1));
  }
  return out;
}

export function parseYaml(text: string): any {
  const lines = text.split(/\r?\n/)
    .map((l) => l.replace(/\s+#.*$/, "").replace(/^#.*$/, ""))
    .filter((l) => l.trim().length > 0);
  let idx = 0;
  const indentOf = (l: string) => l.length - l.replace(/^\s+/, "").length;

  function parseBlock(baseIndent: number): any {
    if (idx >= lines.length) return null;
    const first = lines[idx];
    if (indentOf(first) < baseIndent) return null;
    const trimmed = first.slice(baseIndent);
    if (trimmed.startsWith("- ")) {
      const out: any[] = [];
      while (idx < lines.length) {
        const l = lines[idx];
        if (indentOf(l) < baseIndent) break;
        const t = l.slice(baseIndent);
        if (!t.startsWith("- ")) break;
        const rest = t.slice(2).trim();
        idx++;
        if (rest.startsWith("{") && rest.endsWith("}")) {
          out.push(parseInlineMap(rest));
        } else if (rest.includes(":") && !rest.endsWith(":")) {
          const map: Record<string, any> = {};
          const ci = rest.indexOf(":");
          const k = rest.slice(0, ci).trim();
          const v = rest.slice(ci + 1).trim();
          if (v) map[k] = stripQuotes(v);
          while (idx < lines.length && indentOf(lines[idx]) >= baseIndent + 2) {
            const ll = lines[idx].slice(baseIndent + 2);
            const cci = ll.indexOf(":");
            if (cci === -1) { idx++; continue; }
            const kk = ll.slice(0, cci).trim();
            const vv = ll.slice(cci + 1).trim();
            idx++;
            map[kk] = vv ? stripQuotes(vv) : parseBlock(baseIndent + 4);
          }
          out.push(map);
        } else {
          out.push(stripQuotes(rest));
        }
      }
      return out;
    }
    const out: Record<string, any> = {};
    while (idx < lines.length) {
      const l = lines[idx];
      if (indentOf(l) < baseIndent) break;
      if (indentOf(l) > baseIndent) { idx++; continue; }
      const t = l.slice(baseIndent);
      const ci = t.indexOf(":");
      if (ci === -1) { idx++; continue; }
      const k = t.slice(0, ci).trim();
      const v = t.slice(ci + 1).trim();
      idx++;
      if (!v) {
        out[k] = parseBlock(baseIndent + 2);
      } else if (v.startsWith("{") && v.endsWith("}")) {
        out[k] = parseInlineMap(v);
      } else if (v.startsWith("[") && v.endsWith("]")) {
        out[k] = v.slice(1, -1).split(",").map((s) => stripQuotes(s)).filter(Boolean);
      } else {
        out[k] = stripQuotes(v);
      }
    }
    return out;
  }
  return parseBlock(0);
}

export function ontologyToYaml(o: Ontology): string {
  const lines: string[] = [];
  lines.push(`name: "${o.name}"`);
  lines.push(`bearings:`);
  (["N", "S", "E", "W"] as Bearing[]).forEach((b) => {
    const d = o.bearings[b];
    lines.push(`  ${b}: {label: "${d.label}", color: "${d.color}", glyph: "${d.glyph}", role: "${d.role}"}`);
  });
  if (o.callouts && o.callouts.length) {
    lines.push(`callouts:`);
    for (const c of o.callouts) {
      const parts = [`id: "${c.id}"`];
      if (c.icon) parts.push(`icon: "${c.icon}"`);
      if (c.color) parts.push(`color: "${c.color}"`);
      if (c.color_uses_bearing) parts.push(`color_uses_bearing: ${c.color_uses_bearing}`);
      lines.push(`  - {${parts.join(", ")}}`);
    }
  }
  if (o.blueprint_pack) lines.push(`blueprint_pack: "${o.blueprint_pack}"`);
  if (o.mcp_servers && o.mcp_servers.length) {
    lines.push(`mcp_servers: [${o.mcp_servers.map((s) => `"${s}"`).join(", ")}]`);
  }
  return lines.join("\n") + "\n";
}

function coerceOntology(raw: any): Ontology {
  const o: Ontology = JSON.parse(JSON.stringify(DEFAULT_ONTOLOGY));
  if (!raw || typeof raw !== "object") return o;
  if (raw.name) o.name = String(raw.name);
  if (raw.bearings && typeof raw.bearings === "object") {
    (["N", "S", "E", "W"] as Bearing[]).forEach((b) => {
      const r = raw.bearings[b];
      if (r && typeof r === "object") {
        o.bearings[b] = {
          label: r.label ?? o.bearings[b].label,
          color: r.color ?? o.bearings[b].color,
          glyph: r.glyph ?? o.bearings[b].glyph,
          role:  r.role  ?? o.bearings[b].role,
        };
      }
    });
  }
  if (Array.isArray(raw.callouts)) o.callouts = raw.callouts;
  if (raw.blueprint_pack) o.blueprint_pack = String(raw.blueprint_pack);
  if (Array.isArray(raw.mcp_servers)) o.mcp_servers = raw.mcp_servers.map(String);
  return o;
}

function vaultRoot(app: App): string { return (app.vault.adapter as unknown as { basePath: string }).basePath; }
function ontologyPath(app: App): string { return path.join(vaultRoot(app), ".compasscrew", "ontology.yaml"); }

export function loadOntologyFromVault(app: App): Ontology {
  const p = ontologyPath(app);
  try {
    if (!fs.existsSync(p)) return DEFAULT_ONTOLOGY;
    return coerceOntology(parseYaml(fs.readFileSync(p, "utf8")));
  } catch (e) {
    new Notice(`Ontology load failed: ${(e as Error).message}. Using default.`, 5000);
    return DEFAULT_ONTOLOGY;
  }
}

export function loadOntologyFromFile(absPath: string): Ontology {
  return coerceOntology(parseYaml(fs.readFileSync(absPath, "utf8")));
}

export function writeOntologyToVault(app: App, o: Ontology): void {
  const p = ontologyPath(app);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, ontologyToYaml(o), "utf8");
}

export function initOntology(app: App): Ontology {
  const o = loadOntologyFromVault(app);
  applyOntology(o);
  return o;
}

export interface DoctorReport { ok: boolean; issues: string[]; ontology: Ontology; }

export function ontologyDoctor(o: Ontology): DoctorReport {
  const issues: string[] = [];
  if (!o.name) issues.push("missing `name`");
  (["N", "S", "E", "W"] as Bearing[]).forEach((b) => {
    const d = o.bearings?.[b];
    if (!d) { issues.push(`missing bearings.${b}`); return; }
    if (!d.label) issues.push(`bearings.${b}.label is empty`);
    if (!d.color || !/^#[0-9A-Fa-f]{6}$/.test(d.color)) issues.push(`bearings.${b}.color is not 6-digit hex: ${d.color}`);
    if (!d.glyph) issues.push(`bearings.${b}.glyph is empty`);
    if (!d.role) issues.push(`bearings.${b}.role is empty`);
  });
  if (o.callouts) {
    for (const c of o.callouts) {
      if (!c.id) issues.push("a callout is missing `id`");
      if (c.color_uses_bearing && !["N", "S", "E", "W"].includes(c.color_uses_bearing)) {
        issues.push(`callout ${c.id} has invalid color_uses_bearing: ${c.color_uses_bearing}`);
      }
    }
  }
  return { ok: issues.length === 0, issues, ontology: o };
}
