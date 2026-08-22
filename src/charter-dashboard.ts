import { ItemView, Notice, Plugin, WorkspaceLeaf } from "obsidian";
import * as fs from "fs";
import * as path from "path";

export const VIEW_TYPE_COMPASSCREW_CHARTERS = "compasscrew-charters";

/**
 * charter-dashboard.ts — main-page Charter dashboard.
 *
 * Status: SCAFFOLD (2026-05-19) — view registered, MCP wiring in place,
 * UI structure rendered, charter list populated. The edit form posts to
 * compasscrew_charter verb=update but the field-level form template is the
 * next iteration's polish.
 *
 * Purpose (user request 2026-05-19): make charters the entry-point of a
 * session — past charters visible at a glance, current charter editable
 * via a structured template (which itself sets the session in motion),
 * "new charter" button for declaring fresh missions.
 *
 * MCP tools called (all via compasscrew_charter verb-dispatcher):
 *   - compasscrew_charter verb=list (status=active|shipped)   list view
 *   - compasscrew_charter verb=get (charter_id)               fetch one for edit form
 *   - compasscrew_charter verb=update (id, fm, body)          save edits
 *   - compasscrew_charter verb=declare (id, addr...)          new charter
 *
 * Styles: see styles.css section 6 (.compasscrew-charter-pane, -card, -form).
 *
 * Open work for next agent:
 *   - Form field rendering driven by Blueprints/Charter.njk (parse the
 *     njk to know which slots exist).
 *   - Inline COC tail showing this charter's mutation history.
 *   - "Set session in motion" button: posts the just-saved charter as the
 *     active mission to compasscrew_agent verb=spawn / compasscrew_data verb=bundle.
 */

interface CharterSummary {
  name: string;
  path: string;
  status?: string;
  created?: string;
}

export class CompassCrewChartersView extends ItemView {
  private root!: HTMLElement;
  private active: CharterSummary[] = [];

  constructor(
    leaf: WorkspaceLeaf,
    private getMcpUrl: () => string,
    private getTokenPath: () => string,
  ) { super(leaf); }

