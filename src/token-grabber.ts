import { App, Modal, Notice, Plugin, Setting } from "obsidian";

/**
 * One-click MCP token grab.
 *
 * Flow:
 *  1. User runs "Faerie: grab MCP token" or clicks the Settings button.
 *  2. We open https://faerie.retrofuture.tech/auth/grab?return=obsidian://faerie-token-callback
 *  3. Server (when implemented) authenticates the user and redirects to the
 *     obsidian protocol URI with `?token=...&signing_key=...`.
 *  4. `registerObsidianProtocolHandler("faerie-token-callback", ...)` fires;
 *     we atomically write `.faerie-token` + `.faerie-user-key` to the vault
 *     root and show a Notice.
 *  5. If the redirect doesn't arrive within 60s, we surface a manual paste
 *     modal so the user can paste the token directly.
 *
 * TODO(server): /auth/grab endpoint may not yet exist on
 * faerie.retrofuture.tech. Until then, the manual-paste fallback is the
 * primary path. Once the server endpoint ships, the redirect path will
 * Just Work without plugin changes.
 */

const TOKEN_FILE = ".faerie-token";
const KEY_FILE = ".faerie-user-key";
const GRAB_URL = "https://faerie.retrofuture.tech/auth/grab?return=obsidian://faerie-token-callback";

async function atomicWrite(app: App, vaultRelPath: string, content: string): Promise<void> {
  const adapter = app.vault.adapter as any;
  const tmp = `${vaultRelPath}.tmp-${Date.now()}`;
  await adapter.write(tmp, content);
  // Best-effort rename; not all adapters expose rename, fall back to copy+remove.
  try {
    if (typeof adapter.rename === "function") {
      // remove dest if exists (rename may fail on Windows otherwise)
      if (await adapter.exists(vaultRelPath)) await adapter.remove(vaultRelPath);
      await adapter.rename(tmp, vaultRelPath);
    } else {
      await adapter.write(vaultRelPath, content);
      await adapter.remove(tmp);
    }
  } catch {
    await adapter.write(vaultRelPath, content);
    try { await adapter.remove(tmp); } catch { /* ignore */ }
  }
}

async function readTokenFingerprint(app: App): Promise<{ short: string; sha8: string; lastModified?: number } | null> {
  const adapter = app.vault.adapter as any;
  try {
    if (!(await adapter.exists(TOKEN_FILE))) return null;
    const tok = (await adapter.read(TOKEN_FILE)).trim();
    if (!tok) return null;
    const short = tok.slice(0, 8);
    let sha8 = "";
    try {
      const buf = new TextEncoder().encode(tok);
      const digest = await crypto.subtle.digest("SHA-256", buf);
      sha8 = Array.from(new Uint8Array(digest))
        .slice(0, 4)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    } catch { sha8 = "????????"; }
    let lastModified: number | undefined;
    try {
      const stat = await adapter.stat?.(TOKEN_FILE);
      lastModified = stat?.mtime;
    } catch { /* ignore */ }
    return { short, sha8, lastModified };
  } catch {
    return null;
  }
}

class PasteTokenModal extends Modal {
  tokenEl!: HTMLTextAreaElement;
  keyEl!: HTMLTextAreaElement;
  constructor(app: App, private onSubmit: (token: string, key: string) => void) { super(app); }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Paste MCP token" });
    contentEl.createEl("p", { text: "Get your token at https://faerie.retrofuture.tech and paste it below." });
    contentEl.createEl("label", { text: "Token:" });
    this.tokenEl = contentEl.createEl("textarea");
    this.tokenEl.style.width = "100%"; this.tokenEl.rows = 3;
    contentEl.createEl("label", { text: "Signing key (optional):" });
    this.keyEl = contentEl.createEl("textarea");
    this.keyEl.style.width = "100%"; this.keyEl.rows = 3;
    const btn = contentEl.createEl("button", { text: "Save" });
    btn.onclick = () => {
      const t = this.tokenEl.value.trim();
      const k = this.keyEl.value.trim();
      if (!t) { new Notice("Token is required."); return; }
      this.onSubmit(t, k);
      this.close();
    };
  }
  onClose() { this.contentEl.empty(); }
}

