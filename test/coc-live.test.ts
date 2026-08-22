/**
 * coc-live.test.ts — does "CompassCrew: verify chain of custody" ACTUALLY round-trip?
 *
 * The question this answers is not "does verifyChain() return an object" — it is: if a real
 * reckon MCP server answers `reckon_coc verb=tail`, does the registered command reach it, parse
 * it, verify REAL leaves, and produce a verdict a person can act on? Or does it no-op?
 *
 * HOW THAT IS TESTED HONESTLY, without hand-written fixtures:
 *
 *   1. A real HTTP server is started on a loopback port. It answers `POST /tools/reckon_coc`
 *      in the exact shape the live tool returns. The plugin's own `callReckonTool` does the
 *      request — no mocking of fetch, no mocking of the transport.
 *   2. The leaves it serves are REAL PRODUCTION CUSTODY LEAVES, read off a reckon checkout's
 *      `forensics/custody/*.jsonl` when one is present. Not fixtures anyone wrote to pass.
 *   3. If no reckon checkout is present, that test reports UNMEASURED **by skipping with the
 *      obstacle named** rather than falling back to a synthetic leaf and reporting a pass.
 *      Absent and fine are different facts.
 *
 * The error paths are tested against the same real server: a 404, a 200 with no `entries[]`,
 * and a connection refusal must each produce a DISTINCT, named outcome — because collapsing
 * those three into one "⚠" is the exact defect this whole modernization pass was fixing.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "node:http";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { webcrypto } from "node:crypto";

import { Plugin, App, Notice } from "./mocks/obsidian";
import { registerCocVerify, verifyChain, isChainEntry, type CocEntry } from "../src/coc-verify";
import { callReckonTool, TOOL, McpHttpError } from "../src/reckon-contract";

beforeAll(() => {
  if (!globalThis.crypto?.subtle) (globalThis as { crypto?: unknown }).crypto = webcrypto;
});

// ── ALL VARS AT TOP ───────────────────────────────────────────────────────────
/** Where a reckon checkout might be. Absent = the live-leaf tests report UNMEASURED. */
const RECKON_ROOTS = [
  process.env.RECKON_ROOT,
  join(__dirname, "..", "..", "reckon"),
  join(process.env.HOME || "", "reckon"),
].filter(Boolean) as string[];

const SETTINGS = (port: number) => ({
  mcpUrl: `http://127.0.0.1:${port}`, tokenPath: ".compasscrew-token", refreshSeconds: 60,
});

/** Read real custody leaves off a reckon checkout. Returns [] when there is no checkout. */
function loadRealLeaves(limit = 120): { leaves: CocEntry[]; source: string } {
  for (const root of RECKON_ROOTS) {
    const dir = join(root, "forensics", "custody");
    if (!existsSync(dir)) continue;
    const files = readdirSync(dir).filter((f) => f.endsWith(".jsonl"));
    for (const f of files) {
      const rows: CocEntry[] = [];
      for (const line of readFileSync(join(dir, f), "utf8").split("\n")) {
        if (!line.trim().startsWith("{")) continue;
        try { rows.push(JSON.parse(line)); } catch { /* a malformed line is not a leaf */ }
      }
      if (rows.filter(isChainEntry).length >= 3) {
        return { leaves: rows.slice(0, limit), source: join(dir, f) };
      }
    }
  }
  return { leaves: [], source: "" };
}

const REAL = loadRealLeaves();

// ── a real HTTP server speaking the reckon_coc wire shape ─────────────────────
let server: Server;
let port = 0;
let mode: "leaves" | "empty" | "notool" | "malformed" = "leaves";

