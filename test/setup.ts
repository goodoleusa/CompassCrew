/**
 * test/setup.ts — the smallest browser-ish globals the plugin touches at REGISTRATION time.
 *
 * WHY NOT jsdom. The tests that matter most here need real WebCrypto Ed25519 (jsdom has no
 * SubtleCrypto worth the name) far more than they need a real DOM. The DOM surface the plugin
 * touches during `onload` is tiny and entirely enumerable: `document` for delegated event
 * listeners, `window` for timers and `open`. Faking exactly that keeps the crypto real, which is
 * where the assertions with teeth live.
 *
 * WHAT THIS DELIBERATELY DOES NOT CLAIM: nothing here proves the plugin RENDERS correctly. These
 * globals exist so registration can run; rendering fidelity is out of scope for this suite and is
 * reported as such rather than implied by a green.
 */

import { webcrypto } from "node:crypto";
import { indexedDB as fakeIndexedDB, IDBKeyRange as FakeIDBKeyRange } from "fake-indexeddb";

const g = globalThis as Record<string, unknown>;

if (!g.crypto || !(g.crypto as Crypto).subtle) g.crypto = webcrypto;

if (!g.document) {
  g.document = {
    addEventListener() {}, removeEventListener() {},
    getElementById: () => null,
    createElement: () => ({
      style: {}, id: "", textContent: "",
      appendChild() {}, remove() {}, setAttribute() {}, addEventListener() {},
    }),
    head: { appendChild() {}, removeChild() {} },
    body: { appendChild() {}, removeChild() {} },
    querySelector: () => null,
    querySelectorAll: () => [],
  };
}

if (!g.window) {
  g.window = {
    setTimeout: (fn: () => void, ms?: number) => setTimeout(fn, ms) as unknown as number,
    clearTimeout: (id: number) => clearTimeout(id as unknown as NodeJS.Timeout),
    setInterval: (fn: () => void, ms?: number) => setInterval(fn, ms) as unknown as number,
    clearInterval: (id: number) => clearInterval(id as unknown as NodeJS.Timeout),
    // Recorded rather than executed: a test must be able to assert that the token grab opened a
    // URL without this suite actually launching a browser.
    open: (url: string) => { (g.__openedUrls as string[]).push(url); return null; },
    print() {},
    getComputedStyle: () => ({}),
  };
}

g.__openedUrls = [];

// IndexedDB, assigned EXPLICITLY rather than via `fake-indexeddb/auto`.
//
// This is not a style preference — it is a bug this suite already hit. `auto` inspects the
// environment and, when a `window` global exists, installs itself onto `window` instead of
// `globalThis`. The moment the `window` shim above was added, `auto` stopped populating
// `globalThis.indexedDB`, `ensureIdentity()` began returning
// {ok:false, reason:"…could not be persisted: indexedDB is not defined"}, and five signing
// tests that had been genuinely green went red. Assigning both targets removes the guess.
g.indexedDB = fakeIndexedDB;
g.IDBKeyRange = FakeIDBKeyRange;
(g.window as Record<string, unknown>).indexedDB = fakeIndexedDB;
(g.window as Record<string, unknown>).IDBKeyRange = FakeIDBKeyRange;

if (!g.btoa) g.btoa = (s: string) => Buffer.from(s, "binary").toString("base64");
if (!g.atob) g.atob = (s: string) => Buffer.from(s, "base64").toString("binary");
