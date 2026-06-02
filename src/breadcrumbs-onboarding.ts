import { App, Modal, Notice, Plugin, TFile, Setting } from "obsidian";
import { Bearing, BEARING_TO_BC_FIELD, BEARING_COLOR, BEARING_LABEL } from "./bearings";

/**
 * Breadcrumbs Onboarding — makes threading intuitive.
 *
 * User reports: "I get the idea but it's been hard to get going and use."
 *
 * The friction with Breadcrumbs is that it's powerful but abstract: you have
 * to *imagine* the hierarchy, then *edit YAML* to express it, then *trust*
 * that you got the field names right. This module flips that around:
 *
 *  1. **Visual wizard** — point-and-click: "this note is the parent of X,
 *     Y, Z." No YAML editing.
 *  2. **Auto-suggest hierarchy from folder structure** — if the user has
 *     `Projects/Alpha/Phase-1.md` and `Projects/Alpha/_index.md`, suggest
 *     that `_index` is `up:` for `Phase-1`.
 *  3. **Auto-suggest threading from existing links** — if note A links to
 *     B, C, D, and they all link back to A, suggest A is `up:` and B/C/D
 *     are siblings of each other (`same:`).
 *  4. **Inline thread renderer** — adds a small "Thread" widget below the
 *     frontmatter showing up/down/same as clickable pills with bearing
 *     colors. Click a pill to jump. Click the "+" to add another link.
 *  5. **Quick-thread modal** — Cmd+Shift+T opens a fuzzy file picker:
 *     pick a note, pick a bearing (N/S/E/W), done. The frontmatter is
 *     written for you.
 *
 * The principle: never make the user write YAML. Make the threading a
 * physical gesture (click, pick, done).
 */

interface ThreadSuggestion {
  fromFile: TFile;
  toFile: TFile;
  bearing: Bearing;
  reason: string; // human-readable: "both in folder Projects/Alpha, _index → child"
}

class QuickThreadModal extends Modal {
  searchEl!: HTMLInputElement;
  resultsEl!: HTMLDivElement;
  bearingEl!: HTMLSelectElement;
  files: TFile[];
  filtered: TFile[];

  constructor(
    app: App,
    private fromFile: TFile,
    private onPick: (target: TFile, bearing: Bearing) => void,
  ) {
    super(app);
    this.files = app.vault.getMarkdownFiles().filter((f) => f !== fromFile);
    this.filtered = this.files.slice(0, 30);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Quick-thread" });
    contentEl.createEl("p", { text: `From: ${this.fromFile.basename}` });

    // Bearing picker (radio-like)
    const bearingRow = contentEl.createDiv();
    bearingRow.style.display = "flex";
    bearingRow.style.gap = "6px";
    bearingRow.style.marginBottom = "1em";
    contentEl.createEl("label", { text: "Direction:" });
    this.bearingEl = bearingRow.createEl("select");
    (["N", "S", "E", "W"] as Bearing[]).forEach((b) => {
      const opt = this.bearingEl.createEl("option", { text: BEARING_LABEL[b], value: b });
      opt.style.color = BEARING_COLOR[b];
    });
    this.bearingEl.value = "S"; // most common default

    contentEl.createEl("label", { text: "Target note:" });
    this.searchEl = contentEl.createEl("input", { type: "text", placeholder: "type to filter..." });
    this.searchEl.style.width = "100%";
    this.searchEl.addEventListener("input", () => this.refresh());

    this.resultsEl = contentEl.createDiv({ cls: "swarmy-thread-results" });
    this.resultsEl.style.maxHeight = "300px";
    this.resultsEl.style.overflowY = "auto";
    this.resultsEl.style.marginTop = "0.5em";
    this.refresh();

    // Keyboard: Enter selects first result
    this.searchEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && this.filtered.length > 0) {
        e.preventDefault();
        this.pick(this.filtered[0]);
      }
    });
    this.searchEl.focus();
  }

  refresh() {
    const q = this.searchEl?.value.toLowerCase().trim() ?? "";
    this.filtered = q
      ? this.files.filter((f) =>
          f.basename.toLowerCase().includes(q) || f.path.toLowerCase().includes(q)
        ).slice(0, 30)
      : this.files.slice(0, 30);
    this.resultsEl.empty();
    this.filtered.forEach((f) => {
      const row = this.resultsEl.createEl("div", { cls: "swarmy-thread-row" });
      row.style.padding = "4px 8px";
      row.style.cursor = "pointer";
      row.style.borderBottom = "1px solid var(--background-modifier-border)";
      row.createEl("strong", { text: f.basename });
      row.createEl("span", { text: ` — ${f.parent?.path || ""}`, cls: "swarmy-thread-path" });
      (row.querySelector(".swarmy-thread-path") as HTMLElement).style.opacity = "0.6";
      (row.querySelector(".swarmy-thread-path") as HTMLElement).style.fontSize = "0.85em";
      row.onclick = () => this.pick(f);
      row.onmouseenter = () => (row.style.backgroundColor = "var(--background-modifier-hover)");
      row.onmouseleave = () => (row.style.backgroundColor = "");
    });
  }

  pick(target: TFile) {
    this.onPick(target, this.bearingEl.value as Bearing);
    this.close();
  }

  onClose() { this.contentEl.empty(); }
}