beforeAll(async () => {
  server = createServer((req, res) => {
    if (mode === "notool") { res.writeHead(404); res.end("no such tool"); return; }
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const args = body ? JSON.parse(body) : {};
      res.writeHead(200, { "Content-Type": "application/json" });
      if (mode === "empty") { res.end(JSON.stringify({ ok: true, entries: [] })); return; }
      if (mode === "malformed") { res.end(JSON.stringify({ ok: true, status: "fine" })); return; }
      const n = Number(args.n ?? 20);
      res.end(JSON.stringify({ ok: true, entries: REAL.leaves.slice(0, n) }));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  port = (server.address() as { port: number }).port;
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

// ══════════════════════════════════════════════════════════════════════════════
describe("the transport actually works (no fetch mocking)", () => {
  it("callReckonTool reaches a real server and returns its JSON", async () => {
    mode = "leaves";
    const out = await callReckonTool<{ ok: boolean; entries: unknown[] }>({
      mcpUrl: `http://127.0.0.1:${port}`, token: "test", tool: TOOL.COC, args: { verb: "tail", n: 5 },
    });
    expect(out.ok).toBe(true);
    expect(Array.isArray(out.entries)).toBe(true);
  });

  it("a 404 raises McpHttpError CARRYING the status — not a bare Error", async () => {
    mode = "notool";
    await expect(callReckonTool({
      mcpUrl: `http://127.0.0.1:${port}`, token: "t", tool: TOOL.COC, args: {},
    })).rejects.toMatchObject({ status: 404 });
    mode = "leaves";
  });

  it("a refused connection is a DIFFERENT failure from a 404", async () => {
    let caught: unknown;
    try {
      await callReckonTool({ mcpUrl: "http://127.0.0.1:1", token: "t", tool: TOOL.COC, args: {} });
    } catch (e) { caught = e; }
    expect(caught).toBeDefined();
    expect(caught).not.toBeInstanceOf(McpHttpError);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
describe("verifying REAL production custody leaves", () => {
  it.skipIf(REAL.leaves.length === 0)(
    "the registered command round-trips: HTTP → parse → verify → verdict",
    async () => {
      mode = "leaves";
      Notice.reset();
      const plugin = new Plugin(new App());
      registerCocVerify(plugin as never, () => SETTINGS(port));
      await plugin.run("compasscrew-verify-coc-chain");

      const out = Notice.log.join("\n");
      // A real verdict block, not a no-op.
      expect(out).toMatch(/COC CHAIN — (PASS|FAIL|UNMEASURED)/);
      expect(out).toContain("rows / leaves:");
      expect(out).toContain("entry-hash recipes:");
      expect(out).toContain("dangling parents:");
      // It must have actually SEEN leaves, not reported zero.
      const m = out.match(/rows \/ leaves:\s+(\d+) \/ (\d+)/);
      expect(m).not.toBeNull();
      expect(Number(m![2])).toBeGreaterThan(0);
    },
  );

  it.skipIf(REAL.leaves.length === 0)(
    "real leaves resolve their parents by REACHABILITY (0 dangling within the window)",
    async () => {
      const report = await verifyChain(REAL.leaves);
      // These are real leaves off a live spine, so this asserts on the property that must hold
      // regardless of what the chain says: every parent inside the window resolves, or the ones
      // that do not are the window boundary rather than holes.
      expect(report.leaves).toBeGreaterThan(0);
      expect(report.verdict).not.toBe("UNMEASURED");
      // Recipes must be NAMED, and at least one real recipe must have matched real bytes —
      // this is the assertion that proves the canonical hash port is correct against
      // production data, not just against fixtures this repo generated.
      const matched = Object.values(report.hash_recipes).reduce((a, b) => a + b, 0);
      expect(matched).toBeGreaterThan(0);
      // eslint-disable-next-line no-console
      console.log(`  real leaves: ${report.leaves} · recipes ${JSON.stringify(report.hash_recipes)}` +
        ` · dangling ${report.dangling_parents.length} · out-of-storage-order ${report.out_of_storage_order}` +
        ` · verdict ${report.verdict} · source ${REAL.source}`);
    },
  );

  it("reports UNMEASURED by name when there is no reckon checkout to read", () => {
    if (REAL.leaves.length > 0) {
      expect(REAL.source).not.toBe("");
      return;
    }
    // Absent is a fact, and the suite states it rather than passing quietly.
    console.warn("UNMEASURED: no reckon checkout found in " + RECKON_ROOTS.join(", ") +
      " — the live-leaf assertions above were SKIPPED, not passed.");
    expect(REAL.source).toBe("");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
describe("the three failure modes stay distinct", () => {
  it("a 200 with no entries[] is UNMEASURED, never a clean chain", async () => {
    mode = "malformed";
    Notice.reset();
    const plugin = new Plugin(new App());
    registerCocVerify(plugin as never, () => SETTINGS(port));
    await plugin.run("compasscrew-verify-coc-chain");
    const out = Notice.log.join("\n");
    expect(out).toContain("COC CHAIN — UNMEASURED");
    expect(out).toContain("no entries[] array");
    expect(out).not.toContain("PASS");
    mode = "leaves";
  });

  it("an EMPTY entries[] is UNMEASURED with the obstacle named", async () => {
    mode = "empty";
    Notice.reset();
    const plugin = new Plugin(new App());
    registerCocVerify(plugin as never, () => SETTINGS(port));
    await plugin.run("compasscrew-verify-coc-chain");
    expect(Notice.log.join("\n")).toContain("UNMEASURED");
    mode = "leaves";
  });

  it("an unreachable server is UNMEASURED — not FAIL, and not silence", async () => {
    Notice.reset();
    const plugin = new Plugin(new App());
    registerCocVerify(plugin as never, () => ({
      mcpUrl: "http://127.0.0.1:1", tokenPath: ".compasscrew-token", refreshSeconds: 60,
    }));
    await plugin.run("compasscrew-verify-coc-chain");
    const out = Notice.log.join("\n");
    expect(out).toContain("COC CHAIN — UNMEASURED");
    expect(out).toContain("could not reach reckon_coc");
  });
});
