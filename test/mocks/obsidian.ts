/**
 * test/mocks/obsidian.ts — the `obsidian` module, faked well enough to drive real plugin code.
 *
 * WHY A MOCK AND NOT A HEADLESS OBSIDIAN. The community options for testing an Obsidian plugin
 * are, honestly, two: mock the `obsidian` module and unit-test real logic against it, or drive a
 * real Electron Obsidian with a scratch vault. The second gives you genuine fidelity and costs a
 * downloaded Obsidian binary, a display server, and a test that cannot run in CI without both.
 * For a plugin this size the mock buys almost all of the value: everything below `registerX` is
 * ordinary TypeScript, and that is where the bugs this suite exists to catch actually live.
 *
 * WHAT THIS MOCK IS HONEST ABOUT. It does NOT prove the plugin renders correctly inside Obsidian.
 * It proves the plugin LOADS without throwing, REGISTERS the commands it claims to, and that its
 * pure logic — blueprint rendering, custody verification, canonical hashing, key generation,
 * contract resolution — behaves. Anything this mock cannot see is reported as UNMEASURED by the
 * suite rather than quietly counted as a pass.
 *
 * The recorder below is the interesting part: `Plugin` captures every `addCommand`,
 * `registerView`, `addSettingTab` and protocol handler, so a test can assert on the plugin's
 * REAL registration surface instead of a list someone maintained by hand.
 */

export interface CommandDef {
  id: string;
  name: string;
  callback?: () => unknown;
  editorCallback?: (...args: unknown[]) => unknown;
  hotkeys?: unknown;
}

export class Notice {
  static log: string[] = [];
  constructor(public message: string, public timeout?: number) {
    Notice.log.push(String(message));
  }
  static reset() { Notice.log = []; }
  static find(substr: string) { return Notice.log.filter((m) => m.includes(substr)); }
}

class MockAdapter {
  files = new Map<string, string>();
  constructor(public basePath: string) {}
  async write(p: string, c: string) { this.files.set(p, c); }
  async read(p: string) {
    if (!this.files.has(p)) throw new Error(`ENOENT: ${p}`);
    return this.files.get(p)!;
  }
  async exists(p: string) { return this.files.has(p); }
  async remove(p: string) { this.files.delete(p); }
  async rename(a: string, b: string) { this.files.set(b, this.files.get(a)!); this.files.delete(a); }
  async stat(p: string) { return this.files.has(p) ? { mtime: Date.now() } : null; }
}

export class Vault {
  adapter: MockAdapter;
  constructor(basePath = "/tmp/mock-vault") { this.adapter = new MockAdapter(basePath); }
  async read() { return ""; }
  async cachedRead() { return ""; }
  getAbstractFileByPath() { return null; }
  async create() { return null as never; }
}

export class Workspace {
  private layoutReadyCbs: Array<() => void> = [];
  onLayoutReady(cb: () => void) { this.layoutReadyCbs.push(cb); }
  /** Test-only: fire the layout-ready callbacks the plugin registered. */
  _fireLayoutReady() { for (const cb of this.layoutReadyCbs) cb(); }
  on() { return { unload() {} }; }
  getActiveFile() { return null; }
  getLeavesOfType() { return [] as unknown[]; }
  getRightLeaf() { return null; }
  getLeaf() { return null; }
  revealLeaf() {}
  openLinkText() {}
}

export class App {
  vault = new Vault();
  workspace = new Workspace();
  metadataCache = { getFileCache: () => null };
  fileManager = { processFrontMatter: async () => {} };
  plugins = { plugins: {} as Record<string, unknown> };
  commands = { executeCommandById: () => {} };
}

/** Records everything a `registerX(plugin, …)` function does, so tests assert on reality. */
export class Plugin {
  commands: CommandDef[] = [];
  views: string[] = [];
  protocolHandlers: string[] = [];
  settingTabs = 0;
  intervals: unknown[] = [];
  manifest = { id: "compasscrew", dir: ".obsidian/plugins/compasscrew" };

