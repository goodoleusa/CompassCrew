/**
 * coc-verify.ts — chain-of-custody verification, ported faithfully from the current
 * `reckon-lite/coc-core/coc_core.py`.
 *
 * WHY A PORT AND NOT A VENDORED COPY. The sister repos (revenant-dev, cybertemplate) vendor
 * `coc-core/` as Python because they RUN Python and import it. This is an Obsidian plugin: a
 * bundled TypeScript module in an Electron renderer with no Python runtime. A 231 KB
 * `coc_core.py` dropped in here could never be imported, never be executed, and — critically —
 * is not swept by `reckon-lite/tools/revenant_vendor_sync_lite.py`, whose `_ROOTS` list does not
 * include this repo. That is the textbook shape of the failure that tool exists to catch: a copy
 * no mechanism compares is a fork that simply has not diverged yet. So instead of a dead copy,
 * this is a live port of the three rules that actually govern verification, each carrying the
 * measurement that produced it.
 *
 * WHAT IS PORTED, and the doctrine behind each:
 *
 *  1. CANONICAL HASH — sha256 over `json.dumps(entry, sort_keys=True, separators=(',',':'))`
 *     with the entry's own `entry_hash`/`signature`/`pq_signature` excluded. Two recipes are
 *     tried and the matching one is NAMED, never collapsed to a boolean: a leaf that verifies
 *     under a superseded recipe is a different fact from one that verifies under the current
 *     one, and collapsing them makes a recipe boundary indistinguishable from tampering.
 *
 *  2. ALIAS RESOLUTION — link fields have drifted historically (`prev_chain_hash`, `prev_hash`,
 *     `prev_entry_sha`, `prev_phase_entry_sha`, `parent_hash`, `previous_hash`). A partial alias
 *     list once hid 26 real custody entries from every verifier while verification reported
 *     clean, so the full list is carried here verbatim.
 *
 *  3. REACHABILITY, NOT ADJACENCY — this is the correction most stale verifiers get wrong, and
 *     the single most important thing this file exists to say. Shards are STORAGE; the chain is
 *     ORDER. Sequence is recovered by REPLAYING LINKS, never by concatenating files in directory
 *     order. Measured 2026-08-05 over 111 chain-bearing ledgers (3,900 leaves): the adjacency
 *     test ("line N's prev_entry_hash must equal line N-1's entry_hash") reports 2,230 breaks;
 *     resolving every parent against the union of all leaves AS A SET reports 0 dangling. The
 *     ledger was sound — the TEST was wrong, and the repo-wide RED it produced blocked ~275
 *     attest-gaps. This weakens nothing: a parent that resolves NOWHERE is still a hole and still
 *     a hard FAIL. Out-of-order storage and forks are reported under their own names so neither
 *     is silent and neither is mistaken for a break.
 *
 * THREE VERDICTS ONLY — PASS · FAIL · UNMEASURED-with-the-obstacle-named. A false RED costs
 * exactly what a false GREEN costs, so a check that goes quiet when it cannot see is the worse
 * of the two.
 *
 * Signature verification is NOT performed here and is reported as UNMEASURED with that reason
 * named. Signing is PQ-default (ML-DSA-65 via `pq_sign`) in the current ecosystem; ed25519 leaves
 * additionally carry a `sig_body` scheme id that says exactly which body a signature covers, and
 * an unknown scheme id is UNVERIFIABLE rather than "assume current". Guessing at either from a
 * browser context would produce exactly the searched-for-a-shape-until-one-verified result that
 * `coc_core`'s own comments forbid, which is how a forged leaf is made to verify.
 */

import { Notice, Plugin } from "obsidian";
import {
  TOOL,
  callReckonTool,
  resolveToken,
  vaultRoot,
  type McpBridgeSettings,
} from "./reckon-contract";
import * as fs from "fs";
import * as path from "path";

// ═══════════════════════════════════════════════════════════════════════════════
// ALL VARS AT TOP — transcribed from reckon-lite/coc-core/coc_core.py
// ═══════════════════════════════════════════════════════════════════════════════

/** `coc_core._LINEAR_HASH_ALIASES` — an entry's own self-hash, by any name it has been written. */
export const LINEAR_HASH_ALIASES = ["entry_hash", "chain_hash", "hash", "entry_sha"] as const;

