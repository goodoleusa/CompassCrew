import { App, Modal, Notice, Plugin } from "obsidian";
import {
  LEGACY_PRIVATE_KEY_FILE,
  LEGACY_PRIVATE_KEY_REFUSAL,
  RECKON_WEB_HOST,
  TOKEN_FILE,
  TOOL,
  callReckonTool,
  resolveToken,
  vaultRoot,
  type McpBridgeSettings,
} from "./reckon-contract";
import * as nodeFs from "fs";
import * as nodePath from "path";

/**
 * token-grabber.ts — provision and rotate the MCP BEARER TOKEN. Nothing else.
 *
 * A bearer token is a REVOCABLE, SERVER-MINTED credential scoped to one user and tier, and
 * rotating it invalidates the old one (`token.py::token_rotate` pops the old entry before
 * returning the new). That is what makes it safe to hand a client. A SIGNING KEY is none of
 * those things, and this module used to handle one:
 *
 *   · it read `signing_key` out of an `obsidian://` callback URI's QUERY STRING, and
 *   · wrote it to `.swarmy-user-key` in the vault root in plaintext, and
 *   · offered the same field in a manual paste modal, and
 *   · looked for one in the `token rotate` response.
 *
 * All four are removed. `reckon_token verb=rotate` returns `{ok, token, tier, user_id}` and has
 * never returned a signing key, so the last of those was also dead code carrying live risk. A
 * private key that crosses a URL, a prompt or a file is a bearer secret wearing a key's name —
 * the exact property that retired `RECKON_SPAWN_TOKEN` — and this plugin no longer has any code
 * path that accepts one. Signing identity now lives in `coc-identity.ts`, where the private half
 * is generated in-process and is not exportable.
 *
 * A `signing_key` parameter arriving on the callback is treated as an INCIDENT, not as input:
 * it is refused by name, the value is never persisted, and the user is told to rotate it.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// ALL VARS AT TOP
// ═══════════════════════════════════════════════════════════════════════════════

/** Protocol route the auth host redirects to. Server-coordinated — renaming breaks the handshake. */
const CALLBACK_ROUTE = "swarmy-token-callback";

const GRAB_URL = `${RECKON_WEB_HOST}/auth/grab?return=obsidian://${CALLBACK_ROUTE}`;

/** How long the grab command waits for the redirect before offering the manual paste fallback. */
const CALLBACK_TIMEOUT_MS = 60_000;

/** Query params that must NEVER be accepted. Kept as data so the refusal can name what it saw. */
const FORBIDDEN_CALLBACK_PARAMS = ["signing_key", "key", "private_key", "seed", "mnemonic", "salt"] as const;

const FORBIDDEN_PARAM_REFUSAL =
  "REFUSED — the auth callback carried a private-key-shaped parameter. CompassCrew did not read " +
  "it and did not write it to disk. Treat that value as COMPROMISED anyway: it has already been " +
  "through a URL, which means shell history, protocol-handler logs and OS URI dispatch records. " +
  "Rotate it at the server. CompassCrew's signing identity is generated in-process and is not " +
  "exportable — see 'CompassCrew: create signing identity'.";

// ═══════════════════════════════════════════════════════════════════════════════
// CHUNK: atomic token write
// ═══════════════════════════════════════════════════════════════════════════════

