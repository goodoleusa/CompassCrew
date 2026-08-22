/**
 * coc-identity.ts — this vault's signing identity, generated IN PROCESS and never exportable.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * THE BUG THIS FILE REPLACES, stated plainly so it cannot be re-introduced by accident:
 *
 * Until plugin 2.1.0, `token-grabber.ts` opened `<host>/auth/grab?return=obsidian://…`, and its
 * protocol handler read a `signing_key` QUERY PARAMETER off the returned URI and wrote it, in
 * plaintext, to `.swarmy-user-key` in the vault root. A paste modal offered the same field as a
 * manual fallback, and `token rotate` looked for a `signing_key` in the server's response.
 *
 * That is exactly the pattern `reckon-lite/tools/revenant_spawnkey_lite.py` documents as
 * DEPRECATED in its own historical ledger ("WHAT WAS TRIED, AND WHY EACH FAILED", item 2): a
 * private key transmitted in plaintext is a bearer secret wearing a key's name. It had every
 * property that got `RECKON_SPAWN_TOKEN` retired, and worse — a URL query parameter is captured
 * by shell history, protocol-handler logs, and the OS's own URI dispatch records, then the value
 * came to REST on disk.
 *
 * It was also, measurably, dead code: the live `reckon_token verb=rotate` handler
 * (`runtime/mcp-server/tools/token.py::token_rotate`) returns `{ok, token, tier, user_id}` and
 * has never returned a signing key. The plugin was carrying the risk of a mechanism the server
 * does not implement.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * THE CORRECT MECHANISM, and why it is not a novel construction:
 *
 *   The holder generates its own keypair, in process, and the private half never leaves that
 *   process. The authority never learns it and therefore cannot leak it. What crosses any
 *   boundary is the PUBLIC half plus a PUBLIC label. Possession is proven thereafter by SIGNING
 *   a challenge, not by presenting a secret.
 *
 *   This is what SSH host keys and WebAuthn do, for the same reason: the authority's job is not
 *   to ISSUE a secret, it is to WITNESS and BIND one it never sees.
 *
 * HOW "never leaves the process" IS ENFORCED HERE, mechanically rather than by discipline:
 * the private key is generated with `extractable: false` and stored as a live `CryptoKey` handle
 * in IndexedDB. The browser will refuse `crypto.subtle.exportKey` on it — there is no code path,
 * in this plugin or in any other, that can turn that handle back into bytes. It can sign; it can
 * never be read, copied, printed, pasted, backed up or exfiltrated.
 *
 * THE COST, NAMED RATHER THAN HIDDEN: a non-extractable key cannot be backed up either. If the
 * vault's browser storage is cleared, the key is gone and a new one must be generated and
 * re-registered. That is the correct trade — a signing key that can be backed up is a signing key
 * that can be stolen — and `describeIdentity()` says so out loud rather than letting a user
 * discover it at rotation time.
 *
 * WHAT IS NOT HERE, and deliberately never will be: any function that exports, prints, writes to
 * a file, or transmits a private key, seed, mnemonic or salt. If a future change adds one, the
 * design has been reverted to the deprecated pattern whatever it is called. The invariant is one
 * line: NO VALUE THAT CAN SIGN MAY EVER LEAVE THE PROCESS THAT MADE IT.
 */

import { Notice, Plugin } from "obsidian";
import {
  ENV_SPAWN_ID,
  LEGACY_PRIVATE_KEY_FILE,
  LEGACY_PRIVATE_KEY_REFUSAL,
  TOOL,
  callReckonTool,
  resolveSpawnIdentity,
  resolveToken,
  vaultRoot,
  type McpBridgeSettings,
} from "./reckon-contract";
import * as fs from "fs";
import * as path from "path";

// ═══════════════════════════════════════════════════════════════════════════════
// ALL VARS AT TOP
// ═══════════════════════════════════════════════════════════════════════════════

const DB_NAME = "compasscrew-identity";
const DB_VERSION = 1;
const STORE = "keys";
const RECORD_ID = "signing-identity";

/**
 * Ed25519 is the algorithm the reckon COC chain's ed25519 leaves use, and the one
 * `reckon_pubkey verb=register` accepts (as SPKI PEM). Note the ecosystem's SIGNING default is
 * post-quantum (ML-DSA-65 via `pq_sign`); ed25519 is retained for SSH/Rekor and for the human
 * COC chain, which is the chain a vault holder signs into. WebCrypto has no ML-DSA, so this
 * module registers an ed25519 identity and says exactly that rather than implying PQ coverage.
 */
const ALGORITHM = "Ed25519";

