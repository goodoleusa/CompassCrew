/**
 * signing.test.ts — DOES THE SIGNING SURFACE ACTUALLY WORK?
 *
 * This file exists because that was asked as a direct yes/no question, and the only answer worth
 * giving to it is one produced by running the code. Reading `coc-identity.ts` and concluding "it
 * looks right" is exactly the inference this repo's doctrine says not to hand back.
 *
 * So: these tests drive the REAL commands — the ones a user sees in the palette — against a real
 * WebCrypto implementation (Node 22's, the same Web Crypto API Electron exposes) and a real
 * IndexedDB implementation (`fake-indexeddb`, an in-memory but spec-complete one). Nothing about
 * key generation, non-extractability, signing, or persistence is stubbed. The only faked pieces
 * are the Obsidian shell around them.
 *
 * WHAT IS STILL UNMEASURED HERE, said out loud rather than left to be assumed: this suite does
 * not prove that Obsidian's *own* Electron build exposes Ed25519 (Chromium has since 133; older
 * Obsidian builds may not), and it does not verify a signature against a LIVE reckon server. The
 * first is feature-detected at runtime and reported as UNMEASURED-with-reason rather than
 * failing; the second needs a server and is covered by `test/coc-live.test.ts`.
 */

import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import { webcrypto } from "node:crypto";

import { Plugin, App, Notice } from "./mocks/obsidian";
import {
  registerCocIdentity, ensureIdentity, loadIdentity, signChallenge,
  publicFingerprint, ed25519Available, sweepLegacyPrivateKey,
} from "../src/coc-identity";
import { resolveSpawnIdentity } from "../src/reckon-contract";

beforeAll(() => {
  // Electron's renderer exposes WebCrypto as `crypto`. Node needs it hoisted onto globalThis.
  if (!globalThis.crypto?.subtle) (globalThis as { crypto?: unknown }).crypto = webcrypto;
});

const SETTINGS = { mcpUrl: "http://127.0.0.1:1", tokenPath: ".compasscrew-token", refreshSeconds: 60 };

describe("signing identity — key generation", () => {
  beforeEach(() => Notice.reset());

  it("Ed25519 is available in this runtime (feature-detected, not assumed)", () => {
    expect(ed25519Available()).toBe(true);
  });

  it("ensureIdentity() produces a REAL keypair, not a stub", async () => {
    const res = await ensureIdentity();
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.identity.algorithm).toBe("Ed25519");
    expect(res.identity.publicKeyPem).toMatch(/^-----BEGIN PUBLIC KEY-----/);
    expect(res.identity.publicKeyPem).toMatch(/-----END PUBLIC KEY-----/);
    // A CryptoKey, not a placeholder object.
    expect(res.identity.privateKey.type).toBe("private");
    expect(res.identity.publicKey.type).toBe("public");
  });

  it("THE INVARIANT: the private half is non-extractable and the runtime REFUSES to export it", async () => {
    const res = await ensureIdentity();
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.identity.privateKey.extractable).toBe(false);
    // Not "we choose not to call export" — the platform refuses the call. This is the whole
    // mechanism; if this assertion ever passes an export, the design has silently reverted to
    // the deprecated pattern regardless of what the code around it says.
    await expect(
      crypto.subtle.exportKey("pkcs8", res.identity.privateKey),
    ).rejects.toThrow();
  });

  it("is idempotent — a second call returns the SAME key, never a silent replacement", async () => {
    const a = await ensureIdentity();
    const b = await ensureIdentity();
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(b.identity.publicKeyPem).toBe(a.identity.publicKeyPem);
    expect(b.identity.createdAt).toBe(a.identity.createdAt);
  });

  it("persists across a reload — loadIdentity() finds it in a fresh read", async () => {
    const made = await ensureIdentity();
    const loaded = await loadIdentity();
    expect(loaded).not.toBeNull();
    if (!made.ok || !loaded) return;
    expect(loaded.publicKeyPem).toBe(made.identity.publicKeyPem);
    expect(loaded.privateKey.extractable).toBe(false);
  });
});

