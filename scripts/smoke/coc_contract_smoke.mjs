#!/usr/bin/env node
/**
 * coc_contract_smoke.mjs — drive the real runtime behaviour of CompassCrew's reckon contract and
 * COC verifier. Not a compile check: every assertion here exercises the shipped code paths against
 * fixtures, including a live cross-check of the canonical hash against Python's `json.dumps`.
 *
 * WHY THIS EXISTS AS A SAVED ASSET, not a scratch script: the failure this whole modernization
 * fixed was a client whose tool names had drifted from the server's for three rebrands while
 * every UI surface reported the resulting 404 as "⚠". Nothing compared the two sides. This is the
 * thing that compares them, and it lives in the repo so the next hand can run it.
 *
 * Run:  node scripts/smoke/coc_contract_smoke.mjs
 *       node scripts/smoke/coc_contract_smoke.mjs --registry /path/to/REGISTRY.json
 *
 * With --registry pointing at a reckon checkout's `runtime/mcp-server/tools/REGISTRY.json`, the
 * suite additionally asserts that EVERY tool name this plugin sends is actually registered on the
 * server. Without it, that check reports UNMEASURED and names the reason rather than passing.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, existsSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, webcrypto } from "node:crypto";

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");

// ── tiny harness ──────────────────────────────────────────────────────────────
let pass = 0, fail = 0, unmeasured = 0;
const results = [];
function check(name, fn) {
  try {
    const r = fn();
    if (r === "UNMEASURED") { unmeasured++; results.push(["UNMEASURED", name, ""]); return; }
    pass++; results.push(["PASS", name, ""]);
  } catch (e) { fail++; results.push(["FAIL", name, e.message]); }
}
async function checkAsync(name, fn) {
  try {
    const r = await fn();
    if (r === "UNMEASURED") { unmeasured++; results.push(["UNMEASURED", name, ""]); return; }
    pass++; results.push(["PASS", name, ""]);
  } catch (e) { fail++; results.push(["FAIL", name, e.message]); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

// ── load the shipped modules by transpiling the TS sources ────────────────────
// esbuild is already a devDependency; bundling here means the smoke test exercises the SAME
// source the plugin ships, not a re-implementation of it.
const { default: esbuild } = await import("esbuild");
const tmp = mkdtempSync(join(tmpdir(), "compasscrew-smoke-"));
const entry = join(tmp, "entry.mjs");
writeFileSync(entry, `
export * from ${JSON.stringify(join(REPO, "src", "reckon-contract.ts"))};
export { proposeBearings } from ${JSON.stringify(join(REPO, "src", "design-folder.ts"))};
export * as coc from ${JSON.stringify(join(REPO, "src", "coc-verify.ts"))};
`);
// `obsidian` only exists inside the app. Stubbed so the PURE logic (contract resolution, COC
// verification, the bearing heuristic) can be driven headlessly. Anything that actually touches
// the Obsidian API is a UI concern and is not what this suite claims to cover.
const shim = join(tmp, "obsidian-shim.mjs");
writeFileSync(shim, `
export class Plugin {} export class Modal {} export class ItemView {} export class Notice {}
export class Setting {} export class PluginSettingTab {} export class TFile {} export class TFolder {}
export class App {} export class WorkspaceLeaf {} export class MarkdownView {} export class Editor {}
export const normalizePath = (p) => p;
`);
const outfile = join(tmp, "bundle.mjs");
await esbuild.build({
  entryPoints: [entry], bundle: true, format: "esm", platform: "node", outfile,
  external: ["fs", "path", "crypto", "child_process", "os", "util"], logLevel: "silent",
  alias: { obsidian: shim },
});
const mod = await import("file://" + outfile);
const { coc } = mod;

// ═══════════════════════════════════════════════════════════════════════════════
// 1. WIRE CONTRACT — every tool name we send exists on the server
// ═══════════════════════════════════════════════════════════════════════════════

const registryArg = process.argv.indexOf("--registry");
//: Auto-discovery is a CONVENIENCE, never a substitute: if no registry is found the check
//: reports UNMEASURED and names the reason rather than quietly passing.
const REGISTRY_SEARCH = [
  process.env.RECKON_REGISTRY,
  join(REPO, "..", "reckon", "runtime", "mcp-server", "tools", "REGISTRY.json"),
  join(process.env.HOME || "", "reckon", "runtime", "mcp-server", "tools", "REGISTRY.json"),
].filter(Boolean);
const registryPath = registryArg > -1
  ? process.argv[registryArg + 1]
  : REGISTRY_SEARCH.find((p) => existsSync(p)) ?? null;

check("every TOOL name uses the reckon_ wire prefix (not a client-side rebrand)", () => {
  for (const [k, v] of Object.entries(mod.TOOL)) {
    assert(v.startsWith("reckon_"), `TOOL.${k} = "${v}" — the wire is reckon, whatever the product is called`);
  }
});

check("CONTRACT_CALLS only reference names declared in TOOL", () => {
  const known = new Set(Object.values(mod.TOOL));
  for (const c of mod.CONTRACT_CALLS) assert(known.has(c.tool), `${c.tool} (${c.used_by}) is not in TOOL`);
});

check("every tool this plugin calls is registered on the reckon MCP server", () => {
  if (!registryPath || !existsSync(registryPath)) return "UNMEASURED";
  const reg = JSON.parse(readFileSync(registryPath, "utf8"));
  const registered = new Set(reg.tools.map((t) => t.name));
  const missing = mod.CONTRACT_CALLS.map((c) => c.tool).filter((t) => !registered.has(t));
  assert(missing.length === 0, `not registered on the server: ${[...new Set(missing)].join(", ")}`);
});

check("no deprecated credential env name is ever READ as a credential", () => {
  const env = { RECKON_SPAWN_KEY: "deadbeef".repeat(8) };
  const r = mod.resolveSpawnIdentity(env);
  assert(r.verdict === "FAIL", `RECKON_SPAWN_KEY must FAIL, got ${r.verdict}`);
  assert(r.spawnId === null, "a deprecated credential must never yield a usable identity");
  assert(!r.detail.includes("deadbeef"), "the refusal must not echo the secret it refused");
});

check("a retired bearer token is refused BY NAME, not silently ignored", () => {
  const r = mod.resolveSpawnIdentity({ RECKON_SPAWN_TOKEN: "x" });
  assert(r.verdict === "FAIL" && r.detail.includes("RECKON_SPAWN_TOKEN"), "refusal must name the credential");
});

check("a public RECKON_SPAWN_ID passes; an empty environment is UNMEASURED, not clean", () => {
  assert(mod.resolveSpawnIdentity({ RECKON_SPAWN_ID: "W2-abc" }).verdict === "PASS", "public label must PASS");
  const none = mod.resolveSpawnIdentity({});
  assert(none.verdict === "UNMEASURED", `absent must be UNMEASURED, got ${none.verdict}`);
});

check("legacy token filenames still resolve; a fresh vault falls back to the demo bearer", () => {
  const fakeFs = {
    existsSync: (p) => p.endsWith(".swarmy-token"),
    readFileSync: (p) => { if (p.endsWith(".swarmy-token")) return "legacy-tok\n"; throw new Error("ENOENT"); },
  };
  const got = mod.resolveToken(fakeFs, join, "/vault", ".compasscrew-token");
  assert(got.token === "legacy-tok" && got.source === ".swarmy-token", `got ${JSON.stringify(got)}`);
  const empty = mod.resolveToken({ existsSync: () => false, readFileSync: () => { throw new Error("ENOENT"); } }, join, "/v", ".compasscrew-token");
  assert(empty.isDemo && empty.token === mod.DEMO_BEARER, "a fresh vault must land on the demo bearer");
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. CANONICAL HASH — cross-checked against real Python json.dumps
// ═══════════════════════════════════════════════════════════════════════════════

const HASH_FIXTURES = [
  { a: 1, b: "two" },
  { z: 1, a: 2, m: { y: 1, b: [3, 2, 1] } },
  { unicode: "café — naïve ☃", nested: { "ünïcödé key": "→" } },
  { escapes: 'quote " backslash \\ newline \n tab \t' },
  { empty: {}, arr: [], nul: null, t: true, f: false },
  { entry_hash: "ignored-here", operation: "commit", ts: "2026-08-22T00:00:00Z" },
];

function pythonCanonical(obj) {
  return execFileSync("python3", ["-c",
    "import json,sys;print(json.dumps(json.loads(sys.stdin.read()),sort_keys=True,separators=(',',':')))",
  ], { input: JSON.stringify(obj), encoding: "utf8" }).trimEnd();
}

check("pyCanonicalJson matches python json.dumps(sort_keys=True, separators=(',',':')) exactly", () => {
  let havePython = true;
  try { execFileSync("python3", ["-c", "pass"]); } catch { havePython = false; }
  if (!havePython) return "UNMEASURED";
  for (const fx of HASH_FIXTURES) {
    const js = coc.pyCanonicalJson(fx);
    const py = pythonCanonical(fx);
    assert(js === py, `\n  js: ${js}\n  py: ${py}`);
  }
});

await checkAsync("verifyEntryHash accepts the CURRENT recipe and names it", async () => {
  const body = { operation: "commit", address: "a.b.c", prev_entry_hash: "genesis" };
  const h = createHash("sha256").update(coc.pyCanonicalJson(body)).digest("hex");
  const leaf = { ...body, entry_hash: h, signature: "ed25519:zzz", pq_signature: "mldsa:qqq" };
  const r = await coc.verifyEntryHash(leaf);
  assert(r.ok && r.recipe === "current", `got ${JSON.stringify(r)}`);
});

await checkAsync("verifyEntryHash accepts the LEGACY recipe under its OWN name, never as 'current'", async () => {
  // Pre-2026-08-03 leaves hashed WITH pq_signature inside the body.
  const body = { operation: "commit", pq_signature: "mldsa:qqq" };
  const h = createHash("sha256").update(coc.pyCanonicalJson(body)).digest("hex");
  const leaf = { ...body, entry_hash: h, signature: "ed25519:zzz" };
  const r = await coc.verifyEntryHash(leaf);
  assert(r.ok && r.recipe === "legacy-pq-in-body", `got ${JSON.stringify(r)} — a recipe boundary must stay countable`);
});

await checkAsync("a TAMPERED leaf matches no recipe and says so", async () => {
  const r = await coc.verifyEntryHash({ operation: "commit", entry_hash: "0".repeat(64) });
  assert(!r.ok && r.recipe === null, "a forged hash must not verify under any recipe");
  assert(r.detail.includes("no known hash recipe"), `detail must name what was tried: ${r.detail}`);
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. CHAIN VERIFICATION — reachability, not adjacency
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Build a leaf whose `entry_hash` is a REAL canonical hash of its own body. Fixtures with fake
 * hashes would fail hash recomputation and mask whatever the test actually meant to assert —
 * a green (or red) for the wrong reason is the failure mode this whole suite exists to prevent.
 */
