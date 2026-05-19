import { Notice, Plugin } from "obsidian";

/**
 * Compass overlay — powered by ExcaliBrain.
 *
 * Why ExcaliBrain rather than Juggl: ExcaliBrain is purpose-built for
 * field-based hierarchy navigation. The user configures which frontmatter
 * fields are "parents," "children," and "friends," and ExcaliBrain renders
 * a clean directional graph natively. This maps exactly onto our compass
 * bearings:
 *
 *   N (up / unblock predecessor)  → ExcaliBrain "parents" field: up
 *   S (down / conclude downstream)→ ExcaliBrain "children" field: down, next
 *   E (parallel sister)           → ExcaliBrain "friends" field: same
 *   W (return to baseline)        → ExcaliBrain "parents" field: up (alias)
 *
 * On first run, we write a recommended ExcaliBrain configuration that wires
 * those field mappings + bearing colors. ExcaliBrain integrates with
 * Excalidraw for the rendered view, which is why both plugins are required.
 */

interface ExcaliBrainConfig {
  hierarchy: {
    parents: string[];
    children: string[];
    friends: string[];
  };
  styles?: {
    parents?: { strokeColor?: string };
    children?: { strokeColor?: string };
    friends?: { strokeColor?: string };
  };
}

const FAERIE_EXCALIBRAIN_CONFIG: ExcaliBrainConfig = {
  hierarchy: {
    parents: ["up", "north", "unblocks"],
    children: ["down", "next", "south", "ships"],
    friends: ["same", "east", "parallel", "sister"],
  },
  styles: {
    parents:  { strokeColor: "#C73E1D" }, // north red
    children: { strokeColor: "#2E8540" }, // south green
    friends:  { strokeColor: "#FF8E3C" }, // east orange
  },
};

export function registerCompassOverlay(plugin: Plugin) {
  plugin.addCommand({
    id: "faerie-compass-overlay",
    name: "Faerie: compass overlay (ExcaliBrain bearings view)",
    callback: async () => {
      const file = plugin.app.workspace.getActiveFile();
      if (!file) {
        new Notice("Open a note first.");
        return;
      }

      const anyApp = plugin.app as any;
      const excaliBrain = anyApp.plugins?.plugins?.["excalibrain"];
      if (!excaliBrain) {
        new Notice(
          "ExcaliBrain not installed. Run 'Faerie: doctor' (requires ExcaliBrain + Excalidraw).",
          10000
        );
        return;
      }

      // Try ExcaliBrain's known command IDs.
      const candidates = [
        "excalibrain:open",
        "excalibrain:open-pinned",
        "excalibrain:open-and-pin",
      ];
      for (const id of candidates) {
        if (anyApp.commands?.commands?.[id]) {
          anyApp.commands.executeCommandById(id);
          document.body.classList.add("faerie-compass-overlay-active");
          setTimeout(
            () => document.body.classList.remove("faerie-compass-overlay-active"),
            60_000
          );
          new Notice(`Compass (ExcaliBrain): ${file.basename} — bearings N/S/E/W.`);
          return;
        }
      }
      new Notice("Could not find ExcaliBrain command. Open it manually.", 6000);
    },
  });

  plugin.addCommand({
    id: "faerie-write-excalibrain-config",
    name: "Faerie: write recommended ExcaliBrain config (bearings)",
    callback: async () => {
      const anyApp = plugin.app as any;
      const excaliBrain = anyApp.plugins?.plugins?.["excalibrain"];
      if (!excaliBrain) {
        new Notice("ExcaliBrain not installed.");
        return;
      }
      // ExcaliBrain stores settings on plugin.settings; merge our values.
      try {
        const s = excaliBrain.settings;
        if (!s) {
          new Notice("Could not read ExcaliBrain settings.");
          return;
        }
        // ExcaliBrain v0.2.x uses these keys: hierarchy: { parents, children, friends }
        s.hierarchy = {
          ...(s.hierarchy || {}),
          parents: Array.from(new Set([...(s.hierarchy?.parents || []), ...FAERIE_EXCALIBRAIN_CONFIG.hierarchy.parents])),
          children: Array.from(new Set([...(s.hierarchy?.children || []), ...FAERIE_EXCALIBRAIN_CONFIG.hierarchy.children])),
          friends: Array.from(new Set([...(s.hierarchy?.friends || []), ...FAERIE_EXCALIBRAIN_CONFIG.hierarchy.friends])),
        };
        await excaliBrain.saveSettings?.();
        new Notice(
          "ExcaliBrain bearings hierarchy configured: parents=up/north/unblocks, children=down/next/south/ships, friends=same/east/parallel/sister.",
          10000
        );
      } catch (e) {
        new Notice("ExcaliBrain config write failed: " + (e as Error).message, 8000);
      }
    },
  });
}