class ThreadSuggestionsModal extends Modal {
  constructor(
    app: App,
    private suggestions: ThreadSuggestion[],
    private onAccept: (s: ThreadSuggestion[]) => void,
  ) { super(app); }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Breadcrumbs threading suggestions" });
    contentEl.createEl("p", {
      text: `Swarmy scanned your vault and found ${this.suggestions.length} relationships that could be threaded. Review and accept the ones that look right.`,
    });
    const accepted: ThreadSuggestion[] = [];
    this.suggestions.slice(0, 50).forEach((s, i) => {
      const row = contentEl.createDiv({ cls: "swarmy-suggestion-row" });
      row.style.padding = "8px";
      row.style.borderBottom = "1px solid var(--background-modifier-border)";
      row.style.display = "flex";
      row.style.alignItems = "center";
      row.style.gap = "8px";

      const cb = row.createEl("input", { type: "checkbox" });
      cb.checked = true;
      cb.addEventListener("change", () => {
        if (cb.checked) accepted.push(s);
        else accepted.splice(accepted.indexOf(s), 1);
      });
      accepted.push(s);

      const colorEl = row.createEl("span", { text: s.bearing });
      colorEl.style.color = BEARING_COLOR[s.bearing];
      colorEl.style.fontWeight = "bold";
      colorEl.style.minWidth = "20px";

      const desc = row.createDiv();
      desc.createEl("strong", { text: s.fromFile.basename });
      desc.createEl("span", { text: ` ${s.bearing === "S" ? "→" : s.bearing === "N" ? "←" : s.bearing === "E" ? "↔" : "↑"} ` });
      desc.createEl("strong", { text: s.toFile.basename });
      desc.createEl("br");
      const reason = desc.createEl("small", { text: s.reason });
      reason.style.opacity = "0.7";
    });

    const btnRow = contentEl.createDiv();
    btnRow.style.marginTop = "1em";
    btnRow.style.display = "flex";
    btnRow.style.gap = "8px";
    const accept = btnRow.createEl("button", { text: "Apply selected" });
    accept.onclick = () => {
      this.onAccept(accepted);
      this.close();
    };
    const skip = btnRow.createEl("button", { text: "Cancel" });
    skip.onclick = () => this.close();
  }

  onClose() { this.contentEl.empty(); }
}

/** Detect parent/child relationships from folder + _index notes. */
function suggestFromFolders(app: App): ThreadSuggestion[] {
  const out: ThreadSuggestion[] = [];
  const files = app.vault.getMarkdownFiles();
  const byFolder = new Map<string, TFile[]>();
  for (const f of files) {
    const folder = f.parent?.path ?? "";
    if (!byFolder.has(folder)) byFolder.set(folder, []);
    byFolder.get(folder)!.push(f);
  }
  for (const [folder, group] of byFolder.entries()) {
    if (group.length < 2) continue;
    // Find an _index, index, or README in the group
    const indexLike = group.find((f) =>
      /^(_index|index|readme|moc|home)$/i.test(f.basename)
    );
    if (!indexLike) continue;
    for (const child of group) {
      if (child === indexLike) continue;
      out.push({
        fromFile: child,
        toFile: indexLike,
        bearing: "N",
        reason: `Both in folder "${folder}"; "${indexLike.basename}" is the index/MOC`,
      });
    }
  }
  return out;
}