const L = (label, prev, extra = {}) => {
  const body = { operation: "x", label, prev_entry_hash: prev, ...extra };
  return { ...body, entry_hash: createHash("sha256").update(coc.pyCanonicalJson(body)).digest("hex") };
};
const H = (leaf) => leaf.entry_hash;

await checkAsync("a chain stored OUT OF ORDER still PASSes — shards are storage, the chain is order", async () => {
  // The exact shape the 2026-08-05 measurement covers: link order != file order.
  const a = L("a", "genesis"); const b = L("b", H(a)); const c = L("c", H(b));
  const rows = [c, a, b];
  const r = await coc.verifyChain(rows);
  assert(r.verdict === "PASS", `adjacency thinking would FAIL this; got ${r.verdict} (${JSON.stringify(r.dangling_parents)})`);
  assert(r.out_of_storage_order > 0, "out-of-order storage must still be REPORTED under its own name");
});

await checkAsync("a parent that resolves NOWHERE is a HARD FAIL — the check with teeth", async () => {
  const r = await coc.verifyChain([L("a", "genesis"), L("b", "nonexistent-parent")]);
  assert(r.verdict === "FAIL" && r.dangling_parents.includes("nonexistent-parent"), JSON.stringify(r));
});

await checkAsync("a broken-writer sentinel ('lock-timeout') is a FAIL, not a genesis", async () => {
  const r = await coc.verifyChain([L("a", "genesis"), L("b", "lock-timeout")]);
  assert(r.verdict === "FAIL" && r.poisoned_links.length === 1, JSON.stringify(r));
});

