import { App, Notice, Plugin, TFile } from "obsidian";

/**
 * Breadcrumbs threading integration.
 *
 * Breadcrumbs plugin (SkepticMystic/breadcrumbs) builds a hierarchy from
 * frontmatter fields. It supports both YAML-list values (newer) and
 * comma-separated strings. Default canonical fields used by Faerie:
 *   - up    (parent / north — unblock predecessor)
 *   - down  (children / south — concluded deliverables below)
 *   - next  (south sibling — next-in-thread)
 *   - prev  (north sibling — previous-in-thread)
 *   - same  (east — parallel sister work)
 *
 * Threading view: Breadcrumbs exposes a "trail" rendered as a thread of
 * crumbs across the top of each note (List, Path, or Grid). We add commands
 * that maintain the thread automatically when trail-refs are created and
 * provide a "thread navigator" view via Breadcrumbs commands.
 *
 * Bearing → field map (canonical, mirrors compass DAG):
 *   N → up / prev   S → down / next   E → same   W → up (returns to HQ)
 */

export const BEARING_TO_BC_FIELD: Record<"N" | "S" | "E" | "W", string> = {
  N: "up",
  S: "next",
  E: "same",
  W: "up",
};

function basenameNoExt(p: string): string {
  const b = p.split("/").pop() || p;
  return b.endsWith(".md") ? b.slice(0, -3) : b;
}

async function addBreadcrumbThread(
  app: App,
  file: TFile,
  field: string,
  targetPath: string,
): Promise<void> {
  const link = `"[[${basenameNoExt(targetPath)}]]"`;
  await app.fileManager.processFrontMatter(file, (fm) => {
    const existing = fm[field];
    if (existing == null) {
      fm[field] = [link.replace(/^"|"$/g, "")];
    } else if (Array.isArray(existing)) {
      const linkVal = link.replace(/^"|"$/g, "");
      if (!existing.includes(linkVal)) existing.push(linkVal);
    } else if (typeof existing === "string") {
      if (!existing.includes(basenameNoExt(targetPath))) {
        fm[field] = [existing, link.replace(/^"|"$/g, "")];
      }
    }
  });
}

export function registerBreadcrumbsThreading(plugin: Plugin) {
  plugin.addCommand({
    id: "faerie-thread-add",
    name: "Faerie: add Breadcrumbs thread link (bearing → up/next/same)",
    callback: async () => {
      const file = plugin.app.workspace.getActiveFile();
      if (!file) { new Notice("Open a note first."); return; }
      // Default: thread S (next) to clipboard if it parses as [[Link]],
      // otherwise prompt with last-selected text.
      const cb = await navigator.clipboard.readText().catch(() => "");
      const m = cb.match(/\[\[([^\]|#]+)/);
      const target = m ? m[1] : cb.trim();
      if (!target) { new Notice("Clipboard has no [[link]] or page name."); return; }
      await addBreadcrumbThread(plugin.app, file, BEARING_TO_BC_FIELD.S, target);
      new Notice(`Breadcrumbs: next → ${target}`);
    },
  });

  // Helper exposed for trail-refs to call when a bearing ref is created.
  (plugin as any).faerieAddBreadcrumb = async (file: TFile, bearing: "N"|"S"|"E"|"W", dest: string) => {
    const field = BEARING_TO_BC_FIELD[bearing];
    if (!field) return;
    await addBreadcrumbThread(plugin.app, file, field, dest);
  };

  plugin.addCommand({
    id: "faerie-thread-open",
    name: "Faerie: open Breadcrumbs trail view",
    callback: () => {
      const anyApp = plugin.app as any;
      const candidates = ["breadcrumbs:open-trail-view", "breadcrumbs:show-trail", "breadcrumbs:open-matrix-view"];
      for (const id of candidates) {
        if (anyApp.commands?.commands?.[id]) {
          anyApp.commands.executeCommandById(id);
          return;
        }
      }
      new Notice("Breadcrumbs plugin command not found. Install/enable breadcrumbs (run Faerie: doctor).", 8000);
    },
  });
}