/** Detect peer relationships from mutual links. */
function suggestFromMutualLinks(app: App): ThreadSuggestion[] {
  const out: ThreadSuggestion[] = [];
  const files = app.vault.getMarkdownFiles().slice(0, 500); // cap for perf
  const linksFrom = new Map<string, Set<string>>();
  for (const f of files) {
    const cache = app.metadataCache.getFileCache(f);
    const links = new Set<string>();
    for (const l of cache?.links ?? []) {
      const dest = app.metadataCache.getFirstLinkpathDest(l.link, f.path);
      if (dest) links.add(dest.path);
    }
    linksFrom.set(f.path, links);
  }
  // Find files where A→B and B→A (mutual) and they share a folder → suggest "same" (parallel sister)
  const seen = new Set<string>();
  for (const a of files) {
    const aLinks = linksFrom.get(a.path) ?? new Set();
    for (const bPath of aLinks) {
      const key = [a.path, bPath].sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      const bLinks = linksFrom.get(bPath);
      if (!bLinks || !bLinks.has(a.path)) continue;
      const b = files.find((f) => f.path === bPath);
      if (!b) continue;
      if (a.parent?.path !== b.parent?.path) continue;
      out.push({
        fromFile: a,
        toFile: b,
        bearing: "E",
        reason: `Mutual link in same folder "${a.parent?.path}"`,
      });
    }
  }
  return out;
}

async function applySuggestions(app: App, suggestions: ThreadSuggestion[]) {
  let n = 0;
  for (const s of suggestions) {
    const field = BEARING_TO_BC_FIELD[s.bearing];
    const linkVal = `[[${s.toFile.basename}]]`;
    try {
      await app.fileManager.processFrontMatter(s.fromFile, (fm) => {
        const existing = fm[field];
        if (existing == null) fm[field] = [linkVal];
        else if (Array.isArray(existing)) {
          if (!existing.includes(linkVal)) existing.push(linkVal);
        } else if (typeof existing === "string") {
          if (!existing.includes(s.toFile.basename)) fm[field] = [existing, linkVal];
        }
      });
      n++;
    } catch { /* skip */ }
  }
  new Notice(`Applied ${n} thread links.`);
}

/**
 * Inline thread widget — markdown post-processor that renders a small
 * pill-row below the frontmatter showing up/down/same as colored,
 * clickable pills with a [+] button to add more.
 */
function registerInlineWidget(plugin: Plugin) {
  plugin.registerMarkdownPostProcessor((el, ctx) => {
    // Only render at the top of a document
    const file = plugin.app.vault.getAbstractFileByPath(ctx.sourcePath);
    if (!(file instanceof TFile)) return;
    if (el.querySelector(".swarmy-thread-widget")) return; // dedupe
    // Only attach to the first .markdown-preview-section child
    const isTop = el.parentElement?.classList.contains("markdown-preview-section");
    if (!isTop) return;

    const cache = plugin.app.metadataCache.getFileCache(file);
    const fm = cache?.frontmatter ?? {};
    const ups = ([] as string[]).concat(fm.up || []);
    const downs = ([] as string[]).concat(fm.down || [], fm.next || []);
    const sames = ([] as string[]).concat(fm.same || []);
    if (ups.length + downs.length + sames.length === 0) return;

    const widget = el.createDiv({ cls: "swarmy-thread-widget" });
    widget.style.cssText = "display:flex;gap:6px;flex-wrap:wrap;padding:6px;border-radius:6px;background:var(--background-secondary);margin-bottom:1em;";

    const pill = (text: string, color: string, label: string) => {
      const p = widget.createEl("span");
      p.style.cssText = `padding:2px 8px;border-radius:12px;background:${color}22;color:${color};border:1px solid ${color};cursor:pointer;font-size:0.85em;`;
      p.textContent = `${label}: ${text.replace(/[\[\]]/g, "")}`;
      p.onclick = () => {
        const clean = text.replace(/[\[\]]/g, "").split("|")[0];
        plugin.app.workspace.openLinkText(clean, file.path, false);
      };
      return p;
    };

    ups.forEach((u) => pill(String(u), BEARING_COLOR.N, "↑ up"));
    sames.forEach((s) => pill(String(s), BEARING_COLOR.E, "↔ same"));
    downs.forEach((d) => pill(String(d), BEARING_COLOR.S, "↓ next"));

    const addBtn = widget.createEl("span", { text: "+ thread" });
    addBtn.style.cssText = "padding:2px 8px;border-radius:12px;background:var(--background-primary);cursor:pointer;font-size:0.85em;opacity:0.6;";
    addBtn.onclick = () => {
      (plugin.app as any).commands.executeCommandById("hive:swarmy-quick-thread");
    };
  });
}