  constructor(public app: App = new App(), _manifest?: unknown) {}

  addCommand(cmd: CommandDef) { this.commands.push(cmd); return cmd; }
  registerView(type: string) { this.views.push(type); }
  registerObsidianProtocolHandler(route: string, _cb: unknown) { this.protocolHandlers.push(route); }
  addSettingTab() { this.settingTabs++; }
  registerEvent() {}
  registerMarkdownPostProcessor() {}
  registerMarkdownCodeBlockProcessor() {}
  registerInterval(id: unknown) { this.intervals.push(id); return id; }
  registerDomEvent() {}
  addRibbonIcon() { return { addClass() {} }; }
  async loadData() { return {}; }
  async saveData() {}
  onunload() {}

  /** Run a registered command by id. Throws with the id if it is not registered. */
  async run(id: string) {
    const cmd = this.commands.find((c) => c.id === id || c.id.endsWith(id));
    if (!cmd) throw new Error(`command not registered: ${id}`);
    return cmd.callback ? await cmd.callback() : undefined;
  }
}

export class Modal {
  contentEl = makeEl("div");
  constructor(public app: App) {}
  open() { this.onOpen?.(); }
  close() { this.onClose?.(); }
  onOpen?(): void;
  onClose?(): void;
}

export class ItemView {
  containerEl = makeEl("div");
  app = new App();
  constructor(public leaf?: unknown) {
    this.containerEl.children = [makeEl("div"), makeEl("div")] as never;
  }
  registerEvent() {}
}

export class PluginSettingTab { constructor(public app: App, public plugin: unknown) {} }
export class Setting {
  constructor(public containerEl?: unknown) {}
  setName() { return this; } setDesc() { return this; }
  addText(cb: (t: unknown) => void) { cb(textStub()); return this; }
  addToggle(cb: (t: unknown) => void) { cb(toggleStub()); return this; }
  addButton(cb: (t: unknown) => void) { cb(buttonStub()); return this; }
  addDropdown(cb: (t: unknown) => void) { cb(dropdownStub()); return this; }
  addSlider(cb: (t: unknown) => void) { cb(sliderStub()); return this; }
}
export class FuzzySuggestModal extends Modal {}
export class SuggestModal extends Modal {}
export class TFile { constructor(public path = "", public basename = "", public extension = "md") {} }
export class TFolder { constructor(public path = "", public name = "", public children: unknown[] = []) {} }
export class MarkdownView {}
export class Editor {}
export class WorkspaceLeaf {}
export const normalizePath = (p: string) => p;

// ── minimal DOM-ish element, matching the Obsidian helpers the plugin uses ──
function makeEl(tag: string): any {
  const el: any = {
    tagName: tag, children: [] as any[], style: {}, textContent: "", innerHTML: "",
    createEl(t: string, o?: any) { const c = makeEl(t); if (o?.text) c.textContent = o.text; el.children.push(c); return c; },
    createDiv(o?: any) { return el.createEl("div", o); },
    createSpan(o?: any) { return el.createEl("span", o); },
    empty() { el.children = []; el.textContent = ""; },
    setText(t: string) { el.textContent = t; },
    appendText(t: string) { el.textContent += t; },
    addClass() {}, removeClass() {}, setAttr() {}, addEventListener() {},
  };
  return el;
}

const textStub = () => ({ setPlaceholder() { return this; }, setValue() { return this; }, onChange() { return this; } });
const toggleStub = () => ({ setValue() { return this; }, onChange() { return this; } });
const buttonStub = () => ({ setButtonText() { return this; }, onClick() { return this; }, setCta() { return this; } });
const dropdownStub = () => ({ addOption() { return this; }, setValue() { return this; }, onChange() { return this; } });
const sliderStub = () => ({ setLimits() { return this; }, setValue() { return this; }, setDynamicTooltip() { return this; }, onChange() { return this; } });
