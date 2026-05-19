import { App, Editor, MarkdownView, Modal, Notice, Plugin } from "obsidian";

type Bearing = "N" | "S" | "E" | "W";
const BEARING_NAME: Record<Bearing, string> = {
  N: "North — unblock predecessor",
  S: "South — conclude / move downstream",
  E: "East — parallel sister work",
  W: "West — return to baseline / HQ",
};

class BearingPickerModal extends Modal {
  constructor(app: App, private onPick: (b: Bearing, dest: string) => void) {
    super(app);
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Trail-ref bearing" });
    const destInput = contentEl.createEl("input", { type: "text", placeholder: "destination note (without .md) — leave blank for #" });
    destInput.style.width = "100%";
    destInput.style.marginBottom = "1em";
    const row = contentEl.createDiv();
    row.style.display = "flex";
    row.style.gap = "8px";
    (Object.keys(BEARING_NAME) as Bearing[]).forEach((b) => {
      const btn = row.createEl("button", { text: `${b} — ${BEARING_NAME[b]}` });
      btn.onclick = () => {
        const dest = destInput.value.trim() || "#";
        this.onPick(b, dest);
        this.close();
      };
    });
  }
  onClose() {
    this.contentEl.empty();
  }
}

export function registerTrailRefs(plugin: Plugin) {
  plugin.addCommand({
    id: "faerie-highlight-with-bearing",
    name: "Faerie: highlight selection with bearing (trail-ref)",
    hotkeys: [{ modifiers: ["Mod", "Shift"], key: "H" }],
    editorCallback: (editor: Editor, _view: MarkdownView) => {
      const sel = editor.getSelection();
      if (!sel) {
        new Notice("Select text first to create a trail-ref.");
        return;
      }
      new BearingPickerModal(plugin.app, async (b, dest) => {
        // Markdown link with bearing carried in title attribute. CSS in
        // styles.css targets a[title="N"|"S"|"E"|"W"] for bearing colors.
        const destPath = dest === "#" ? "#" : (dest.endsWith(".md") ? dest : `${dest}.md`);
        const replacement = `[${sel}](${destPath} "${b}")`;
        editor.replaceSelection(replacement);
        // Also write a Breadcrumbs threading field so the link participates
        // in the Breadcrumbs trail view (up/next/same/down) — see
        // breadcrumbs-threading.ts for the bearing→field map.
        const file = plugin.app.workspace.getActiveFile();
        const addBc = (plugin as any).faerieAddBreadcrumb;
        if (file && destPath !== "#" && typeof addBc === "function") {
          try { await addBc(file, b, destPath); } catch { /* ignore */ }
        }
        new Notice(`Trail-ref ${b} → ${destPath}`);
      }).open();
    },
  });

  plugin.addCommand({
    id: "faerie-copy-trail-ref",
    name: "Faerie: copy trail-ref to clipboard",
    hotkeys: [{ modifiers: ["Mod", "Shift"], key: "C" }],
    editorCallback: async (editor: Editor) => {
      const sel = editor.getSelection();
      const file = plugin.app.workspace.getActiveFile();
      if (!file) return;
      const ref = `[${sel || file.basename}](${file.path})`;
      await navigator.clipboard.writeText(ref);
      new Notice("Trail-ref copied.");
    },
  });

  plugin.addCommand({
    id: "faerie-toggle-all-trail-refs",
    name: "Faerie: toggle all trail-refs (show/hide)",
    hotkeys: [{ modifiers: ["Mod", "Shift"], key: "S" }],
    callback: () => {
      document.body.classList.toggle("faerie-trail-refs-collapsed");
      new Notice(
        document.body.classList.contains("faerie-trail-refs-collapsed")
          ? "Trail-refs collapsed."
          : "Trail-refs expanded."
      );
    },
  });

  // Cmd+Hover peek + Shift+Click collapse are implemented via styles.css +
  // Obsidian's native page-preview core plugin (must be enabled). We attach
  // a delegated click handler for Shift+Click toggling at the element level.
  plugin.registerDomEvent(document, "click", (evt: MouseEvent) => {
    if (!evt.shiftKey) return;
    const target = evt.target as HTMLElement;
    const a = target.closest("a.internal-link, a.external-link") as HTMLAnchorElement | null;
    if (!a) return;
    const t = (a.getAttribute("title") || "").trim();
    if (!["N", "S", "E", "W"].includes(t)) return;
    evt.preventDefault();
    a.classList.toggle("faerie-collapsed");
  });
}