export async function getTokenFingerprint(app: App) {
  return readTokenFingerprint(app);
}

export function registerTokenGrabber(plugin: Plugin) {
  let awaitingCallback = false;
  let callbackTimer: number | null = null;

  plugin.registerObsidianProtocolHandler("faerie-token-callback", async (params) => {
    const token = (params.token || "").trim();
    const key = (params.signing_key || params.key || "").trim();
    if (!token) {
      new Notice("faerie-token-callback: missing token param.", 8000);
      return;
    }
    try {
      await atomicWrite(plugin.app, TOKEN_FILE, token + "\n");
      if (key) await atomicWrite(plugin.app, KEY_FILE, key + "\n");
      awaitingCallback = false;
      if (callbackTimer !== null) { window.clearTimeout(callbackTimer); callbackTimer = null; }
      new Notice("Faerie token saved. Hive is wired.", 6000);
    } catch (e) {
      new Notice("Token write failed: " + (e as Error).message, 8000);
    }
  });

  plugin.addCommand({
    id: "faerie-token-grab",
    name: "Faerie: grab MCP token",
    callback: async () => {
      awaitingCallback = true;
      window.open(GRAB_URL);
      new Notice("Opened faerie.retrofuture.tech — waiting up to 60s for callback…", 8000);
      if (callbackTimer !== null) window.clearTimeout(callbackTimer);
      callbackTimer = window.setTimeout(() => {
        if (!awaitingCallback) return;
        awaitingCallback = false;
        new PasteTokenModal(plugin.app, async (token, key) => {
          try {
            await atomicWrite(plugin.app, TOKEN_FILE, token + "\n");
            if (key) await atomicWrite(plugin.app, KEY_FILE, key + "\n");
            new Notice("Token saved (manual paste).", 6000);
          } catch (e) {
            new Notice("Token write failed: " + (e as Error).message, 8000);
          }
        }).open();
      }, 60_000);
    },
  });

  plugin.addCommand({
    id: "faerie-token-rotate",
    name: "Faerie: rotate MCP token",
    callback: async () => {
      const anyApp = plugin.app as any;
      const hive = anyApp.plugins?.plugins?.["hive"];
      const mcpUrl: string | undefined = hive?.hiveSettings?.mcpUrl;
      const adapter = plugin.app.vault.adapter as any;
      let curToken = "";
      try { curToken = (await adapter.read(TOKEN_FILE)).trim(); } catch { /* ignore */ }
      if (!mcpUrl || !curToken) {
        new Notice("Cannot rotate: missing MCP URL or current token. Grab one first.", 8000);
        return;
      }
      try {
        const resp = await fetch(`${mcpUrl.replace(/\/$/, "")}/tools/faerie_token_rotate`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${curToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        const newToken = (data.token || data.new_token || "").trim();
        const newKey = (data.signing_key || data.user_key || "").trim();
        if (!newToken) throw new Error("Server returned no token");
        await atomicWrite(plugin.app, TOKEN_FILE, newToken + "\n");
        if (newKey) await atomicWrite(plugin.app, KEY_FILE, newKey + "\n");
        new Notice("Token rotated.", 6000);
      } catch (e) {
        new Notice("Rotate failed: " + (e as Error).message, 10000);
      }
    },
  });

  plugin.addCommand({
    id: "faerie-token-fingerprint",
    name: "Faerie: show token fingerprint",
    callback: async () => {
      const fp = await readTokenFingerprint(plugin.app);
      if (!fp) { new Notice("No token saved. Run 'Faerie: grab MCP token'.", 8000); return; }
      const when = fp.lastModified ? new Date(fp.lastModified).toISOString().slice(0, 10) : "?";
      new Notice(`Token: ${fp.short}… sha8=${fp.sha8} (rotated ${when})`, 10000);
    },
  });
}
