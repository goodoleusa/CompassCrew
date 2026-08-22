import { App, Modal, Notice, Plugin, TFile, TFolder } from "obsidian";
import * as fs from "fs";
import * as path from "path";
import { BEARING_COLOR, BEARING_LABEL, BEARINGS, Bearing } from "./bearings";

/**
 * Excalidraw soft-dependency check — invoked at command time, not load time.
 * Returns true if Excalidraw is present and usable; false if absent (after
 * showing the user a graceful "install Excalidraw" prompt + Notice). Caller
 * should early-return when this returns false.
 */
function ensureExcalidrawAvailable(app: App): boolean {
  const plug = (app as any).plugins?.plugins?.["obsidian-excalidraw-plugin"];
  if (plug) return true;
  new Notice(
    "Bearing topology design needs Excalidraw — install it from Community Plugins to continue.",
    10000
  );
  // Open a lightweight modal pointing at the community plugins page so the
  // user has a clickable affordance, not just a transient toast.
  class InstallExcalidrawModal extends Modal {
    onOpen() {
      const { contentEl } = this;
      contentEl.createEl("h2", { text: "Excalidraw required" });
      contentEl.createEl("p", {
        text: "Bearing topology design (pollinate / scan-and-propose / auto-layout) renders to Excalidraw canvases. Install the Excalidraw community plugin to enable these commands.",
      });
      const row = contentEl.createEl("div", { cls: "compasscrew-install-excalidraw-row" });
      row.style.cssText = "display:flex;gap:8px;margin-top:12px;";
      const btn = row.createEl("button", { text: "Open Community Plugins" });
      btn.onclick = () => {
        try {
          (this.app as any).setting?.open?.();
          (this.app as any).setting?.openTabById?.("community-plugins");
        } catch { /* fallback: do nothing */ }
        this.close();
      };
      const cancel = row.createEl("button", { text: "Not now" });
      cancel.onclick = () => this.close();
    }
    onClose() { this.contentEl.empty(); }
  }
  try { new InstallExcalidrawModal(app).open(); } catch { /* ignore */ }
  return false;
}

/**
 * design-folder.ts — "Point at any folder" experience.
 *
 * Three commands implementing the draw → AI → system loop for arbitrary folders:
 *
 *   1. `compasscrew: pollinate`
 *      Right-click (or active file's parent) → scan folder for notes →
 *      generate Excalidraw canvas with one box per note positioned by
 *      current implicit structure (folder depth = y, sibling order = x,
 *      existing wikilinks become arrows). User redraws topology, then
 *      runs commit-excalibrain-draft (existing command) to write
 *      NSEW frontmatter back to each note in the folder.
 *
 *      Status: WORKING (seed scene + open canvas).
 *
 *   2. `compasscrew: scan and propose bearings`
 *      Folder scan → LOCAL heuristic (mutual outlinks → E, directed outlinks → N/S pairs,
 *      hub note → W anchor). The proposals open in a review modal — the user accepts or
 *      rejects each; accepted ones write to frontmatter.
 *
 *      Status: WORKING, LOCAL (2026-08-22).
 *
 *      HISTORY, because the previous status line here was false and worth not repeating: this
 *      posted to MCP `<brand>_mission` verb=propose_bearings and claimed "MCP server tool live".
 *      The reckon `reckon_mission` dispatcher accepts exactly three verbs — `graph`, `add`,
 *      `complete` (runtime/mcp-server/tools/mission.py) — and has no `propose_bearings`. The
 *      call therefore returned `{ok:false, error:"unknown verb"}` with HTTP 200, which this
 *      code read as a successful response with zero proposals and reported as
 *      "proposed 0 bearings". A green that means "the feature does not exist".
 *
 *      Every input the heuristic needs (basenames, excerpts, sibling outlinks) is already
 *      gathered locally by `scanFolder`, so there was never anything for a server to add. It
 *      runs here now: no network, no token, no tier gate, and no way to report success for a
 *      verb nobody implements.
 *
 *   3. `compasscrew: auto-layout from frontmatter`
 *      Reads active Excalidraw note → re-positions bearing-rectangles
 *      using a deterministic layered/ordered-tree layout (N above,
 *      S below, E right, W left; sorted by label, evenly spaced).
 *      Non-bearing elements (sticky notes, text, freedraws) are never
 *      moved. Same input always yields the same output (no jitter,
 *      no physics). Tunables (BOX_W, H_GAP, V_GAP, LANE_OFFSET) live
 *      at the top of autoLayoutFromFrontmatter.
 *
 *      Status: WORKING (2026-05-19) — replaced quadrant-snap stub
 *      with full layered algorithm.
 */

