import { App, Notice, Plugin, TFile } from "obsidian";
import { Bearing, BEARING_TO_BC_FIELD } from "./bearings";

/**
 * Breadcrumbs threading integration.
 *
 * Bearing → field mapping is imported from src/bearings.ts (the canonical
 * NSEW ontology module). Do NOT define mappings locally.
 *
 * Breadcrumbs plugin builds a hierarchy from frontmatter fields:
 *   - up    (parent / north — unblock predecessor)
 *   - down  (children / south — concluded deliverables below)
 *   - next  (south sibling — next-in-thread)
 *   - prev  (north sibling — previous-in-thread)
 *   - same  (east — parallel sister work)
 */

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
  const linkVal = `[[${basenameNoExt(targetPath)}]]`;
  await app.fileManager.processFrontMatter(file, (fm) => {
    const existing = fm[field];
    if (existing == null) fm[field] = [linkVal];
    else if (Array.isArray(existing)) {
      if (!existing.includes(linkVal)) existing.push(linkVal);
    } else if (typeof existing === "string") {
      if (!existing.includes(basenameNoExt(targetPath))) fm[field] = [existing, linkVal];
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
      const cb = await navigator.clipboard.readText().catch(() => "");
      const m = cb.match(/\[\[([^\]|#]+)/);
      const target = m ? m[1] : cb.trim();
      if (!target) { new Notice("Clipboard has no [[link]] or page name."); return; }
      await addBreadcrumbThread(plugin.app, file, BEARING_TO_BC_FIELD.S, target);
      new Notice(`Breadcrumbs: next → ${target}`);
    },
  });

  (plugin as any).faerieAddBreadcrumb = async (file: TFile, bearing: Bearing, dest: string) => {
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
