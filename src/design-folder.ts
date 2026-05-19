import { App, Modal, Notice, Plugin, TFile, TFolder } from "obsidian";
import * as fs from "fs";
import * as path from "path";
import { BEARING_COLOR, BEARING_LABEL, BEARINGS, Bearing } from "./bearings";

/**
 * design-folder.ts — "Point at any folder" experience.
 *
 * Three commands implementing the draw → AI → system loop for arbitrary folders:
 *
 *   1. `faerie: design this folder`
 *      Right-click (or active file's parent) → scan folder for notes →
 *      generate Excalidraw canvas with one box per note positioned by
 *      current implicit structure (folder depth = y, sibling order = x,
 *      existing wikilinks become arrows). User redraws topology, then
 *      runs commit-excalibrain-draft (existing command) to write
 *      NSEW frontmatter back to each note in the folder.
 *
 *      Status: WORKING (seed scene + open canvas).
 *
 *   2. `faerie: scan and propose bearings`
 *      Same folder scan, but instead of opening a canvas, POSTs the
 *      folder's note list + brief content excerpts to MCP `faerie_chat`
 *      with a structured "propose bearings" prompt. The reply (JSON
 *      proposals per note) opens in a review modal — accept/reject each,
 *      accepted ones write to frontmatter.
 *
 *      Status: STUB (modal + MCP call shape wired; prompt template TBD,
 *      so the proposal call is currently a no-op that surfaces a Notice).
 *
 *   3. `faerie: auto-layout from frontmatter`
 *      Reads active Excalidraw note → re-positions boxes whose labels
 *      match current frontmatter bearings, leaving user decorations
 *      (sticky notes, annotations) untouched. Ports the spirit of
 *      ea-scripts/Auto Layout.md into a single command (no script finder).
 *
 *      Status: STUB (signature + canvas read wired; layout algorithm
 *      currently snaps boxes to a fixed 4-quadrant grid based on color —
 *      good enough for ≤8 nodes per bearing, not yet force-directed).
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

// --- Feature 1: design this folder (WORKING) --------------------------------

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

async function designThisFolder(plugin: Plugin, folder?: TFolder) {
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
    "tags: [excalidraw, faerie-draft, folder-design]",
    `design_for_folder: "${tgt.path}"`,
    `note_count: ${notes.length}`,
    `created: ${new Date().toISOString()}`,
    "---",
    "",
    "> [!brood] Design this folder — sketch the topology you want",
    `> ${notes.length} notes seeded from \`${tgt.path}\`. Existing wikilinks shown as gray arrows.`,
    "> Drag boxes into the four quadrants by bearing (color stroke to commit):",
    ...BEARINGS.map((b) => `> - <span style="color:${BEARING_COLOR[b]}">${BEARING_LABEL[b]}</span>`),
    "> Then run **Faerie: commit folder design → frontmatter** (re-uses ExcaliBrain commit pipeline per-note).",
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
    JSON.stringify({ type: "excalidraw", version: 2, source: "faerie-hive-plugin:design-folder", elements: scene.elements, appState: { gridSize: 20, viewBackgroundColor: "#FAF8F2" } }, null, 2),
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

class ProposalReviewModal extends Modal {
  constructor(app: App, private proposals: BearingProposal[], private onAccept: (accepted: BearingProposal[]) => void) {
    super(app);
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h2", { text: "Proposed bearings — review" });
    if (this.proposals.length === 0) {
      contentEl.createEl("p", { text: "No proposals returned. (Stub: MCP prompt template not yet wired.)" });
      return;
    }
    const accepted: Set<number> = new Set(this.proposals.map((_, i) => i));
    const list = contentEl.createEl("div", { cls: "faerie-proposal-list" });
    this.proposals.forEach((p, i) => {
      const row = list.createEl("div", { cls: "faerie-proposal-row" });
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
  const tgt = resolveTargetFolder(plugin.app, folder);
  if (!tgt) { new Notice("No folder context."); return; }
  const notes = await scanFolder(plugin.app, tgt);
  if (notes.length === 0) { new Notice(`No notes in ${tgt.path}.`); return; }

  // STUB: build the MCP payload but do not yet POST. Returning an empty
  // proposal list surfaces the modal in its "wired but inactive" form so
  // we can verify the review UX before turning the AI call on.
  const _payload = {
    folder: tgt.path,
    notes: notes.map((n) => ({ basename: n.file.basename, excerpt: n.excerpt, outLinks: n.outLinks })),
    bearings_doc: "N=unblock predecessor, S=conclude downstream, E=parallel sister, W=return to baseline",
  };
  // TODO: POST _payload to MCP `faerie_propose_bearings` (or `faerie_chat`
  // with a propose-bearings system prompt) and parse the JSON reply into
  // BearingProposal[]. For now, empty proposals → modal shows stub message.
  const proposals: BearingProposal[] = [];

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
  const file = plugin.app.workspace.getActiveFile();
  if (!file || file.extension !== "md") { new Notice("Open an Excalidraw note."); return; }
  const raw = await plugin.app.vault.read(file);
  const m = raw.match(/```json\n([\s\S]*?)\n```/);
  if (!m) { new Notice("No Excalidraw JSON block."); return; }
  let data: any;
  try { data = JSON.parse(m[1]); } catch { new Notice("Excalidraw JSON parse failed."); return; }
  const elements: any[] = data.elements ?? [];

  // STUB algorithm: snap colored rectangles into a 4-quadrant grid by bearing.
  // Real implementation would run force-directed layout respecting user-added
  // sticky notes and annotations. For now, this rearranges only rectangles
  // whose strokeColor matches a canonical bearing.
  const lanes: Record<Bearing, any[]> = { N: [], S: [], E: [], W: [] };
  for (const el of elements) {
    if (el?.type !== "rectangle") continue;
    for (const b of BEARINGS) if (el.strokeColor === BEARING_COLOR[b]) lanes[b].push(el);
  }
  const place = (arr: any[], baseX: number, baseY: number, dx: number, dy: number) => {
    arr.forEach((el, i) => { el.x = baseX + i * dx; el.y = baseY + i * dy; });
  };
  place(lanes.N, -110, -300, 0, -80);
  place(lanes.S, -110, 200, 0, 80);
  place(lanes.E, 300, -30, 240, 0);
  place(lanes.W, -440, -30, -240, 0);

  const newBlock = "```json\n" + JSON.stringify(data, null, 2) + "\n```";
  const next = raw.replace(/```json\n[\s\S]*?\n```/, newBlock);
  await plugin.app.vault.modify(file, next);
  const total = lanes.N.length + lanes.S.length + lanes.E.length + lanes.W.length;
  new Notice(`Auto-layout: ${total} bearing-rectangles snapped. (Stub: decorations untouched, no force-directed pass yet.)`, 8000);
}

// --- Registration -----------------------------------------------------------

export function registerDesignFolder(plugin: Plugin) {
  plugin.addCommand({
    id: "faerie-design-this-folder",
    name: "Faerie: design this folder (sketch topology for any folder of notes)",
    callback: () => designThisFolder(plugin),
  });

  plugin.addCommand({
    id: "faerie-scan-and-propose-bearings",
    name: "Faerie: scan folder and propose bearings (AI round-trip, review modal)",
    callback: () => scanAndProposeBearings(plugin),
  });

  plugin.addCommand({
    id: "faerie-auto-layout-from-frontmatter",
    name: "Faerie: auto-layout Excalidraw from frontmatter",
    callback: () => autoLayoutFromFrontmatter(plugin),
  });

  // File-menu entry: right-click any folder → run design pass.
  plugin.registerEvent(
    plugin.app.workspace.on("file-menu", (menu, fileOrFolder) => {
      if (!(fileOrFolder instanceof TFolder)) return;
      menu.addItem((item) =>
        item
          .setTitle("Faerie: design this folder")
          .setIcon("compass")
          .onClick(() => designThisFolder(plugin, fileOrFolder))
      );
      menu.addItem((item) =>
        item
          .setTitle("Faerie: scan & propose bearings")
          .setIcon("wand-2")
          .onClick(() => scanAndProposeBearings(plugin, fileOrFolder))
      );
    })
  );
}
