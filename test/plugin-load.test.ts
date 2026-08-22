/**
 * plugin-load.test.ts — the full-surface smoke pass.
 *
 * Three questions, each of which has silently been "no" at some point in this plugin's history:
 *
 *   1. Does every register* module LOAD and REGISTER without throwing? (An exception during
 *      `onload` in Obsidian disables the plugin with a console error most users never see.)
 *   2. Are the commands the docs promise ACTUALLY registered, under the ids the docs name?
 *   3. Does a blueprint RE-RENDER into a note without eating the prose around it?
 *
 * (3) is the one worth having a test for. Re-rendering is the feature — a template you can only
 * stamp into a blank note is a snippet — and the marker splice is the only thing standing between
 * "your section updated" and "your week of writing is gone".
 */

import { describe, it, expect, beforeEach } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import { Plugin, App, Notice } from "./mocks/obsidian";
import { renderString } from "../src/vendor/micro-njk";
import { mergeRendered, blueprintSectionName } from "../src/blueprint-engine";
import { registerBlueprintEngine } from "../src/blueprint-engine";
import { registerMcpBridge, VIEW_TYPE_COMPASSCREW_LIVE } from "../src/mcp-bridge";
import { registerTokenGrabber } from "../src/token-grabber";
import { registerCocVerify } from "../src/coc-verify";
import { registerCocIdentity } from "../src/coc-identity";
import { registerTrailRefs } from "../src/trail-refs";
import { registerBearings } from "./helpers/optional";

const REPO = join(__dirname, "..");
const SETTINGS = { mcpUrl: "http://127.0.0.1:1", tokenPath: ".compasscrew-token", refreshSeconds: 60 };

// ── Commands the README and TUTORIAL promise. If a doc names it, it must exist. ──
const PROMISED_COMMAND_IDS = [
  "compasscrew-open-live-pane",
  "compasscrew-token-grab",
  "compasscrew-token-rotate",
  "compasscrew-token-fingerprint",
  "compasscrew-purge-legacy-signing-key",
  "compasscrew-verify-coc-chain",
  "compasscrew-create-signing-identity",
  "compasscrew-register-public-key",
  "compasscrew-identity-status",
];

function loadAll(): Plugin {
  const plugin = new Plugin(new App());
  registerMcpBridge(plugin as never, () => SETTINGS);
  registerTokenGrabber(plugin as never, () => SETTINGS);
  registerCocVerify(plugin as never, () => SETTINGS);
  registerCocIdentity(plugin as never, () => SETTINGS);
  registerBlueprintEngine(plugin as never, () => ({ blueprintsDir: "Blueprints" }));
  registerTrailRefs(plugin as never);
  registerBearings(plugin);
  return plugin;
}

describe("the plugin loads", () => {
  beforeEach(() => Notice.reset());

  it("every register* module runs without throwing", () => {
    expect(() => loadAll()).not.toThrow();
  });

  it("registers the Live view type", () => {
    expect(loadAll().views).toContain(VIEW_TYPE_COMPASSCREW_LIVE);
  });

  it("registers the auth protocol handler exactly once", () => {
    const p = loadAll();
    expect(p.protocolHandlers.filter((h) => h === "swarmy-token-callback")).toHaveLength(1);
  });

  it("registers every command the docs promise", () => {
    const ids = new Set(loadAll().commands.map((c) => c.id));
    const missing = PROMISED_COMMAND_IDS.filter((id) => !ids.has(id));
    expect(missing, `docs promise commands that do not exist: ${missing.join(", ")}`).toEqual([]);
  });

  it("registers no DUPLICATE command ids (a dupe silently shadows one of them)", () => {
    const ids = loadAll().commands.map((c) => c.id);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect([...new Set(dupes)]).toEqual([]);
  });

  it("every command name is user-facing prose, not an internal id", () => {
    for (const c of loadAll().commands) {
      expect(c.name, `command ${c.id} has no name`).toBeTruthy();
      expect(c.name.startsWith("CompassCrew:"), `"${c.name}" is not namespaced`).toBe(true);
    }
  });

  it("layout-ready hooks run without throwing (the legacy-key sweep lives here)", () => {
    const p = loadAll();
    expect(() => p.app.workspace._fireLayoutReady()).not.toThrow();
  });
});