describe("signing identity — it can actually SIGN", () => {
  it("signChallenge() produces a signature that VERIFIES against the public half", async () => {
    const made = await ensureIdentity();
    expect(made.ok).toBe(true);
    if (!made.ok) return;

    const challenge = "target-bound-single-use-challenge-" + Date.now();
    const sig = await signChallenge(challenge);
    expect(sig.ok).toBe(true);
    if (!sig.ok) return;

    const raw = Uint8Array.from(atob(sig.signatureB64), (c) => c.charCodeAt(0));
    expect(raw.length).toBe(64); // ed25519 signature width
    const verified = await crypto.subtle.verify(
      { name: "Ed25519" }, made.identity.publicKey, raw, new TextEncoder().encode(challenge),
    );
    expect(verified).toBe(true);
  });

  it("a signature does NOT verify against a DIFFERENT message (the check has teeth)", async () => {
    const made = await ensureIdentity();
    if (!made.ok) return;
    const sig = await signChallenge("message-a");
    if (!sig.ok) return;
    const raw = Uint8Array.from(atob(sig.signatureB64), (c) => c.charCodeAt(0));
    const verified = await crypto.subtle.verify(
      { name: "Ed25519" }, made.identity.publicKey, raw, new TextEncoder().encode("message-b"),
    );
    expect(verified).toBe(false);
  });

  it("the public fingerprint is stable and short enough to read aloud", async () => {
    const made = await ensureIdentity();
    if (!made.ok) return;
    const a = await publicFingerprint(made.identity.publicKeyPem);
    const b = await publicFingerprint(made.identity.publicKeyPem);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe("the REGISTERED COMMANDS a user actually runs", () => {
  let plugin: Plugin;

  beforeEach(() => {
    Notice.reset();
    plugin = new Plugin(new App());
    registerCocIdentity(plugin as never, () => SETTINGS);
  });

  it("registers all three custody commands", () => {
    const ids = plugin.commands.map((c) => c.id);
    expect(ids).toContain("compasscrew-create-signing-identity");
    expect(ids).toContain("compasscrew-register-public-key");
    expect(ids).toContain("compasscrew-identity-status");
  });

  it("'create signing identity' runs and reports a real fingerprint + non-exportability", async () => {
    await plugin.run("compasscrew-create-signing-identity");
    const notices = Notice.log.join("\n");
    expect(notices).toContain("Signing identity ready");
    expect(notices).toContain("Ed25519");
    expect(notices).toMatch(/public fp:\s+[0-9a-f]{16}/);
    expect(notices).toContain("non-extractable");
    expect(notices).not.toContain("UNMEASURED");
  });

  it("'signing + spawn identity status' reads REAL state — not a stub", async () => {
    await plugin.run("compasscrew-create-signing-identity");
    Notice.reset();
    await plugin.run("compasscrew-identity-status");
    const out = Notice.log.join("\n");
    const id = await loadIdentity();
    expect(id).not.toBeNull();
    // The fingerprint printed must be the fingerprint of the key actually in the store.
    expect(out).toContain(await publicFingerprint(id!.publicKeyPem));
    expect(out).toContain("SIGNING KEY   PASS");
    // Two axes, two rows — never merged into one verdict.
    expect(out).toMatch(/SPAWN SLOT\s+(PASS|FAIL|UNMEASURED)/);
    expect(out).toMatch(/LEGACY KEY\s+(PASS|FAIL)/);
  });

  it("'register public key' fails LOUDLY against an unreachable server, never silently", async () => {
    process.env.GITHUB_USER = "test-user";
    await plugin.run("compasscrew-create-signing-identity");
    Notice.reset();
    await plugin.run("compasscrew-register-public-key");
    const out = Notice.log.join("\n");
    expect(out).toMatch(/Register failed|UNMEASURED/);
    // And it must never have leaked anything key-shaped into the message.
    expect(out).not.toContain("BEGIN PRIVATE KEY");
  });
});

describe("deprecated credential patterns are REFUSED, not ignored", () => {
  it("RECKON_SPAWN_KEY yields FAIL and never echoes the secret", () => {
    const r = resolveSpawnIdentity({ RECKON_SPAWN_KEY: "cafebabe".repeat(8) });
    expect(r.verdict).toBe("FAIL");
    expect(r.spawnId).toBeNull();
    expect(r.detail).toContain("RECKON_SPAWN_KEY");
    expect(r.detail).not.toContain("cafebabe");
  });

  it("RECKON_SPAWN_TOKEN yields FAIL and names itself", () => {
    const r = resolveSpawnIdentity({ RECKON_SPAWN_TOKEN: "tok" });
    expect(r.verdict).toBe("FAIL");
    expect(r.detail).toContain("RECKON_SPAWN_TOKEN");
  });

  it("a public RECKON_SPAWN_ID passes; nothing at all is UNMEASURED, never clean", () => {
    expect(resolveSpawnIdentity({ RECKON_SPAWN_ID: "W2-lane" }).verdict).toBe("PASS");
    expect(resolveSpawnIdentity({}).verdict).toBe("UNMEASURED");
  });

  it("sweepLegacyPrivateKey reports absence as PASS and does not invent a file", () => {
    const sweep = sweepLegacyPrivateKey("/tmp/definitely-not-a-vault-" + Date.now());
    expect(sweep.found).toBe(false);
    expect(sweep.message).toBe("");
  });
});
