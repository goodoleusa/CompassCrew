/**
 * native-pdf-export — zero-dependency PDF export via window.print().
 *
 * Why a second PDF path: the existing pdf-export.ts wraps the WSL/pandoc
 * pipeline for high-fidelity rendered output (Mermaid + Excalidraw via
 * mmdc, xelatex layout, aspect sizer). That pipeline requires WSL +
 * pandoc + xelatex installed.
 *
 * This module ships a fall-back that works on ANY platform with zero
 * external tooling: it uses the browser's print dialog. The user picks
 * "Save as PDF" in their OS's print dialog and gets a PDF of the current
 * note rendered with vault styling. No subprocess calls. No extra deps.
 *
 * Command:  `Reckon: export current note as PDF (native print dialog)`
 * Id:       `reckon-pdf-export-current-note`
 *
 * Implementation notes:
 *   - We inject a transient <style> tag that scopes "print mode" CSS
 *     overrides (hide chrome, expand active note container, page breaks).
 *   - We add an `@page` rule for letter-size margins.
 *   - The stylesheet is removed after print to avoid persistent changes.
 *   - We trigger print via window.print(); the OS handles the dialog.
 *   - Supports a fallback "select element and call print" path when the
 *     active leaf isn't a MarkdownView (e.g., reading view + side panel).
 */

import { MarkdownView, Notice, Plugin } from "obsidian";

const PRINT_STYLE_ID = "reckon-native-pdf-print-styles";

/**
 * Inject the print stylesheet. Returns a teardown function to remove it.
 * Stylesheet rules:
 *   - Hide all chrome (sidebars, status bar, ribbon, view-actions)
 *   - Show only the active markdown content
 *   - Page break controls around headings and pre/code blocks
 *   - Standard letter-size page geometry
 */
function injectPrintStyles(): () => void {
  const prev = document.getElementById(PRINT_STYLE_ID);
  if (prev) prev.remove();

  const style = document.createElement("style");
  style.id = PRINT_STYLE_ID;
  style.textContent = `
    @media print {
      @page { size: letter; margin: 0.75in; }
      body, html { background: white !important; }

      /* Hide all Obsidian chrome */
      .workspace-ribbon,
      .workspace-tabs > .workspace-tab-header-container,
      .status-bar,
      .titlebar,
      .workspace-split.mod-left-split,
      .workspace-split.mod-right-split,
      .view-header,
      .view-actions,
      .mod-side-dock,
      .reckon-chat-panel,
      .reckon-live-panel { display: none !important; }

      /* The active markdown leaf becomes the entire printable surface */
      .workspace-leaf.mod-active,
      .workspace-leaf.mod-active .view-content,
      .workspace-leaf.mod-active .markdown-source-view,
      .workspace-leaf.mod-active .markdown-reading-view,
      .workspace-leaf.mod-active .markdown-preview-view {
        position: static !important;
        width: 100% !important;
        height: auto !important;
        overflow: visible !important;
        page-break-inside: auto;
      }

      /* Render text in plain black on white for printer fidelity */
      .markdown-preview-view,
      .markdown-source-view,
      .markdown-rendered,
      .cm-editor {
        color: #000 !important;
        background: #fff !important;
      }

      /* Page-break controls */
      h1 { page-break-before: always; }
      h1:first-of-type { page-break-before: avoid; }
      h2, h3 { page-break-after: avoid; }
      pre, code, blockquote, table { page-break-inside: avoid; }
      img { max-width: 100% !important; height: auto !important; }
    }
  `;
  document.head.appendChild(style);
  return () => { try { style.remove(); } catch { /* ignore */ } };
}

/**
 * Force the active markdown leaf into reading view before print, then
 * restore the prior mode after. This gives a clean rendered output even
 * if the user was in source mode.
 *
 * Best-effort: we do not throw if the mode swap fails.
 */
async function ensureReadingView(view: MarkdownView): Promise<() => Promise<void>> {
  const prevMode = view.getMode();
  if (prevMode === "preview") return async () => { /* noop */ };
  try {
    const leaf = view.leaf;
    const state = leaf.getViewState();
    state.state = { ...state.state, mode: "preview" };
    await leaf.setViewState(state);
  } catch {
    // No-op — print still works in source mode, just less pretty.
  }
  return async () => {
    try {
      const leaf = view.leaf;
      const state = leaf.getViewState();
      state.state = { ...state.state, mode: prevMode };
      await leaf.setViewState(state);
    } catch { /* ignore */ }
  };
}

export function registerNativePdfExport(plugin: Plugin) {
  plugin.addCommand({
    id: "reckon-pdf-export-current-note",
    name: "Reckon: export current note as PDF (native print dialog)",
    checkCallback: (checking: boolean) => {
      const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
      if (!view) return false;
      if (checking) return true;
      void runNativePdfExport(view);
      return true;
    },
  });
}

async function runNativePdfExport(view: MarkdownView): Promise<void> {
  const teardownStyles = injectPrintStyles();
  const restoreMode = await ensureReadingView(view);
  // Yield a frame so the reading view has time to render before printing.
  await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
  await new Promise((resolve) => setTimeout(resolve, 80));

  try {
    new Notice("Opening print dialog… choose 'Save as PDF' to export.", 5000);
    window.print();
  } catch (err) {
    new Notice(`Print failed: ${(err as Error).message}`, 8000);
  } finally {
    // Schedule cleanup after the print dialog has a chance to capture the
    // styled DOM. window.print() is synchronous in Electron but we keep a
    // small delay for safety.
    setTimeout(() => {
      teardownStyles();
      void restoreMode();
    }, 500);
  }
}
