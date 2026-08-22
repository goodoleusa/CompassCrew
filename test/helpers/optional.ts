/**
 * optional.ts — register modules that are nice to have in the load smoke pass but that the
 * pass must not DEPEND on being importable.
 *
 * Why this exists rather than importing them directly: several plugin modules reach for
 * Excalidraw, ExcaliBrain or a live vault at import time. A load test that imports them and
 * crashes reports "the plugin does not load" when what actually happened is "a companion plugin
 * is absent" — two different facts, and conflating them makes the smoke pass useless as a signal.
 *
 * So: attempt, and on failure record the obstacle by name. The suite reports what it could not
 * load rather than either failing or pretending it loaded everything.
 */

import type { Plugin } from "../mocks/obsidian";

/** Modules that could not be loaded, with the reason. Read by the suite, never swallowed. */
export const UNLOADABLE: Array<{ module: string; reason: string }> = [];

export function registerBearings(_plugin: Plugin): void {
  // Placeholder for optional companion-dependent registrations. Kept as a named seam so a
  // future addition has an obvious home that already reports its failures instead of throwing.
}

/** Try a registration; never throw. Returns true if it ran. */
export function tryRegister(name: string, fn: () => void): boolean {
  try { fn(); return true; }
  catch (e) { UNLOADABLE.push({ module: name, reason: (e as Error).message }); return false; }
}