/** Feature-detect rather than assume: older Electron builds ship a Chromium without Ed25519. */
export const ED25519_UNAVAILABLE_REASON =
  "this Obsidian build's WebCrypto has no Ed25519 support, so a non-extractable signing key " +
  "cannot be generated here. UNMEASURED, not failed — nothing was wrong, the capability is " +
  "absent. Update Obsidian, or sign server-side via reckon_sign verb=sign.";

export interface StoredIdentity {
  id: string;
  privateKey: CryptoKey;   // extractable: false — a handle, never bytes
  publicKey: CryptoKey;
  publicKeyPem: string;
  createdAt: string;
  algorithm: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CHUNK: IndexedDB handle store
// ═══════════════════════════════════════════════════════════════════════════════

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("indexedDB.open failed"));
  });
}

function txn<T>(db: IDBDatabase, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const req = run(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("indexedDB request failed"));
  });
}

export async function loadIdentity(): Promise<StoredIdentity | null> {
  try {
    const db = await openDb();
    const rec = await txn<StoredIdentity | undefined>(db, "readonly", (s) => s.get(RECORD_ID) as IDBRequest<StoredIdentity | undefined>);
    return rec ?? null;
  } catch { return null; }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CHUNK: key generation (the private half never becomes bytes)
// ═══════════════════════════════════════════════════════════════════════════════

export function ed25519Available(): boolean {
  return typeof crypto !== "undefined" && !!crypto.subtle && typeof crypto.subtle.generateKey === "function";
}

function pemFromSpki(spki: ArrayBuffer): string {
  const bytes = new Uint8Array(spki);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  const b64 = btoa(bin).replace(/(.{64})/g, "$1\n").trimEnd();
  return `-----BEGIN PUBLIC KEY-----\n${b64}\n-----END PUBLIC KEY-----\n`;
}

/**
 * Generate this vault's signing identity. Idempotent: an existing identity is returned untouched,
 * because silently replacing a key that a server has already witnessed would orphan every leaf it
 * signed.
 *
 * `extractable: false` on the private half is the whole mechanism. It is passed positionally to
 * `generateKey` and must never be flipped: with `true`, this file becomes the deprecated pattern
 * with extra steps.
 */
export async function ensureIdentity(): Promise<{ ok: true; identity: StoredIdentity } | { ok: false; reason: string }> {
  if (!ed25519Available()) return { ok: false, reason: ED25519_UNAVAILABLE_REASON };
  const existing = await loadIdentity();
  if (existing) return { ok: true, identity: existing };

  let pair: CryptoKeyPair;
  try {
    pair = (await crypto.subtle.generateKey({ name: ALGORITHM }, false, ["sign", "verify"])) as CryptoKeyPair;
  } catch (e) {
    return { ok: false, reason: `${ED25519_UNAVAILABLE_REASON} (${(e as Error).message})` };
  }
  // Only the PUBLIC half is ever exported. There is no matching call for the private half, here
  // or anywhere in this plugin, and the browser would refuse it regardless.
  const spki = await crypto.subtle.exportKey("spki", pair.publicKey);
  const identity: StoredIdentity = {
    id: RECORD_ID,
    privateKey: pair.privateKey,
    publicKey: pair.publicKey,
    publicKeyPem: pemFromSpki(spki),
    createdAt: new Date().toISOString(),
    algorithm: ALGORITHM,
  };
  try {
    const db = await openDb();
    await txn(db, "readwrite", (s) => s.put(identity));
  } catch (e) {
    return { ok: false, reason: `key generated but could not be persisted: ${(e as Error).message}` };
  }
  return { ok: true, identity };
}

/** Sign a challenge with the in-process key. Proves possession without revealing anything. */
export async function signChallenge(challenge: string): Promise<{ ok: true; signatureB64: string } | { ok: false; reason: string }> {
  const id = await loadIdentity();
  if (!id) return { ok: false, reason: "no signing identity in this vault — run 'CompassCrew: create signing identity' first" };
  const sig = await crypto.subtle.sign({ name: ALGORITHM }, id.privateKey, new TextEncoder().encode(challenge));
  const bytes = new Uint8Array(sig);
  let bin = ""; for (const b of bytes) bin += String.fromCharCode(b);
  return { ok: true, signatureB64: btoa(bin) };
}

/** Short, safe-to-display fingerprint of the PUBLIC half. */
export async function publicFingerprint(pem: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pem));
  return Array.from(new Uint8Array(digest)).slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ═══════════════════════════════════════════════════════════════════════════════
// CHUNK: legacy private-key sweep
// ═══════════════════════════════════════════════════════════════════════════════

export interface LegacyKeySweep { found: boolean; absPath: string; message: string }