// --- shared helpers ---------------------------------------------------------

function vaultRoot(app: App): string {
  return (app.vault.adapter as unknown as { basePath: string }).basePath;
}

interface FolderNote {
  file: TFile;
  excerpt: string;       // first 240 chars of body, frontmatter stripped
  outLinks: string[];    // wikilink targets that resolve to other notes in same folder
}

/** Scan a folder (non-recursive) for markdown notes and return excerpts + same-folder links. */
async function scanFolder(app: App, folder: TFolder): Promise<FolderNote[]> {
  const out: FolderNote[] = [];
  const siblings = new Set<string>();
  for (const c of folder.children) if (c instanceof TFile && c.extension === "md") siblings.add(c.basename);
  for (const c of folder.children) {
    if (!(c instanceof TFile) || c.extension !== "md") continue;
    const raw = await app.vault.cachedRead(c);
    const body = raw.replace(/^---\n[\s\S]*?\n---\n/, "");
    const excerpt = body.replace(/\s+/g, " ").trim().slice(0, 240);
    const linkRe = /\[\[([^\]|#]+)/g;
    const outLinks: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = linkRe.exec(body)) !== null) {
      const target = m[1].trim();
      if (siblings.has(target)) outLinks.push(target);
    }
    out.push({ file: c, excerpt, outLinks });
  }
  return out;
}

/** Get the folder to operate on: prefer explicit param, else active file's parent. */
function resolveTargetFolder(app: App, explicit?: TFolder): TFolder | null {
  if (explicit) return explicit;
  const active = app.workspace.getActiveFile();
  if (active && active.parent) return active.parent as TFolder;
  return null;
}

// --- Feature 1: pollinate (WORKING) --------------------------------

function buildSeedScene(notes: FolderNote[]): { elements: any[] } {
  const elements: any[] = [];
  const idOf: Record<string, string> = {};
  const cols = Math.max(1, Math.ceil(Math.sqrt(notes.length)));
  const cellW = 280;
  const cellH = 120;
  notes.forEach((n, i) => {
    const id = `n-${i}`;
    idOf[n.file.basename] = id;
    const x = (i % cols) * cellW;
    const y = Math.floor(i / cols) * cellH;
    elements.push({
      type: "rectangle",
      id,
      x, y, width: 220, height: 60,
      strokeColor: "#5A3C1E",
      backgroundColor: "transparent",
      strokeWidth: 2,
      roughness: 0,
      fillStyle: "solid",
      roundness: { type: 3 },
      label: { text: n.file.basename, fontSize: 18, fontFamily: 2 },
    });
  });
  // Existing same-folder wikilinks → un-colored arrows (user re-colors to bear them).
  notes.forEach((n) => {
    const from = idOf[n.file.basename];
    n.outLinks.forEach((tgt, j) => {
      const to = idOf[tgt];
      if (!from || !to) return;
      elements.push({
        type: "arrow",
        id: `a-${from}-${to}-${j}`,
        startBinding: { elementId: from },
        endBinding: { elementId: to },
        strokeColor: "#999999",
        strokeWidth: 1,
        roughness: 0,
      });
    });
  });
  return { elements };
}

async function pollinate(plugin: Plugin, folder?: TFolder) {
  if (!ensureExcalidrawAvailable(plugin.app)) return;
  const tgt = resolveTargetFolder(plugin.app, folder);
  if (!tgt) { new Notice("No folder context — open a note or right-click a folder."); return; }
  const notes = await scanFolder(plugin.app, tgt);
  if (notes.length === 0) { new Notice(`No markdown notes in ${tgt.path}.`); return; }

  const scene = buildSeedScene(notes);
  const root = vaultRoot(plugin.app);
  const date = new Date().toISOString().slice(0, 10);
  const dir = path.join(root, "00-SHARED", "Drafts", "FolderDesign", date);
  fs.mkdirSync(dir, { recursive: true });
  const safe = tgt.name.replace(/[^\w-]+/g, "_") || "root";
  const target = path.join(dir, `design-${safe}-${Date.now()}.excalidraw.md`);

  const body = [
    "---",
    "excalidraw-plugin: parsed",
    "tags: [excalidraw, compasscrew-draft, folder-design]",
    `design_for_folder: "${tgt.path}"`,
    `note_count: ${notes.length}`,
    `created: ${new Date().toISOString()}`,
    "---",
    "",
    "> [!brood] Design this folder — sketch the topology you want",
    `> ${notes.length} notes seeded from \`${tgt.path}\`. Existing wikilinks shown as gray arrows.`,
    "> Drag boxes into the four quadrants by bearing (color stroke to commit):",
    ...BEARINGS.map((b) => `> - <span style="color:${BEARING_COLOR[b]}">${BEARING_LABEL[b]}</span>`),
    "> Then run **CompassCrew: commit folder design → frontmatter** (re-uses ExcaliBrain commit pipeline per-note).",
    "",
    "# Excalidraw Data",
    "",
    "## Text Elements",
    "",
    "## Element Links",
    "",
    "## Embedded Files",
    "",
    "## Drawing",
    "```json",
    JSON.stringify({ type: "excalidraw", version: 2, source: "compasscrew-vault-plugin:design-folder", elements: scene.elements, appState: { gridSize: 20, viewBackgroundColor: "#FAF8F2" } }, null, 2),
    "```",
    "%%",
  ].join("\n");
  fs.writeFileSync(target, body, "utf8");
  const rel = path.relative(root, target).replace(/\\/g, "/");
  const tfile = plugin.app.vault.getAbstractFileByPath(rel);
  if (tfile instanceof TFile) {
    await plugin.app.workspace.getLeaf(true).openFile(tfile);
  }
  new Notice(`Designed folder ${tgt.name} with ${notes.length} notes. Sketch + commit.`, 8000);
}

// --- Feature 2: scan and propose bearings (STUB) ----------------------------

interface BearingProposal {
  note: string;        // basename
  bearing: Bearing;
  target: string;      // basename of the other side of the bearing
  rationale: string;
}

/**
 * The bearing heuristic, run locally over the folder scan. Pure and synchronous so it is
 * directly testable without an Obsidian app or a server — see `scripts/smoke/`.
 *
 *   MUTUAL link  (A→B and B→A)  → E, "same" — peers that reference each other.
 *   ONE-WAY link (A→B only)     → A gets N ("up") toward B; B gets S ("down") toward A.
 *                                 A note that cites another is downstream of it.
 *   HUB          (most inbound) → W, the folder's anchor, proposed for every other note.
 *
 * A note is never proposed a bearing to itself, and each (note, bearing, target) triple is
 * emitted at most once.
 */
export function proposeBearings(notes: FolderNote[]): BearingProposal[] {
  const names = new Set(notes.map((n) => n.file.basename));
  const links = new Map<string, Set<string>>();
  for (const n of notes) links.set(n.file.basename, new Set(n.outLinks.filter((l) => names.has(l) && l !== n.file.basename)));

  const inbound = new Map<string, number>();
  for (const targets of links.values()) for (const t of targets) inbound.set(t, (inbound.get(t) ?? 0) + 1);

  const out: BearingProposal[] = [];
  const seen = new Set<string>();
  const emit = (note: string, bearing: Bearing, target: string, rationale: string) => {
    if (note === target) return;
    const key = `${note}|${bearing}|${target}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ note, bearing, target, rationale });
  };

  for (const [note, targets] of links) {
    for (const target of targets) {
      if (links.get(target)?.has(note)) emit(note, "E", target, "mutual wikilink — peers");
      else {
        emit(note, "N", target, "one-way wikilink — this note cites its source");
        emit(target, "S", note, "cited by this note — downstream reader");
      }
    }
  }

  // The hub: the most-linked-to note in the folder, if anything links at all and it is not a tie
  // at 1. A "hub" every note ties for is not a hub, and proposing one would be noise.
  let hub: string | null = null, hubCount = 0, tied = false;
  for (const [name, count] of inbound) {
    if (count > hubCount) { hub = name; hubCount = count; tied = false; }
    else if (count === hubCount) tied = true;
  }
  if (hub && hubCount > 1 && !tied) {
    for (const n of notes) emit(n.file.basename, "W", hub, `folder anchor — ${hubCount} inbound links`);
  }
  return out;
}

class ProposalReviewModal extends Modal {
  constructor(app: App, private proposals: BearingProposal[], private onAccept: (accepted: BearingProposal[]) => void) {
    super(app);
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.addClass("compasscrew-proposal-modal");
    contentEl.createEl("h2", { text: "Proposed bearings — review" });
    if (this.proposals.length === 0) {
      contentEl.createEl("p", { text: "No proposals returned. (Check MCP connection / token, or the folder may have no inter-note wikilinks for the heuristic to chew on.)" });
      return;
    }
    const accepted: Set<number> = new Set(this.proposals.map((_, i) => i));
    const list = contentEl.createEl("div", { cls: "compasscrew-proposal-list" });
    this.proposals.forEach((p, i) => {
      const row = list.createEl("div", { cls: "compasscrew-proposal-row" });
      const cb = row.createEl("input", { type: "checkbox" }) as HTMLInputElement;
      cb.checked = true;
      cb.onchange = () => { if (cb.checked) accepted.add(i); else accepted.delete(i); };
      row.createEl("span", { text: ` [${p.bearing}] ${p.note} → ${p.target} — ${p.rationale}` });
    });
    const btn = contentEl.createEl("button", { text: "Apply accepted bearings" });
    btn.onclick = () => {
      this.onAccept(this.proposals.filter((_, i) => accepted.has(i)));
      this.close();
    };
  }
  onClose() { this.contentEl.empty(); }
}

async function scanAndProposeBearings(plugin: Plugin, folder?: TFolder) {
  if (!ensureExcalidrawAvailable(plugin.app)) return;
  const tgt = resolveTargetFolder(plugin.app, folder);
  if (!tgt) { new Notice("No folder context."); return; }
  const notes = await scanFolder(plugin.app, tgt);
  if (notes.length === 0) { new Notice(`No notes in ${tgt.path}.`); return; }

  const proposals = proposeBearings(notes);
  new Notice(
    proposals.length > 0
      ? `CompassCrew proposed ${proposals.length} bearings for ${tgt.name}.`
      : `No bearings proposed for ${tgt.name}: ${notes.length} note(s) scanned, no wikilinks ` +
        `between siblings to infer from. Nothing was wrong — there was nothing to measure.`,
    6000,
  );

  new ProposalReviewModal(plugin.app, proposals, async (accepted) => {
    let n = 0;
    for (const p of accepted) {
      const f = notes.find((nn) => nn.file.basename === p.note)?.file;
      if (!f) continue;
      await plugin.app.fileManager.processFrontMatter(f, (fm) => {
        const key = p.bearing === "N" ? "up" : p.bearing === "S" ? "down" : p.bearing === "E" ? "same" : "west";
        fm[key] = ([] as string[]).concat(fm[key] || [], p.target);
      });
      n++;
    }
    new Notice(`Applied ${n} bearing proposals.`, 6000);
  }).open();
}

// --- Feature 3: auto-layout from frontmatter (STUB algorithm) ---------------

async function autoLayoutFromFrontmatter(plugin: Plugin) {
  if (!ensureExcalidrawAvailable(plugin.app)) return;
  const file = plugin.app.workspace.getActiveFile();
  if (!file || file.extension !== "md") { new Notice("Open an Excalidraw note."); return; }
  const raw = await plugin.app.vault.read(file);
  const m = raw.match(/```json\n([\s\S]*?)\n```/);
  if (!m) { new Notice("No Excalidraw JSON block."); return; }
  let data: any;
  try { data = JSON.parse(m[1]); } catch { new Notice("Excalidraw JSON parse failed."); return; }
  const elements: any[] = data.elements ?? [];

  // LAYERED / ORDERED-TREE layout — replaces force-directed entirely.
  //
  // Goal: orderly, predictable, tree-like spatial structure that users
  // with strong spatial preference can read at a glance. No physics, no
  // jitter, no randomness — same input always yields the same output.
  //
  // Algorithm (deterministic Sugiyama-lite):
  //  1. Partition bearing-rectangles into four lanes by stroke color
  //     (N=above center, S=below, E=right, W=left).
  //  2. Within each lane, sort stably by current label text so identity
  //     is preserved across re-layouts (no shuffling).
  //  3. Place lane along its perpendicular axis with uniform spacing.
  //     N/S lanes spread horizontally so the lane reads left-to-right;
  //     E/W lanes spread vertically so the lane reads top-to-bottom.
  //  4. The "center" node (label starts with ◎) is anchored at origin.
  //  5. Non-bearing elements (sticky notes, text, freedraws, user
  //     annotations) are NEVER moved.
  //
  // Tunables — change here, no library to swap:
  const BOX_W = 220;
  const BOX_H = 60;
  const H_GAP = 60;   // horizontal gap between sibling boxes
  const V_GAP = 40;   // vertical gap between sibling boxes
  const LANE_OFFSET = 180; // distance from center to first lane row

  const lanes: Record<Bearing, any[]> = { N: [], S: [], E: [], W: [] };
  let centerEl: any | null = null;
  for (const el of elements) {
    if (el?.type !== "rectangle") continue;
    const lbl = el?.label?.text || "";
    if (lbl.startsWith("◎")) { centerEl = el; continue; }
    for (const b of BEARINGS) if (el.strokeColor === BEARING_COLOR[b]) lanes[b].push(el);
  }
  for (const b of BEARINGS) {
    lanes[b].sort((a, z) => String(a?.label?.text || "").localeCompare(String(z?.label?.text || "")));
  }

  if (centerEl) { centerEl.x = -BOX_W / 2; centerEl.y = -BOX_H / 2; }

  // N lane: spread horizontally above center
  const nWidth = lanes.N.length * BOX_W + Math.max(0, lanes.N.length - 1) * H_GAP;
  lanes.N.forEach((el, i) => {
    el.x = -nWidth / 2 + i * (BOX_W + H_GAP);
    el.y = -LANE_OFFSET - BOX_H;
  });
  // S lane: spread horizontally below
  const sWidth = lanes.S.length * BOX_W + Math.max(0, lanes.S.length - 1) * H_GAP;
  lanes.S.forEach((el, i) => {
    el.x = -sWidth / 2 + i * (BOX_W + H_GAP);
    el.y = LANE_OFFSET;
  });
  // E lane: spread vertically to the right
  const eHeight = lanes.E.length * BOX_H + Math.max(0, lanes.E.length - 1) * V_GAP;
  lanes.E.forEach((el, i) => {
    el.x = LANE_OFFSET + 40;
    el.y = -eHeight / 2 + i * (BOX_H + V_GAP);
  });
  // W lane: spread vertically to the left
  const wHeight = lanes.W.length * BOX_H + Math.max(0, lanes.W.length - 1) * V_GAP;
  lanes.W.forEach((el, i) => {
    el.x = -LANE_OFFSET - 40 - BOX_W;
    el.y = -wHeight / 2 + i * (BOX_H + V_GAP);
  });

  const newBlock = "```json\n" + JSON.stringify(data, null, 2) + "\n```";
  const next = raw.replace(/```json\n[\s\S]*?\n```/, newBlock);
  await plugin.app.vault.modify(file, next);
  const total = lanes.N.length + lanes.S.length + lanes.E.length + lanes.W.length;
  new Notice(`Auto-layout: ${total} bearing-rectangles snapped. (Stub: decorations untouched, no force-directed pass yet.)`, 8000);
}

// --- Registration -----------------------------------------------------------

export function registerDesignFolder(plugin: Plugin) {
  plugin.addCommand({
    id: "compasscrew-pollinate",
    name: "🐝 CompassCrew: pollinate (sketch + commit topology for any folder)",
    callback: () => pollinate(plugin),
  });

  plugin.addCommand({
    id: "compasscrew-scan-and-propose-bearings",
    name: "CompassCrew: scan folder and propose bearings (AI round-trip, review modal)",
    callback: () => scanAndProposeBearings(plugin),
  });

  plugin.addCommand({
    id: "compasscrew-auto-layout-from-frontmatter",
    name: "CompassCrew: auto-layout Excalidraw from frontmatter",
    callback: () => autoLayoutFromFrontmatter(plugin),
  });

  // File-menu entry: right-click any folder → run design pass.
  plugin.registerEvent(
    plugin.app.workspace.on("file-menu", (menu, fileOrFolder) => {
      if (!(fileOrFolder instanceof TFolder)) return;
      menu.addItem((item) =>
        item
          .setTitle("🐝 CompassCrew: pollinate")
          .setIcon("compass")
          .onClick(() => pollinate(plugin, fileOrFolder))
      );
      menu.addItem((item) =>
        item
          .setTitle("CompassCrew: scan & propose bearings")
          .setIcon("wand-2")
          .onClick(() => scanAndProposeBearings(plugin, fileOrFolder))
      );
    })
  );
}