await checkAsync("historical link ALIASES resolve — a partial alias list once hid 26 real entries", async () => {
  const rows = [
    { entry_sha: "aa", prev_entry_sha: "genesis", operation: "x" },
    { chain_hash: "bb", prev_chain_hash: "aa", operation: "x" },
    { hash: "cc", previous_hash: "bb", operation: "x" },
  ];
  const r = await coc.verifyChain(rows);
  assert(r.leaves === 3, `all three aliased rows must be seen as leaves, got ${r.leaves}`);
  assert(r.dangling_parents.length === 0, `aliases must resolve: ${JSON.stringify(r.dangling_parents)}`);
});

await checkAsync("telemetry rows are SKIPPED, and an all-telemetry input is UNMEASURED not PASS", async () => {
  const r = await coc.verifyChain([{ event: "tool_call", token_est: 12 }, { event: "x" }]);
  assert(r.verdict === "UNMEASURED", `got ${r.verdict} — no chain present is not a clean chain`);
  assert(r.obstacle && r.obstacle.includes("telemetry"), "the obstacle must be NAMED");
});

await checkAsync("an EMPTY response is UNMEASURED with the obstacle named, never PASS", async () => {
  const r = await coc.verifyChain([]);
  assert(r.verdict === "UNMEASURED" && r.obstacle, JSON.stringify(r));
});