  getViewType() { return VIEW_TYPE_COMPASSCREW_CHARTERS; }
  getDisplayText() { return "CompassCrew Charters"; }
  getIcon() { return "scroll-text"; }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    try {
      const vault = (this.app.vault.adapter as any).basePath as string;
      const tok = fs.readFileSync(path.join(vault, this.getTokenPath()), "utf8").trim();
      if (tok) h["Authorization"] = `Bearer ${tok}`;
    } catch { /* no token; tools that are free-tier still respond */ }
    return h;
  }

  private async callTool<T = any>(name: string, body: any = {}): Promise<T | null> {
    const url = this.getMcpUrl().replace(/\/+$/, "") + "/tools/" + name;
    try {
      const r = await fetch(url, { method: "POST", headers: this.headers(), body: JSON.stringify(body) });
      if (!r.ok) return null;
      return await r.json();
    } catch { return null; }
  }

  async onOpen() {
    this.root = this.containerEl.children[1] as HTMLElement;
    this.root.empty();
    this.root.addClass("compasscrew-charter-pane");
    this.render();
  }

  private async render() {
    this.root.empty();
    this.root.createEl("h2", { text: "Charters" });

    // Action bar
    const bar = this.root.createDiv();
    const newBtn = bar.createEl("button", { text: "+ New charter" });
    newBtn.onclick = () => this.openCreateForm();
    const refresh = bar.createEl("button", { text: "Refresh" });
    refresh.onclick = () => this.render();

    // List
    const list = this.root.createDiv({ cls: "compasscrew-charter-list" });
    list.createEl("h3", { text: "Active" });
    const data: any = await this.callTool("compasscrew_charter", { verb: "list", status: "active" });
    const charters: CharterSummary[] = (data?.charters ?? data?.result?.charters ?? []) as CharterSummary[];
    this.active = charters;
    if (charters.length === 0) {
      list.createEl("p", { text: "No active charters yet. Click '+ New charter' to declare one." });
    }
    for (const c of charters) {
      const card = list.createDiv({ cls: "compasscrew-charter-card" });
      card.createEl("div", { cls: "charter-title", text: c.name });
      card.createEl("div", { cls: "charter-meta", text: c.path });
      card.onclick = () => this.openEditForm(c.name);
    }

    // Past
    list.createEl("h3", { text: "Past (shipped + retired)" });
    const past: any = await this.callTool("compasscrew_charter", { verb: "list", status: "shipped" });
    const pastCh: CharterSummary[] = (past?.charters ?? past?.result?.charters ?? []) as CharterSummary[];
    for (const c of pastCh) {
      const card = list.createDiv({ cls: "compasscrew-charter-card" });
      card.createEl("div", { cls: "charter-title", text: c.name });
      card.createEl("div", { cls: "charter-meta", text: c.path });
      card.onclick = () => this.openEditForm(c.name);
    }
  }

  /** Open structured edit form for an existing charter. Calls compasscrew_charter verb=get → form → verb=update. */
  private async openEditForm(charter_id: string) {
    const data: any = await this.callTool("compasscrew_charter", { verb: "get", charter_id });
    if (!data?.ok) { new Notice(`Could not load charter ${charter_id}`); return; }
    const fm = data.frontmatter || {};
    const body = data.body || "";

    this.root.empty();
    this.root.createEl("h2", { text: charter_id });
    const back = this.root.createEl("button", { text: "← Back to list" });
    back.onclick = () => this.render();

    const form = this.root.createDiv({ cls: "compasscrew-charter-form" });
    // Minimal field set — see Blueprints/Charter.njk for the canonical
    // template. Next agent: drive these fields off the njk slot list.
    const fields: Array<[string, string, boolean]> = [
      ["intent", "Intent (why this charter exists)", false],
      ["success", "Success criteria", false],
      ["eta", "ETA (YYYY-MM-DD)", true],
      ["status", "Status (declared|active|shipped|retired)", true],
    ];
    const inputs: Record<string, HTMLInputElement | HTMLTextAreaElement> = {};
    for (const [key, label, oneLine] of fields) {
      form.createEl("label", { text: label });
      const cur = (fm as any)[key] ?? "";
      const el: HTMLInputElement | HTMLTextAreaElement = oneLine
        ? form.createEl("input", { type: "text" })
        : form.createEl("textarea");
      (el as any).value = typeof cur === "string" ? cur : JSON.stringify(cur);
      inputs[key] = el;
    }
    form.createEl("label", { text: "Body (markdown — overrides existing if non-empty)" });
    const bodyEl = form.createEl("textarea");
    bodyEl.style.minHeight = "200px";
    (bodyEl as any).value = body;

    const saveBtn = form.createEl("button", { text: "Save charter" });
    saveBtn.onclick = async () => {
      const newFm: Record<string, any> = {};
      for (const [k] of fields) newFm[k] = (inputs[k] as any).value;
      const newBody = (bodyEl as any).value;
      const res: any = await this.callTool("compasscrew_charter", {
        verb: "update", charter_id, frontmatter: newFm, body: newBody,
      });
      if (res?.ok) {
        new Notice(`Charter ${charter_id} saved.`);
        this.render();
      } else {
        new Notice(`Save failed: ${res?.error || "unknown"}`, 6000);
      }
    };

    const setInMotionBtn = form.createEl("button", { text: "Set session in motion → spawn from this charter" });
    setInMotionBtn.onclick = async () => {
      // TODO (next agent): call compasscrew_agent verb=spawn with this charter's address.
      // For now, surface the intended payload to confirm wiring.
      new Notice(`(Scaffold) Would spawn mission from charter ${charter_id}. Wire compasscrew_agent verb=spawn next.`, 8000);
    };
  }

  /** Declare a new charter via compasscrew_charter verb=declare. Minimal form. */
  private async openCreateForm() {
    this.root.empty();
    this.root.createEl("h2", { text: "Declare new charter" });
    const back = this.root.createEl("button", { text: "← Back" });
    back.onclick = () => this.render();

    const form = this.root.createDiv({ cls: "compasscrew-charter-form" });
    form.createEl("label", { text: "Charter ID (dotted w4w address)" });
    const idEl = form.createEl("input", { type: "text" }) as HTMLInputElement;
    idEl.placeholder = "ship.sensemaking.vault.example";
    form.createEl("label", { text: "Intent address (comma-separated slots)" });
    const addrEl = form.createEl("input", { type: "text" }) as HTMLInputElement;
    addrEl.placeholder = "ship, sensemaking, vault, example";
    form.createEl("label", { text: "Phase (e.g. 1-of-2)" });
    const phaseEl = form.createEl("input", { type: "text" }) as HTMLInputElement;
    phaseEl.value = "1-of-1";
    form.createEl("label", { text: "ETA (YYYY-MM-DD)" });
    const etaEl = form.createEl("input", { type: "text" }) as HTMLInputElement;

    const declareBtn = form.createEl("button", { text: "Declare charter" });
    declareBtn.onclick = async () => {
      const charter_id = idEl.value.trim();
      const intent_address = addrEl.value.split(",").map((s) => s.trim()).filter(Boolean);
      if (!charter_id || intent_address.length < 3) {
        new Notice("Need charter_id + intent_address with ≥3 slots."); return;
      }
      const res: any = await this.callTool("compasscrew_charter", {
        verb: "declare", charter_id, intent_address, phase: phaseEl.value || "1-of-1", eta: etaEl.value,
      });
      if (res?.ok) {
        new Notice(`Charter ${charter_id} declared.`);
        this.render();
      } else {
        new Notice(`Declare failed: ${res?.error || "unknown"}`, 6000);
      }
    };
  }
}

export function registerCharterDashboard(
  plugin: Plugin,
  getMcpUrl: () => string,
  getTokenPath: () => string,
) {
  plugin.registerView(
    VIEW_TYPE_COMPASSCREW_CHARTERS,
    (leaf) => new CompassCrewChartersView(leaf, getMcpUrl, getTokenPath),
  );
  plugin.addCommand({
    id: "compasscrew-open-charters",
    name: "✶ CompassCrew: open Charters dashboard",
    callback: async () => {
      const { workspace } = plugin.app;
      let leaf = workspace.getLeavesOfType(VIEW_TYPE_COMPASSCREW_CHARTERS)[0];
      if (!leaf) {
        leaf = workspace.getRightLeaf(false)!;
        await leaf.setViewState({ type: VIEW_TYPE_COMPASSCREW_CHARTERS, active: true });
      }
      workspace.revealLeaf(leaf);
    },
  });
}
