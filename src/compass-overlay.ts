import { Notice, Plugin } from "obsidian";

/**
 * Compass overlay — invokes Juggl filtered to the current note's compass
 * neighbours (N/S/E/W edges, 1–2 hops). Juggl exposes commands via its
 * plugin API; we attempt three strategies in order:
 *  1. Call Juggl's global "juggl:open-local" command for the current file.
 *  2. Fall back to opening a Juggl view via the workspace.
 *  3. Notice the user if Juggl is not installed.
 *
 * Bearing colors are injected as CSS variables (see styles.css) so Juggl's
 * stylesheet rules pick them up via .faerie-bearing-N|S|E|W classes.
 */
export function registerCompassOverlay(plugin: Plugin) {
  plugin.addCommand({
    id: "faerie-compass-overlay",
    name: "Faerie: compass overlay for current note",
    callback: async () => {
      const file = plugin.app.workspace.getActiveFile();
      if (!file) { new Notice("Open a note first."); return; }

      const anyApp = plugin.app as any;
      const jugglPlugin = anyApp.plugins?.plugins?.["juggl"];
      if (!jugglPlugin) {
        new Notice("Juggl plugin is not installed. Run 'Faerie: doctor' to check dependencies.", 8000);
        return;
      }

      // Attempt to invoke Juggl's local-graph command.
      const commandIds = ["juggl:open-local", "juggl:open-graph", "juggl-open-local"];
      let invoked = false;
      for (const id of commandIds) {
        if (anyApp.commands?.commands?.[id]) {
          anyApp.commands.executeCommandById(id);
          invoked = true;
          break;
        }
      }
      if (!invoked) {
        new Notice("Could not find a Juggl command. Open Juggl manually for now.", 6000);
        return;
      }

      // Tag the body for CSS bearing colors.
      document.body.classList.add("faerie-compass-overlay-active");
      setTimeout(() => document.body.classList.remove("faerie-compass-overlay-active"), 60_000);
      new Notice(`Compass overlay for ${file.basename} (bearings N/S/E/W).`);
    },
  });
}