await checkAsync("a FORK (two leaves claiming one parent) is detected on purpose", async () => {
  const a = L("a", "genesis");
  const r = await coc.verifyChain([a, L("b", H(a)), L("c", H(a))]);
  assert(r.forks.length === 1 && r.forks[0].parent === H(a), JSON.stringify(r.forks));
});

await checkAsync("signature verification reports UNMEASURED with its reason, never a silent pass", async () => {
  const r = await coc.verifyChain([L("a", "genesis")]);
  assert(r.signature_check.verdict === "UNMEASURED" && r.signature_check.reason.length > 40, JSON.stringify(r.signature_check));
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. LOCAL BEARING HEURISTIC — the feature that used to call a verb that never existed
// ═══════════════════════════════════════════════════════════════════════════════

const note = (basename, outLinks) => ({ file: { basename }, excerpt: "", outLinks });

check("mutual wikilinks propose E (peers) in both directions", () => {
  const p = mod.proposeBearings([note("A", ["B"]), note("B", ["A"])]);
  const e = p.filter((x) => x.bearing === "E");
  assert(e.length === 2, `expected 2 E proposals, got ${JSON.stringify(p)}`);
});

check("a one-way wikilink proposes N upstream and S downstream — the reverse flow", () => {
  const p = mod.proposeBearings([note("A", ["B"]), note("B", [])]);
  assert(p.some((x) => x.note === "A" && x.bearing === "N" && x.target === "B"), "forward: A→N→B");
  assert(p.some((x) => x.note === "B" && x.bearing === "S" && x.target === "A"), "reverse: B→S→A");
});

check("a genuine hub proposes W; a tie proposes none (a hub everyone ties for is not a hub)", () => {
  const hub = mod.proposeBearings([note("A", ["H"]), note("B", ["H"]), note("C", ["H"]), note("H", [])]);
  assert(hub.some((x) => x.bearing === "W" && x.target === "H"), "3 inbound must anchor W");
  const tie = mod.proposeBearings([note("A", ["B"]), note("B", ["A"])]);
  assert(!tie.some((x) => x.bearing === "W"), "a 1-1 tie must not fabricate an anchor");
});

check("self-links and links outside the folder are ignored", () => {
  const p = mod.proposeBearings([note("A", ["A", "Elsewhere"])]);
  assert(p.length === 0, `expected no proposals, got ${JSON.stringify(p)}`);
});

// ── report ────────────────────────────────────────────────────────────────────
rmSync(tmp, { recursive: true, force: true });
const W = Math.max(...results.map((r) => r[1].length));
for (const [v, name, detail] of results) {
  console.log(`${v.padEnd(11)} ${name.padEnd(W)}${detail ? "\n              → " + detail : ""}`);
}
console.log(`\n${pass} PASS · ${fail} FAIL · ${unmeasured} UNMEASURED`);
if (unmeasured > 0) console.log("UNMEASURED is not a pass. Re-run with --registry <reckon>/runtime/mcp-server/tools/REGISTRY.json and python3 available.");
process.exit(fail === 0 ? 0 : 1);