async function atomicWrite(app: App, vaultRelPath: string, content: string): Promise<void> {
  const adapter = app.vault.adapter as any;
  const tmp = `${vaultRelPath}.tmp-${Date.now()}`;
  await adapter.write(tmp, content);
  try {
    if (typeof adapter.rename === "function") {
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

// ═══════════════════════════════════════════════════════════════════════════════
// CHUNK: token fingerprint
// ═══════════════════════════════════════════════════════════════════════════════

export interface TokenFingerprint { short: string; sha8: string; source: string; isDemo: boolean; lastModified?: number }

async function readTokenFingerprint(app: App, tokenPath: string): Promise<TokenFingerprint | null> {
  const root = vaultRoot(app as never);
  const { token, source, isDemo } = resolveToken(nodeFs, nodePath.join, root, tokenPath);
  if (!token) return null;
  let sha8 = "????????";
  try {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
    sha8 = Array.from(new Uint8Array(digest)).slice(0, 4).map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch { /* keep the ????????, which reads as UNMEASURED rather than as a real digest */ }
  let lastModified: number | undefined;
  try { lastModified = (await (app.vault.adapter as any).stat?.(source))?.mtime; } catch { /* ignore */ }
  return { short: token.slice(0, 8), sha8, source, isDemo, lastModified };
}

export async function getTokenFingerprint(app: App, tokenPath: string = TOKEN_FILE) {
  return readTokenFingerprint(app, tokenPath);
}

// ═══════════════════════════════════════════════════════════════════════════════
// CHUNK: manual paste fallback (token ONLY — there is no key field)
// ═══════════════════════════════════════════════════════════════════════════════

class PasteTokenModal extends Modal {
  private tokenEl!: HTMLTextAreaElement;
  constructor(app: App, private onSubmit: (token: string) => void) { super(app); }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Paste MCP bearer token" });
    contentEl.createEl("p", { text: `Get your token at ${RECKON_WEB_HOST} and paste it below.` });
    contentEl.createEl("p", {
      text: "Paste ONLY a bearer token. CompassCrew has no field for a signing key and will not " +
            "store one — your signing key is generated inside this vault and never leaves it.",
      cls: "compasscrew-token-warning",
    });
    contentEl.createEl("label", { text: "Token:" });
    this.tokenEl = contentEl.createEl("textarea");
    this.tokenEl.style.width = "100%"; this.tokenEl.rows = 3;
    const btn = contentEl.createEl("button", { text: "Save" });
    btn.onclick = () => {
      const t = this.tokenEl.value.trim();
      if (!t) { new Notice("Token is required."); return; }
      this.onSubmit(t);
      this.close();
    };
  }
  onClose() { this.contentEl.empty(); }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CHUNK: commands
// ═══════════════════════════════════════════════════════════════════════════════

export function registerTokenGrabber(plugin: Plugin, getSettings: () => McpBridgeSettings) {
  let awaitingCallback = false;
  let callbackTimer: number | null = null;

  plugin.registerObsidianProtocolHandler(CALLBACK_ROUTE, async (params) => {
    // Refuse first, read second. A forbidden parameter is an incident and the token that came
    // with it should not be trusted either.
    const offending = FORBIDDEN_CALLBACK_PARAMS.filter((p) => (params as Record<string, string>)[p]);
    if (offending.length > 0) {
      new Notice(`CompassCrew — ${FORBIDDEN_PARAM_REFUSAL}\nParameters refused: ${offending.join(", ")}`, 0);
      return;
    }
    const token = (params.token || "").trim();
    if (!token) { new Notice(`${CALLBACK_ROUTE}: missing token param.`, 8000); return; }
    try {
      await atomicWrite(plugin.app, getSettings().tokenPath || TOKEN_FILE, token + "\n");
      awaitingCallback = false;
      if (callbackTimer !== null) { window.clearTimeout(callbackTimer); callbackTimer = null; }
      new Notice("CompassCrew bearer token saved.", 6000);
    } catch (e) {
      new Notice("Token write failed: " + (e as Error).message, 8000);
    }
  });

  plugin.addCommand({
    id: "compasscrew-token-grab",
    name: "CompassCrew: grab MCP token",
    callback: async () => {
      awaitingCallback = true;
      window.open(GRAB_URL);
      new Notice(`Opened ${RECKON_WEB_HOST} — waiting up to 60s for callback…`, 8000);
      if (callbackTimer !== null) window.clearTimeout(callbackTimer);
      callbackTimer = window.setTimeout(() => {
        if (!awaitingCallback) return;
        awaitingCallback = false;
        new PasteTokenModal(plugin.app, async (token) => {
          try {
            await atomicWrite(plugin.app, getSettings().tokenPath || TOKEN_FILE, token + "\n");
            new Notice("Token saved (manual paste).", 6000);
          } catch (e) {
            new Notice("Token write failed: " + (e as Error).message, 8000);
          }
        }).open();
      }, CALLBACK_TIMEOUT_MS);
    },
  });

  plugin.addCommand({
    id: "compasscrew-token-rotate",
    name: "CompassCrew: rotate MCP token (reckon_token verb=rotate)",
    callback: async () => {
      const s = getSettings();
      const tokenPath = s.tokenPath || TOKEN_FILE;
      const { token: curToken, isDemo } = resolveToken(nodeFs, nodePath.join, vaultRoot(plugin.app as never), tokenPath);
      if (isDemo) { new Notice("Cannot rotate the public demo token. Grab a real one first.", 8000); return; }
      try {
        // The response carries {ok, token, tier, user_id}. Nothing else is read from it — in
        // particular there is no `signing_key` branch here any more, because there is no such
        // field on the wire and building for one invites a server that decides to send it.
        const data = await callReckonTool<{ ok?: boolean; token?: string; tier?: string; user_id?: string }>({
          mcpUrl: s.mcpUrl, token: curToken, tool: TOOL.TOKEN, args: { verb: "rotate" },
        });
        const newToken = (data.token || "").trim();
        if (!newToken) throw new Error("server returned no token");
        await atomicWrite(plugin.app, tokenPath, newToken + "\n");
        new Notice(`Token rotated (tier=${data.tier ?? "?"}, user=${data.user_id ?? "?"}). The old token is now invalid.`, 8000);
      } catch (e) {
        new Notice("Rotate failed: " + (e as Error).message, 10000);
      }
    },
  });

  plugin.addCommand({
    id: "compasscrew-token-fingerprint",
    name: "CompassCrew: show token fingerprint",
    callback: async () => {
      const fp = await readTokenFingerprint(plugin.app, getSettings().tokenPath || TOKEN_FILE);
      if (!fp) { new Notice("No token saved. Run 'CompassCrew: grab MCP token'.", 8000); return; }
      const when = fp.lastModified ? new Date(fp.lastModified).toISOString().slice(0, 10) : "?";
      new Notice(
        fp.isDemo
          ? `Demo token (read-only, no sign-up). Run 'CompassCrew: grab MCP token' for full access.`
          : `Token: ${fp.short}… sha8=${fp.sha8} from ${fp.source} (rotated ${when})`,
        10000,
      );
    },
  });

  plugin.addCommand({
    id: "compasscrew-purge-legacy-signing-key",
    name: "CompassCrew: purge legacy plaintext signing key",
    callback: async () => {
      const abs = nodePath.join(vaultRoot(plugin.app as never), LEGACY_PRIVATE_KEY_FILE);
      if (!nodeFs.existsSync(abs)) { new Notice(`No ${LEGACY_PRIVATE_KEY_FILE} in this vault. Nothing to purge.`, 6000); return; }
      try {
        nodeFs.unlinkSync(abs);
        new Notice(
          `Deleted ${LEGACY_PRIVATE_KEY_FILE}.\n${LEGACY_PRIVATE_KEY_REFUSAL}\n` +
          `Deleting the file does NOT un-publish the key — rotate it at the server.`, 20000);
      } catch (e) {
        new Notice(`Could not delete ${LEGACY_PRIVATE_KEY_FILE}: ${(e as Error).message}`, 10000);
      }
    },
  });
}
