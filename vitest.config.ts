import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

/**
 * vitest.config.ts — test config for the CompassCrew plugin.
 *
 * The single load-bearing line is the `obsidian` alias. Obsidian's API is not on npm as a real
 * implementation — the `obsidian` package is types only — so any test that imports plugin source
 * would fail to resolve it. Aliasing to `test/mocks/obsidian.ts` gives every test a recording
 * fake that captures the plugin's actual registration surface.
 *
 * Environment is `node`, not `jsdom`: the code under test needs real WebCrypto (Node 22 has
 * Ed25519; jsdom does not) far more than it needs a DOM, and the DOM surface the plugin touches
 * is small enough to fake precisely in the mock. `fake-indexeddb/auto` is imported per-suite
 * rather than globally so a suite that does NOT want persistence can say so.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    setupFiles: ["test/setup.ts"],
    // Ed25519 keygen plus a live-server probe with its own timeout; the default 5s is tight.
    testTimeout: 20_000,
    reporters: ["verbose"],
  },
  resolve: {
    alias: {
      obsidian: resolve(__dirname, "test/mocks/obsidian.ts"),
    },
  },
});