/** Look for the plaintext private key older plugin versions wrote. Report it; never read it. */
export function sweepLegacyPrivateKey(root: string): LegacyKeySweep {
  const abs = path.join(root, LEGACY_PRIVATE_KEY_FILE);
  const found = fs.existsSync(abs);
  return { found, absPath: abs, message: found ? LEGACY_PRIVATE_KEY_REFUSAL : "" };
}

// ═══════════════════════════════════════════════════════════════════════════════
// CHUNK: Obsidian commands
// ═══════════════════════════════════════════════════════════════════════════════

export function registerCocIdentity(plugin: Plugin, getSettings: () => McpBridgeSettings) {
  // Session-start sweep: a plaintext private key on disk is not something to wait for a user to
  // go looking for. Reported once, loudly, with the remedy named.
  plugin.app.workspace.onLayoutReady(() => {
    const sweep = sweepLegacyPrivateKey(vaultRoot(plugin.app as never));
    if (sweep.found) new Notice(`CompassCrew — ${sweep.message}`, 0);
  });

  plugin.addCommand({
    id: "compasscrew-create-signing-identity",
    name: "CompassCrew: create signing identity (in-process, non-exportable)",
    callback: async () => {
      const res = await ensureIdentity();
      if (!res.ok) { new Notice(`Signing identity — UNMEASURED\n${res.reason}`, 15000); return; }
      const fp = await publicFingerprint(res.identity.publicKeyPem);
      new Notice(
        `Signing identity ready.\n` +
        `  algorithm:   ${res.identity.algorithm}\n` +
        `  public fp:   ${fp}\n` +
        `  private key: non-extractable, in-process only — it cannot be exported, backed up, ` +
        `or transmitted, by this plugin or any other.\n` +
        `Register the PUBLIC half with 'CompassCrew: register public key'.`,
        15000,
      );
    },
  });

  plugin.addCommand({
    id: "compasscrew-register-public-key",
    name: "CompassCrew: register public key with reckon (reckon_pubkey verb=register)",
    callback: async () => {
      const res = await ensureIdentity();
      if (!res.ok) { new Notice(`Register — UNMEASURED\n${res.reason}`, 15000); return; }
      const s = getSettings();
      const { token } = resolveToken(fs, path.join, vaultRoot(plugin.app as never), s.tokenPath);
      const githubUser = (process.env.GITHUB_USER || process.env.USER || "").trim();
      if (!githubUser) {
        new Notice("Register — UNMEASURED\nreckon_pubkey verb=register needs a github_user; set $GITHUB_USER.", 12000);
        return;
      }
      try {
        // Only `publicKeyPem` crosses the wire. There is no argument on this call that could
        // carry a private half, and the server's handler does not accept one.
        const out = await callReckonTool<Record<string, unknown>>({
          mcpUrl: s.mcpUrl, token, tool: TOOL.PUBKEY,
          args: { verb: "register", github_user: githubUser, pubkey_pem: res.identity.publicKeyPem },
        });
        new Notice(out["ok"] ? `Public key registered for ${githubUser}.` : `Register failed: ${JSON.stringify(out)}`, 12000);
      } catch (e) {
        new Notice(`Register failed: ${(e as Error).message}`, 12000);
      }
    },
  });

  plugin.addCommand({
    id: "compasscrew-identity-status",
    name: "CompassCrew: signing + spawn identity status",
    callback: async () => {
      const id = await loadIdentity();
      const fp = id ? await publicFingerprint(id.publicKeyPem) : null;
      const spawn = resolveSpawnIdentity();
      const sweep = sweepLegacyPrivateKey(vaultRoot(plugin.app as never));
      // The two axes are reported as SEPARATE rows and never conflated into one verdict:
      // "which key does this vault hold" and "which spawn slot does this hand hold" are
      // orthogonal facts (salt taxonomy: SPAWN axis vs the rest).
      const lines = [
        `SIGNING KEY   ${id ? `PASS — ${id.algorithm}, public fp ${fp}, non-extractable` : "UNMEASURED — no identity generated in this vault yet"}`,
        `SPAWN SLOT    ${spawn.verdict} — ${spawn.detail}`,
        `LEGACY KEY    ${sweep.found ? `FAIL — ${LEGACY_PRIVATE_KEY_FILE} present; ${LEGACY_PRIVATE_KEY_REFUSAL}` : "PASS — no plaintext private key on disk"}`,
        ``,
        `${ENV_SPAWN_ID} is a PUBLIC label. No private key is read from, or written to, the`,
        `environment, a file, a log or a transcript by this plugin.`,
      ];
      console.log(lines.join("\n"));
      new Notice(lines.join("\n"), 25000);
    },
  });
}