describe("blueprints round-trip", () => {
  it("micro-njk renders variables, filters, conditionals and loops", () => {
    const out = renderString(
      "# {{ title | upper }}\n{% if show %}visible{% endif %}\n{% for t in tags %}- {{ t }}\n{% endfor %}",
      { title: "finding", show: true, tags: ["a", "b"] },
    );
    expect(out).toContain("# FINDING");
    expect(out).toContain("visible");
    expect(out).toContain("- a");
    expect(out).toContain("- b");
  });

  it("a missing variable does not blow up the whole render", () => {
    expect(() => renderString("{{ nope }} tail", {})).not.toThrow();
    expect(renderString("{{ nope }} tail", {})).toContain("tail");
  });

  it("THE LOAD-BEARING ONE: re-rendering replaces the block and keeps the prose around it", () => {
    const first = mergeRendered("# My note\n\nMy own paragraph.\n", "Finding", "v1 content");
    expect(first).toContain("My own paragraph.");
    expect(first).toContain("v1 content");

    const withMore = first + "\n\nA paragraph I wrote AFTER the first render.\n";
    const second = mergeRendered(withMore, "Finding", "v2 content");

    expect(second).toContain("v2 content");
    expect(second).not.toContain("v1 content");         // the block updated
    expect(second).toContain("My own paragraph.");       // prose before survived
    expect(second).toContain("A paragraph I wrote AFTER the first render."); // and after
  });

  it("two different blueprints in one note do not clobber each other", () => {
    let note = mergeRendered("# Note\n", "Finding", "finding body");
    note = mergeRendered(note, "Timeline", "timeline body");
    note = mergeRendered(note, "Finding", "finding body v2");
    expect(note).toContain("finding body v2");
    expect(note).toContain("timeline body");
    expect(note).not.toContain("finding body\n");
  });

  it("section names come from the filename, so markers are stable across renders", () => {
    expect(blueprintSectionName("/x/y/Finding-Review.njk")).toBe("Finding-Review");
  });
});

describe("the shipped blueprints are real", () => {
  const dir = join(REPO, "Blueprints");

  it("ships a substantial blueprint library", () => {
    const njk = readdirSync(dir).filter((f) => f.endsWith(".njk") && !f.startsWith("_"));
    expect(njk.length).toBeGreaterThanOrEqual(80);
  });

  it("EVERY shipped blueprint renders without throwing on an empty context", () => {
    const njk = readdirSync(dir).filter((f) => f.endsWith(".njk") && !f.startsWith("_"));
    const broken: string[] = [];
    for (const f of njk) {
      try { renderString(readFileSync(join(dir, f), "utf8"), {}); }
      catch (e) { broken.push(`${f}: ${(e as Error).message}`); }
    }
    expect(broken, `blueprints that throw on render:\n${broken.join("\n")}`).toEqual([]);
  });

  it("ships the LaTeX header the PDF pipeline claims to inject", () => {
    // This one is here because the header was missing for two rebrands while every export
    // reported success. A claim in a README is not a shipped file.
    const header = join(REPO, "assets", "print-ready-header.tex");
    expect(existsSync(header), "assets/print-ready-header.tex is missing").toBe(true);
    const tex = readFileSync(header, "utf8");
    expect(tex).toContain("floatplacement");   // floats pinned [H]
    expect(tex).toContain("needspace");        // no orphaned headings
  });

  it("ships the byte-identical vendored corpus_pdf_lite", () => {
    expect(existsSync(join(REPO, "scripts", "corpus_pdf_lite.py"))).toBe(true);
  });
});