/** `coc_core._LINEAR_PREV_ALIASES` — the LINEAR predecessor link, by any name. */
export const LINEAR_PREV_ALIASES = [
  "prev_entry_hash", "prev_chain_hash", "prev_hash",
  "prev_phase_entry_sha", "prev_entry_sha", "parent_hash", "previous_hash",
] as const;

/** `coc_core.HASH_EXCLUDED_FIELDS` — the current recipe (2026-08-03 onward). */
export const HASH_EXCLUDED_CURRENT = ["entry_hash", "signature", "pq_signature"] as const;

/**
 * `coc_core.HASH_EXCLUDED_FIELDS_LEGACY` — the pre-2026-08-03 recipe. KEPT, NEVER "FIXED":
 * those leaves are correctly hashed under the rule in force when they were written. Rewriting
 * them to today's recipe would forge new hashes over old bytes.
 */
export const HASH_EXCLUDED_LEGACY = ["entry_hash", "signature"] as const;

/** `coc_core.HASH_RECIPES`, in order. The matching recipe is always named in the result. */
export const HASH_RECIPES: ReadonlyArray<{ name: string; excluded: readonly string[] }> = [
  { name: "current", excluded: HASH_EXCLUDED_CURRENT },
  { name: "legacy-pq-in-body", excluded: HASH_EXCLUDED_LEGACY },
];

/** Chain-link markers that make a row a custody LEAF rather than a telemetry row. */
export const CHAIN_MARKERS = ["entry_hash", "prev_entry_hash", "parent_hashes", "node_hash"] as const;

/** Sentinel `prev_entry_hash` values that mean "chain root", not "dangling parent". */
export const GENESIS_SENTINELS = new Set(["genesis", "GENESIS", "0", ""]);

/**
 * Sentinels a BROKEN writer once stamped in place of a real parent. These are hard FAILs with
 * their own name: `coc_core` records leaves appended with `prev_entry_hash` set to the literal
 * strings `"unknown"` and `"lock-timeout"`, deterministically breaking the chain at creation.
 */
export const POISON_SENTINELS = new Set(["unknown", "lock-timeout"]);

export const SIGNATURE_UNMEASURED_REASON =
  "signature verification not attempted — signing is PQ-default (ML-DSA-65) and ed25519 leaves " +
  "name their own sig_body scheme; an unknown scheme is UNVERIFIABLE, never 'assume current'. " +
  "Verify signatures server-side via reckon_coc verb=verify or reckon_sign verb=verify.";

// ═══════════════════════════════════════════════════════════════════════════════
// CHUNK: python-compatible canonical JSON
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Reproduce `json.dumps(obj, sort_keys=True, separators=(",", ":"))` byte-for-byte.
 *
 * Three things `JSON.stringify` does differently and each of them silently changes the hash:
 *   · Python's default `ensure_ascii=True` escapes every non-ASCII codepoint as \uXXXX.
 *   · Python sorts dict keys at EVERY level, not just the top.
 *   · Python emits `Infinity`/`NaN` bare; JSON.stringify emits `null`. Rather than hash a lie we
 *     throw, so a non-finite number surfaces as UNMEASURED instead of a wrong verdict.
 */
export function pyCanonicalJson(value: unknown): string {
  if (value === null) return "null";
  const t = typeof value;
  if (t === "boolean") return value ? "true" : "false";
  if (t === "number") {
    const n = value as number;
    if (!Number.isFinite(n)) throw new Error("non-finite number is not canonically hashable");
    return Number.isInteger(n) && Object.is(n, Math.trunc(n)) ? String(n) : String(n);
  }
  if (t === "string") return pyJsonString(value as string);
  if (Array.isArray(value)) return `[${value.map(pyCanonicalJson).join(",")}]`;
  if (t === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort(compareByCodePoint);
    return `{${keys.map((k) => `${pyJsonString(k)}:${pyCanonicalJson(obj[k])}`).join(",")}}`;
  }
  throw new Error(`value of type ${t} is not canonically hashable`);
}

/** Python sorts strings by CODE POINT; JS `Array.sort` compares UTF-16 code units. */
function compareByCodePoint(a: string, b: string): number {
  const ap = Array.from(a), bp = Array.from(b);
  const n = Math.min(ap.length, bp.length);
  for (let i = 0; i < n; i++) {
    const d = (ap[i].codePointAt(0)! - bp[i].codePointAt(0)!);
    if (d !== 0) return d;
  }
  return ap.length - bp.length;
}