export function registerBreadcrumbsOnboarding(plugin: Plugin) {
  // (1) Quick-thread modal — Cmd+Shift+T
  plugin.addCommand({
    id: "swarmy-quick-thread",
    name: "Swarmy: quick-thread (pick a note, pick a direction)",
    hotkeys: [{ modifiers: ["Mod", "Shift"], key: "T" }],
    callback: () => {
      const file = plugin.app.workspace.getActiveFile();
      if (!file) { new Notice("Open a note first."); return; }
      new QuickThreadModal(plugin.app, file, async (target, bearing) => {
        const field = BEARING_TO_BC_FIELD[bearing];
        const linkVal = `[[${target.basename}]]`;
        await plugin.app.fileManager.processFrontMatter(file, (fm) => {
          const existing = fm[field];
          if (existing == null) fm[field] = [linkVal];
          else if (Array.isArray(existing)) {
            if (!existing.includes(linkVal)) existing.push(linkVal);
          } else if (typeof existing === "string") {
            fm[field] = [existing, linkVal];
          }
        });
        new Notice(`Threaded: ${file.basename} ${bearing} → ${target.basename}`);
      }).open();
    },
  });

  // (2) Auto-suggest from folders + mutual links
  plugin.addCommand({
    id: "swarmy-suggest-threads",
    name: "Swarmy: suggest threads (auto-detect from folder + link structure)",
    callback: async () => {
      const suggestions = [
        ...suggestFromFolders(plugin.app),
        ...suggestFromMutualLinks(plugin.app),
      ];
      if (!suggestions.length) {
        new Notice("No threading suggestions found. Try linking some notes first.");
        return;
      }
      new ThreadSuggestionsModal(plugin.app, suggestions, async (accepted) => {
        await applySuggestions(plugin.app, accepted);
      }).open();
    },
  });

  // (3) Tutorial: open a guided walkthrough
  plugin.addCommand({
    id: "swarmy-breadcrumbs-tutorial",
    name: "Swarmy: breadcrumbs tutorial (interactive)",
    callback: async () => {
      const root = (plugin.app.vault.adapter as any).basePath;
      const fs = require("fs"); const path = require("path");
      const dir = path.join(root, "00-SHARED", "HELP");
      fs.mkdirSync(dir, { recursive: true });
      const target = path.join(dir, "breadcrumbs-tutorial.md");
      if (!fs.existsSync(target)) {
        const tut = [
          "---",
          "type: tutorial",
          "tags: [swarmy, breadcrumbs, threading]",
          "---",
          "",
          "# Breadcrumbs Threading — the intuitive way",
          "",
          "> [!waggle] Direction",
          "> Breadcrumbs is just *frontmatter fields that mean direction*. That's it.",
          "",
          "## The four fields you'll ever use",
          "",
          "| Field | Means | Bearing | Color |",
          "|---|---|---|---|",
          "| `up:` | the parent / index / what this note is about | **N** (north) | red |",
          "| `next:` | the next note in sequence | **S** (south) | green |",
          "| `same:` | a sister note at the same level | **E** (east) | orange |",
          "| `down:` | a child note (rare; usually `up:` on the child is cleaner) | inverse of S | (auto) |",
          "",
          "## Three ways to add a thread (no YAML editing required)",
          "",
          "1. **Cmd+Shift+T** — opens the quick-thread modal. Pick a note, pick a direction, done.",
          "2. **Cmd+Shift+H** on selected text — creates a trail-ref *and* adds the breadcrumb field automatically.",
          "3. **Swarmy: suggest threads** — scans your vault and proposes threads from folder structure + mutual links.",
          "",
          "## The mental model",
          "",
          "Pick any note. Ask yourself two questions:",
          "1. **What note would I jump UP to** if I wanted broader context? That's `up:`.",
          "2. **What note comes NEXT** in the natural flow? That's `next:`.",
          "",
          "Don't overthink the rest. Most notes only need `up:`. A few need `next:`. Sister notes get `same:` only when they're truly parallel (e.g., chapters in the same book).",
          "",
          "## Visual feedback",
          "",
          "Hive's inline thread widget renders at the top of every threaded note:",
          "",
          "> ↑ up: Parent-MOC  ↔ same: Sister-Note  ↓ next: Next-Phase  + thread",
          "",
          "Click any pill to jump. Click + to add another.",
          "",
          "## Try it now",
          "",
          "1. Open any note.",
          "2. Press Cmd+Shift+T.",
          "3. Type the name of the broader topic note.",
          "4. Pick **N (north)**.",
          "5. Press Enter.",
          "",
          "You just threaded a note. No YAML.",
        ].join("\n");
        fs.writeFileSync(target, tut, "utf8");
      }
      const tfile = plugin.app.vault.getAbstractFileByPath(path.relative(root, target).replace(/\\/g, "/"));
      if (tfile instanceof TFile) {
        await plugin.app.workspace.getLeaf(true).openFile(tfile);
      }
    },
  });

  // (4) Inline thread widget
  registerInlineWidget(plugin);
}