/** `json.encoder.py_encode_basestring_ascii` — the ensure_ascii=True string escaper. */
function pyJsonString(s: string): string {
  let out = '"';
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    if (ch === '"') out += '\\"';
    else if (ch === "\\") out += "\\\\";
    else if (ch === "\n") out += "\\n";
    else if (ch === "\r") out += "\\r";
    else if (ch === "\t") out += "\\t";
    else if (ch === "\b") out += "\\b";
    else if (ch === "\f") out += "\\f";
    else if (cp < 0x20) out += "\\u" + cp.toString(16).padStart(4, "0");
    else if (cp < 0x7f) out += ch;
    else if (cp <= 0xffff) out += "\\u" + cp.toString(16).padStart(4, "0");
    else {
      // Astral plane: Python emits a UTF-16 surrogate pair, same as the JS internal encoding.
      const v = cp - 0x10000;
      const hi = 0xd800 + (v >> 10), lo = 0xdc00 + (v & 0x3ff);
      out += "\\u" + hi.toString(16).padStart(4, "0") + "\\u" + lo.toString(16).padStart(4, "0");
    }
  }
  return out + '"';
}

export async function sha256Hex(text: string): Promise<string> {
  const buf = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ═══════════════════════════════════════════════════════════════════════════════
// CHUNK: link resolution (coc_core.resolve_chain_link / is_chain_entry)
// ═══════════════════════════════════════════════════════════════════════════════

export type CocEntry = Record<string, unknown>;

export interface ChainLink {
  entry_hash: string | null;
  prev_entry_hash: string | null;
  /** DAG branch/merge parents — a SEPARATE relation, NEVER folded into prev_entry_hash. */
  parent_hashes: string[] | null;
  node_hash: string | null;
  prev_rollup_root: string | null;
}

function firstPresent(entry: CocEntry, keys: readonly string[]): string | null {
  for (const k of keys) {
    const v = entry[k];
    if (v !== null && v !== undefined && v !== "") return String(v);
  }
  return null;
}

/** `coc_core.resolve_chain_link` — canonical names regardless of the alias actually written. */
export function resolveChainLink(entry: CocEntry): ChainLink {
  let parents = entry["parent_hashes"];
  if (parents === null || parents === undefined) {
    const cc = entry["coc_chain"];
    if (cc && typeof cc === "object") parents = (cc as Record<string, unknown>)["parent_hashes"];
  }
  return {
    entry_hash: firstPresent(entry, LINEAR_HASH_ALIASES),
    prev_entry_hash: firstPresent(entry, LINEAR_PREV_ALIASES),
    parent_hashes: Array.isArray(parents) ? parents.map(String) : null,
    node_hash: (entry["node_hash"] as string) ?? null,
    prev_rollup_root: (entry["prev_rollup_root"] as string) ?? null,
  };
}

/** `coc_core.is_chain_entry` — filters telemetry rows misfiled as custody leaves. */
export function isChainEntry(entry: CocEntry): boolean {
  const link = resolveChainLink(entry);
  return CHAIN_MARKERS.some((k) => {
    const v = (link as unknown as Record<string, unknown>)[k];
    return Array.isArray(v) ? v.length > 0 : Boolean(v);
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// CHUNK: entry-hash verification (coc_core.verify_entry_hash)
// ═══════════════════════════════════════════════════════════════════════════════

export interface EntryHashResult {
  ok: boolean;
  /** The recipe that matched, NAMED. `null` when nothing matched — that leaf has earned suspicion. */
  recipe: string | null;
  detail: string;
}

function hashedBody(entry: CocEntry, excluded: readonly string[]): CocEntry {
  const out: CocEntry = {};
  for (const [k, v] of Object.entries(entry)) if (!excluded.includes(k)) out[k] = v;
  return out;
}

/** Try every recipe this chain has ever used and NAME the one that matched. Never a bare bool. */
export async function verifyEntryHash(entry: CocEntry): Promise<EntryHashResult> {
  const stored = entry["entry_hash"];
  if (!stored) return { ok: false, recipe: null, detail: "no entry_hash on this leaf" };
  let tried: string[] = [];
  try {
    for (const { name, excluded } of HASH_RECIPES) {
      tried.push(name);
      if (await sha256Hex(pyCanonicalJson(hashedBody(entry, excluded))) === stored) {
        return { ok: true, recipe: name, detail: "" };
      }
    }
    // `pq_absent_reason` post-stamping is reported as its own recipe rather than excused silently.
    if ("pq_absent_reason" in entry) {
      const ex = [...HASH_EXCLUDED_CURRENT, "pq_absent_reason"];
      if (await sha256Hex(pyCanonicalJson(hashedBody(entry, ex))) === stored) {
        return {
          ok: true,
          recipe: "pq-absent-reason-post-stamped",
          detail: "pq_absent_reason was written after the hash was taken",
        };
      }
      tried.push("pq-absent-reason-post-stamped");
    }
  } catch (e) {
    return { ok: false, recipe: null, detail: `not canonically hashable: ${(e as Error).message}` };
  }
  return { ok: false, recipe: null, detail: `matches no known hash recipe (tried: ${tried.join(", ")})` };
}

// ═══════════════════════════════════════════════════════════════════════════════
// CHUNK: chain verification by REACHABILITY
// ═══════════════════════════════════════════════════════════════════════════════

export type Verdict = "PASS" | "FAIL" | "UNMEASURED";

export interface ChainReport {
  verdict: Verdict;
  /** Named obstacle when verdict is UNMEASURED. Absent and fine are different facts. */
  obstacle: string | null;
  rows_seen: number;
  /** Rows filtered out as telemetry (no chain markers at all). */
  telemetry_skipped: number;
  leaves: number;
  /** HARD FAIL: a claimed parent that resolves nowhere in the set. This is the check with teeth. */
  dangling_parents: string[];
  /** HARD FAIL: `prev_entry_hash` stamped with a broken-writer sentinel. */
  poisoned_links: string[];
  /** Reported under its own name — NOT a break. Shards are storage; the chain is order. */
  out_of_storage_order: number;
  /** Two leaves claiming the SAME parent. Detected on purpose, not as an accident of adjacency. */
  forks: Array<{ parent: string; children: string[] }>;
  /** Per-recipe counts. A recipe boundary must stay visible and countable. */
  hash_recipes: Record<string, number>;
  hash_failures: Array<{ entry_hash: string; detail: string }>;
  signature_check: { verdict: Verdict; reason: string };
}

/**
 * Verify a set of COC leaves.
 *
 * The union of every `entry_hash` in the set is the resolution target — parents are resolved
 * against that SET, never against the previous line. Storage order is measured separately and
 * reported as a fact about the writer, never as a break.
 */
export async function verifyChain(rows: CocEntry[]): Promise<ChainReport> {
  const report: ChainReport = {
    verdict: "UNMEASURED", obstacle: null, rows_seen: rows.length, telemetry_skipped: 0,
    leaves: 0, dangling_parents: [], poisoned_links: [], out_of_storage_order: 0, forks: [],
    hash_recipes: {}, hash_failures: [],
    signature_check: { verdict: "UNMEASURED", reason: SIGNATURE_UNMEASURED_REASON },
  };

  if (rows.length === 0) {
    report.obstacle = "no rows returned — the server answered with an empty chain, which is not " +
      "the same fact as a chain that verified clean";
    return report;
  }

  const leaves = rows.filter((r) => {
    if (isChainEntry(r)) return true;
    report.telemetry_skipped++;
    return false;
  });
  report.leaves = leaves.length;
  if (leaves.length === 0) {
    report.obstacle = `all ${rows.length} rows are telemetry (no entry_hash / prev_entry_hash / ` +
      `parent_hashes / node_hash) — there is no chain here to verify`;
    return report;
  }

  // The union of every self-hash present. Reachability resolves against this, as a SET.
  const known = new Set<string>();
  for (const l of leaves) {
    const h = resolveChainLink(l).entry_hash;
    if (h) known.add(h);
  }

  const claimedBy = new Map<string, string[]>();
  let prevHash: string | null = null;

  for (const leaf of leaves) {
    const link = resolveChainLink(leaf);

    // ── entry-hash recomputation, recipe NAMED ──
    if (link.entry_hash) {
      const hr = await verifyEntryHash(leaf);
      if (hr.ok && hr.recipe) report.hash_recipes[hr.recipe] = (report.hash_recipes[hr.recipe] ?? 0) + 1;
      else report.hash_failures.push({ entry_hash: link.entry_hash, detail: hr.detail });
    }

    // ── linear parent, resolved by REACHABILITY ──
    const prev = link.prev_entry_hash;
    if (prev !== null) {
      if (POISON_SENTINELS.has(prev)) {
        report.poisoned_links.push(`${link.entry_hash ?? "?"} → "${prev}"`);
      } else if (!GENESIS_SENTINELS.has(prev)) {
        if (!known.has(prev)) report.dangling_parents.push(prev);
        // Storage order, measured separately and never as a break. `prevHash === null` means
        // this is the FIRST stored row and it already claims a non-genesis parent — the clearest
        // possible statement that file order is not link order.
        if (prev !== prevHash) report.out_of_storage_order++;
        const kids = claimedBy.get(prev) ?? [];
        kids.push(link.entry_hash ?? "?");
        claimedBy.set(prev, kids);
      }
    }

    // ── DAG parents are a SEPARATE relation; they must also resolve, never as linear links ──
    for (const p of link.parent_hashes ?? []) {
      if (!GENESIS_SENTINELS.has(p) && !known.has(p)) report.dangling_parents.push(p);
    }

    prevHash = link.entry_hash ?? prevHash;
  }

  for (const [parent, children] of claimedBy) {
    if (children.length > 1) report.forks.push({ parent, children });
  }

  const hardFail =
    report.dangling_parents.length > 0 ||
    report.poisoned_links.length > 0 ||
    report.hash_failures.length > 0;
  report.verdict = hardFail ? "FAIL" : "PASS";
  return report;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CHUNK: rendering + Obsidian command registration
// ═══════════════════════════════════════════════════════════════════════════════

export function renderChainReport(r: ChainReport): string {
  const lines: string[] = [];
  lines.push(`COC CHAIN — ${r.verdict}`);
  if (r.obstacle) lines.push(`  obstacle:            ${r.obstacle}`);
  lines.push(`  rows / leaves:       ${r.rows_seen} / ${r.leaves} (${r.telemetry_skipped} telemetry skipped)`);
  const recipes = Object.entries(r.hash_recipes);
  lines.push(`  entry-hash recipes:  ${recipes.length ? recipes.map(([k, v]) => `${k}=${v}`).join("  ") : "none checked"}`);
  lines.push(`  hash failures:       ${r.hash_failures.length}`);
  for (const f of r.hash_failures.slice(0, 5)) lines.push(`      ${f.entry_hash.slice(0, 16)}… ${f.detail}`);
  lines.push(`  dangling parents:    ${r.dangling_parents.length}   (HARD FAIL — a parent that resolves nowhere is a hole)`);
  for (const d of r.dangling_parents.slice(0, 5)) lines.push(`      ${d.slice(0, 16)}…`);
  lines.push(`  poisoned links:      ${r.poisoned_links.length}   (HARD FAIL — broken-writer sentinel)`);
  lines.push(`  out of STORAGE order:${r.out_of_storage_order}   (NOT a break — shards are storage, the chain is order)`);
  lines.push(`  forks:               ${r.forks.length}`);
  lines.push(`  signatures:          ${r.signature_check.verdict} — ${r.signature_check.reason}`);
  return lines.join("\n");
}

export function registerCocVerify(plugin: Plugin, getSettings: () => McpBridgeSettings) {
  plugin.addCommand({
    id: "compasscrew-verify-coc-chain",
    name: "CompassCrew: verify chain of custody (reckon_coc verb=tail)",
    callback: async () => {
      const s = getSettings();
      const { token } = resolveToken(fs, path.join, vaultRoot(plugin.app as never), s.tokenPath);
      let rows: CocEntry[] = [];
      try {
        const data = await callReckonTool<Record<string, unknown>>({
          mcpUrl: s.mcpUrl, token, tool: TOOL.COC, args: { verb: "tail", n: 100 },
        });
        const raw = (data["entries"] ?? data["chain"] ?? data["result"]) as unknown;
        rows = Array.isArray(raw) ? (raw as CocEntry[]) : [];
        if (!Array.isArray(raw)) {
          new Notice(
            `COC CHAIN — UNMEASURED\nreckon_coc verb=tail answered, but no entries[] array was ` +
            `found in the response. Not clean, not broken: nothing was measurable.`, 12000);
          return;
        }
      } catch (e) {
        new Notice(`COC CHAIN — UNMEASURED\ncould not reach reckon_coc: ${(e as Error).message}`, 12000);
        return;
      }
      const report = await verifyChain(rows);
      const text = renderChainReport(report);
      console.log(text);
      new Notice(text, 20000);
    },
  });
}
