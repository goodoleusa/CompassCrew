/**
 * Hive PDF Export — Obsidian Plugin
 * Wraps the /pdf CLI pipeline: mmdc → 9x_pdf_aspect_sizer.py → pandoc/xelatex
 * All subprocess calls go through WSL (wsl.exe) on Windows.
 * No inference at runtime — deterministic pipeline only.
 *
 * v1.1.0 additions:
 *   - Excalidraw embed pipeline (ExcalidrawAutomate API → PNG → aspect sizer)
 *   - "Insert Hive diagram from template" command + SuggestModal
 *   - Settings: includeExcalidraw toggle, excalidrawScale, templateFolder (read-only)
 */

import {
  App,
  FuzzySuggestModal,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
} from "obsidian";
import { exec, ExecOptions } from "child_process";
import { promisify } from "util";
import * as path from "path";
import * as fs from "fs";

const execAsync = promisify(exec);

// ─── Settings ──────────────────────────────────────────────────────────────

interface HivePdfSettings {
  outputDir: string;            // "" = same folder as note
  filenamePattern: string;      // e.g. "{basename}-{timestamp}.pdf"
  mmdcScale: number;            // mmdc -s flag
  openAfterBuild: boolean;
  overwriteExisting: boolean;
  wslDistro: string;            // "" = default distro
  includeExcalidraw: boolean;   // include ![[*.excalidraw]] in PDF
  excalidrawScale: number;      // PNG export scale for Excalidraw
  // ── Readability (operator-tunable per doc type 2026-05-23) ──────────────
  fontSize: string;             // pandoc -V fontsize (e.g. "11pt" notes, "14pt" business docs)
  marginInches: number;         // pandoc -V geometry:margin (e.g. 1.0 notes, 0.75 business docs)
  mainFont: string;             // pandoc -V mainfont (xelatex requires system font name)
  sansFont: string;             // pandoc -V sansfont
  monoFont: string;             // pandoc -V monofont
  useExternalLatexTemplate: boolean;  // false = inline -V flags only (cleaner); true = use latexTemplatePath
  latexTemplatePath: string;    // ignored when useExternalLatexTemplate=false
  latexHeaderPath: string;      // --include-in-header path; empty = use faerie2 print-ready-header.tex if found
  preset: "note" | "business" | "academic" | "comparison" | "custom";  // preset selector (drives the above)
}

// ─── Preset parity contract with faerie2/.agents/skills/pdf ───────────────────
// IMPORTANT: Presets here MUST stay in lockstep with the headless skill at:
//   faerie2/.agents/skills/pdf/scripts/build_pdf.sh
// Both pipelines share `print-ready-header.tex` and the same shaded-stub.tex.
// When you add or modify a preset, update BOTH so an agent running headlessly
// (e.g. on the swarmy VPS) produces visually-identical output to a user
// exporting from inside Obsidian.
// ─────────────────────────────────────────────────────────────────────────────

// Presets: clean defaults per common use case. Operator can override individually.
function applyPreset(s: HivePdfSettings): HivePdfSettings {
  if (s.preset === "business") {
    // Client-facing decks, proposals — larger type, tighter margins
    return { ...s, fontSize: "14pt", marginInches: 0.75, mainFont: "DejaVu Sans",
             sansFont: "DejaVu Sans", monoFont: "DejaVu Sans Mono",
             useExternalLatexTemplate: false };
  }
  if (s.preset === "academic") {
    // Papers, formal reports — classical serif body
    return { ...s, fontSize: "12pt", marginInches: 1.0, mainFont: "Latin Modern Roman",
             sansFont: "Latin Modern Sans", monoFont: "Latin Modern Mono",
             useExternalLatexTemplate: false };
  }
  if (s.preset === "note") {
    // Daily notes, drafts — readable defaults, generous margins
    return { ...s, fontSize: "11pt", marginInches: 1.0, mainFont: "DejaVu Sans",
             sansFont: "DejaVu Sans", monoFont: "DejaVu Sans Mono",
             useExternalLatexTemplate: false };
  }
  if (s.preset === "comparison") {
    // Side-by-side tables, multi-column comparisons, glossary docs.
    // Slightly tighter margin than `note` so wide tables fit without splitting,
    // while keeping `note`'s readable type size.
    // Matches faerie2/.agents/skills/pdf preset of the same name.
    return { ...s, fontSize: "11pt", marginInches: 0.85, mainFont: "DejaVu Sans",
             sansFont: "DejaVu Sans", monoFont: "DejaVu Sans Mono",
             useExternalLatexTemplate: false };
  }
  return s;  // custom — operator manages all fields directly
}

const DEFAULT_SETTINGS: HivePdfSettings = {
  outputDir: "",
  filenamePattern: "{basename}-{timestamp}.pdf",
  mmdcScale: 2,
  openAfterBuild: true,
  overwriteExisting: false,
  wslDistro: "",
  includeExcalidraw: true,
  excalidrawScale: 2,
  fontSize: "11pt",
  marginInches: 1.0,
  mainFont: "DejaVu Sans",
  sansFont: "DejaVu Sans",
  monoFont: "DejaVu Sans Mono",
  useExternalLatexTemplate: false,
  latexTemplatePath: "",
  latexHeaderPath: "",  // empty = auto-detect faerie2 print-ready-header.tex
  preset: "note",
};

// ─── Excalidraw API types (minimal surface we need) ────────────────────────

interface ExcalidrawAutomate {
  create(params: { filename: string; foldername?: string }): Promise<string>;
  createPNG(filePath: string, scale?: number): Promise<Blob | null>;
  reset(): void;
}

interface ExcalidrawPlugin {
  ea: ExcalidrawAutomate;
}

/** Resolve the Excalidraw plugin's EA interface, or null if not available. */
function getEA(app: App): ExcalidrawAutomate | null {
  try {
    const plug = (app as unknown as { plugins: { plugins: Record<string, unknown> } })
      .plugins.plugins["obsidian-excalidraw-plugin"] as ExcalidrawPlugin | undefined;
    return plug?.ea ?? null;
  } catch {
    return null;
  }
}

// ─── Template definitions ──────────────────────────────────────────────────

interface HiveTemplate {
  id: string;
  name: string;
  description: string;
  filename: string;
}

const HIVE_TEMPLATES: HiveTemplate[] = [
  {
    id: "architecture",
    name: "Architecture (3-tier)",
    description: "Users → App → Data. Layered system diagram with cyan boxes.",
    filename: "architecture.excalidraw",
  },
  {
    id: "process-flow",
    name: "Process Flow",
    description: "Start → Process → Decision → End. Left-to-right flow.",
    filename: "process-flow.excalidraw",
  },
  {
    id: "timeline",
    name: "Timeline (Q1–Q4)",
    description: "Horizontal axis with 4 quarterly milestones.",
    filename: "timeline.excalidraw",
  },
  {
    id: "decision-tree",
    name: "Decision Tree",
    description: "Root → 2 branches → 4 leaves. Hierarchical decision structure.",
    filename: "decision-tree.excalidraw",
  },
  {
    id: "component-diagram",
    name: "Component Diagram",
    description: "3 components connected in triangle with labeled edges.",
    filename: "component-diagram.excalidraw",
  },
  {
    id: "data-pipeline",
    name: "Data Pipeline",
    description: "Source → Transform → Transform → Sink. ETL flow diagram.",
    filename: "data-pipeline.excalidraw",
  },
];

// ─── Path helpers ──────────────────────────────────────────────────────────

/** Convert a Windows absolute path (D:\foo\bar) to WSL path (/mnt/d/foo/bar). */
function winToWsl(winPath: string): string {
  const p = winPath.replace(/\\/g, "/");
  const m = p.match(/^([A-Za-z]):\/(.*)$/);
  if (!m) return p;
  return `/mnt/${m[1].toLowerCase()}/${m[2]}`;
}

/** Convert WSL path to Windows path (best-effort, no wslpath call needed for display). */
function wslToWin(wslPath: string): string {
  const m = wslPath.match(/^\/mnt\/([a-z])\/(.*)$/);
  if (!m) return wslPath;
  return `${m[1].toUpperCase()}:\\${m[2].replace(/\//g, "\\")}`;
}

/** Shell-escape a string for use inside a bash -c "..." argument. */
function bashEscape(s: string): string {
  return s.replace(/'/g, "'\\''");
}

// ─── WSL runner ────────────────────────────────────────────────────────────

interface RunResult {
  stdout: string;
  stderr: string;
  code: number;
}

async function runWsl(
  distro: string,
  bashCmd: string,
  opts: ExecOptions = {}
): Promise<RunResult> {
  const distroFlag = distro ? `-d ${distro}` : "";
  const cmd = `wsl.exe ${distroFlag} bash -c '${bashEscape(bashCmd)}'`;
  try {
    const { stdout, stderr } = await execAsync(cmd, {
      ...opts,
      maxBuffer: 10 * 1024 * 1024,
    });
    return { stdout: stdout || "", stderr: stderr || "", code: 0 };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; code?: number };
    return {
      stdout: e.stdout || "",
      stderr: e.stderr || "",
      code: e.code ?? 1,
    };
  }
}

/** Detect WSL availability and return default distro name. */
async function detectWsl(): Promise<string | null> {
  try {
    const { stdout } = await execAsync("wsl.exe -l -q", {
      maxBuffer: 1024 * 1024,
    });
    const distros = stdout
      .replace(/\0/g, "")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    return distros[0] || "";
  } catch {
    return null;
  }
}

// ─── Build logger ──────────────────────────────────────────────────────────

class BuildLog {
  private lines: string[] = [];
  private logPath: string;

  constructor(logPath: string) {
    this.logPath = logPath;
    this.append(`=== Hive PDF Build Log — ${new Date().toISOString()} ===\n`);
  }

  append(line: string) {
    this.lines.push(line);
  }

  flush() {
    try {
      fs.writeFileSync(this.logPath, this.lines.join("\n"), "utf8");
    } catch {
      // best-effort
    }
  }

  tailStderr(stderr: string, maxLines = 20): string {
    const lines = stderr.split("\n").filter(Boolean);
    return lines.slice(-maxLines).join("\n");
  }
}

// ─── Excalidraw embed resolver ─────────────────────────────────────────────

interface ResolvedEmbed {
  /** The full original wikilink match string, e.g. ![[foo.excalidraw]] */
  original: string;
  /** Resolved absolute Windows path to the .excalidraw/.excalidraw.md file */
  absPath: string | null;
  /** Destination PNG filename (not full path) inside diagramsDir */
  pngName: string;
}

/**
 * Find all ![[*.excalidraw]] and ![[*.excalidraw.md]] embeds in content.
 * Resolves each to an absolute path using the vault, relative to the note.
 */
function resolveExcalidrawEmbeds(
  content: string,
  noteFile: TFile,
  app: App
): ResolvedEmbed[] {
  const embedRegex = /!\[\[([^\]]+\.excalidraw(?:\.md)?)\]\]/g;
  const results: ResolvedEmbed[] = [];
  let match: RegExpExecArray | null;
  let idx = 0;

  while ((match = embedRegex.exec(content)) !== null) {
    idx++;
    const linkText = match[1];
    // Try to resolve via Obsidian's metadataCache
    const resolved = app.metadataCache.getFirstLinkpathDest(linkText, noteFile.path);
    const vaultRoot = (app.vault.adapter as unknown as { basePath: string }).basePath;
    const absPath = resolved
      ? path.join(vaultRoot, resolved.path)
      : null;

    results.push({
      original: match[0],
      absPath,
      pngName: `excalidraw_${String(idx).padStart(3, "0")}.png`,
    });
  }

  return results;
}

/**
 * Export an Excalidraw file to PNG using ExcalidrawAutomate.
 * Returns the PNG as a Buffer, or null on failure.
 */
async function exportExcalidrawToPng(
  app: App,
  ea: ExcalidrawAutomate,
  excalidrawAbsPath: string,
  scale: number
): Promise<Buffer | null> {
  try {
    // Derive the vault-relative path for the file
    const vaultRoot = (app.vault.adapter as unknown as { basePath: string }).basePath;
    // Normalise to forward slashes then strip vault root prefix
    const normalised = excalidrawAbsPath.replace(/\\/g, "/");
    const vaultNorm = vaultRoot.replace(/\\/g, "/");
    let vaultRelPath = normalised.startsWith(vaultNorm)
      ? normalised.slice(vaultNorm.length + 1)
      : normalised;

    const blob = await ea.createPNG(vaultRelPath, scale);
    if (!blob) return null;

    // Convert Blob → ArrayBuffer → Buffer
    const arrayBuf = await blob.arrayBuffer();
    return Buffer.from(arrayBuf);
  } catch (err) {
    console.warn("[hive-pdf] Excalidraw export failed:", err);
    return null;
  }
}

/**
 * Get PNG dimensions from a Buffer using basic PNG header parsing.
 * PNG IHDR chunk: bytes 16-24 are width (4 bytes BE) and height (4 bytes BE).
 */
function getPngDims(buf: Buffer): { w: number; h: number } {
  if (buf.length < 24) return { w: 0, h: 0 };
  // PNG signature is 8 bytes, then 4-byte chunk length, 4-byte "IHDR", then w/h
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  return { w, h };
}

/**
 * Compute the same size annotation the aspect sizer would emit,
 * given width and height. Mirrors the Python logic exactly.
 */
function sizeAnnotation(w: number, h: number): string {
  if (w === 0 || h === 0) return "width=85%";
  const ar = w / h;
  if (ar >= 4.0) return "LANDSCAPE"; // special case handled separately
  if (ar >= 2.5) return "width=95%";
  if (ar >= 1.3) return "width=80%";
  if (ar >= 0.8) return "width=55%";
  if (ar >= 0.45) return "height=5.5in";
  return "height=6.5in";
}

// ─── Core pipeline ─────────────────────────────────────────────────────────

async function buildPdf(
  noteAbsPath: string,
  settings: HivePdfSettings,
  distro: string,
  app: App
): Promise<{ pdfPath: string; log: BuildLog }> {

  const noteDir = path.dirname(noteAbsPath);
  const noteBasename = path.basename(noteAbsPath, ".md");

  // Working dir: <note_parent>/.pdf-build/
  const buildDir = path.join(noteDir, ".pdf-build");
  if (!fs.existsSync(buildDir)) fs.mkdirSync(buildDir, { recursive: true });

  // Diagrams dir inside build dir
  const diagramsDir = path.join(buildDir, "diagrams");
  if (!fs.existsSync(diagramsDir)) fs.mkdirSync(diagramsDir, { recursive: true });

  // Log file
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 16);
  const logPath = path.join(buildDir, `build-${ts}.log`);
  const log = new BuildLog(logPath);

  // Determine PDF output path
  const outputDir = settings.outputDir || noteDir;
  const pdfFilename = settings.filenamePattern
    .replace("{basename}", noteBasename)
    .replace("{timestamp}", ts);
  let pdfPath = path.join(outputDir, pdfFilename);

  if (!settings.overwriteExisting && fs.existsSync(pdfPath)) {
    const stamped = pdfFilename.replace(".pdf", `-${Date.now()}.pdf`);
    pdfPath = path.join(outputDir, stamped);
    log.append(`[warn] Output exists; using timestamped name: ${stamped}`);
  }

  // WSL paths
  const noteWsl = winToWsl(noteAbsPath);
  const buildWsl = winToWsl(buildDir);
  const diagramsWsl = winToWsl(diagramsDir);
  const pdfWsl = winToWsl(pdfPath);

  // ── Step 0: Handle Excalidraw embeds ─────────────────────────────────────
  // We do this BEFORE the sizer pass. We export each embed to PNG, write to
  // diagramsDir, then produce a pre-processed markdown with embeds replaced
  // by sized image refs. The sizer then handles mermaid blocks in the same doc.

  let mdContent = fs.readFileSync(noteAbsPath, "utf8");
  let excalidrawCount = 0;

  if (settings.includeExcalidraw) {
    new Notice("Hive PDF: checking for Excalidraw embeds…");
    log.append("\n[Step 0] Excalidraw embed pipeline");

    const ea = getEA(app);

    if (!ea) {
      log.append("  [warn] obsidian-excalidraw-plugin not installed/enabled — skipping Excalidraw embeds");
      new Notice("Hive PDF: Excalidraw plugin not found — skipping embedded diagrams (mermaid-only mode)", 5000);
    } else {
      // We need the TFile for the note to resolve relative links
      const noteFile = app.vault.getAbstractFileByPath(
        // Convert absPath back to vault-relative
        (() => {
          const vaultRoot = (app.vault.adapter as unknown as { basePath: string }).basePath;
          const norm = noteAbsPath.replace(/\\/g, "/");
          const vNorm = vaultRoot.replace(/\\/g, "/");
          return norm.startsWith(vNorm) ? norm.slice(vNorm.length + 1) : norm;
        })()
      );

      if (!noteFile || !(noteFile instanceof TFile)) {
        log.append("  [warn] Could not resolve note TFile — skipping Excalidraw embeds");
      } else {
        const embeds = resolveExcalidrawEmbeds(mdContent, noteFile, app);
        log.append(`  found ${embeds.length} Excalidraw embed(s)`);

        // Process each embed — export PNG, write to diagramsDir, build replacement
        const replacements: Array<{ original: string; replacement: string }> = [];

        for (const embed of embeds) {
          log.append(`  embed: ${embed.original} -> ${embed.pngName}`);

          if (!embed.absPath) {
            log.append(`    [warn] Could not resolve path for ${embed.original} — skipping`);
            replacements.push({ original: embed.original, replacement: embed.original });
            continue;
          }

          const pngBuf = await exportExcalidrawToPng(
            app,
            ea,
            embed.absPath,
            settings.excalidrawScale
          );

          if (!pngBuf) {
            log.append(`    [warn] PNG export returned null for ${embed.absPath} — skipping`);
            replacements.push({ original: embed.original, replacement: embed.original });
            continue;
          }

          const pngDestPath = path.join(diagramsDir, embed.pngName);
          fs.writeFileSync(pngDestPath, pngBuf);
          excalidrawCount++;

          const { w, h } = getPngDims(pngBuf);
          const annotation = sizeAnnotation(w, h);
          const pngRelForMd = `diagrams/${embed.pngName}`;
          const figLabel = `Excalidraw diagram`;

          let replacement: string;
          if (annotation === "LANDSCAPE") {
            replacement = (
              `\n\\begin{landscape}\n` +
              `\\begin{center}\n` +
              `\\includegraphics[width=\\linewidth,keepaspectratio]{${pngRelForMd}}\n\n` +
              `\\textit{${figLabel}}\n` +
              `\\end{center}\n` +
              `\\end{landscape}\n\n`
            );
          } else {
            replacement = `\n![${figLabel}](${pngRelForMd}){ ${annotation} }\n`;
          }

          log.append(`    dims ${w}x${h} ar=${h ? (w/h).toFixed(2) : "?"} -> ${annotation}`);
          replacements.push({ original: embed.original, replacement });
        }

        // Apply replacements in order (simple string replace, originals are unique enough)
        for (const { original, replacement } of replacements) {
          mdContent = mdContent.replace(original, replacement);
        }
      }
    }
  } else {
    log.append("\n[Step 0] Excalidraw embeds disabled in settings — skipped");
  }

  // Write the pre-processed markdown (with Excalidraw already replaced) to
  // a temp file so the sizer can work on it. The sizer will then replace
  // mermaid blocks and emit the final .ready.md.
  const preprocessedMdPath = path.join(buildDir, "note.preprocessed.md");
  fs.writeFileSync(preprocessedMdPath, mdContent, "utf8");
  const preprocessedMdWsl = winToWsl(preprocessedMdPath);

  // ── Step 1: Extract mermaid blocks and write .mmd files ──────────────────
  new Notice("Hive PDF: extracting Mermaid diagrams…");
  log.append("\n[Step 1] Extract mermaid blocks");

  const mermaidRegex = /```mermaid\n([\s\S]*?)\n```/g;
  let match: RegExpExecArray | null;
  let diagramCount = 0;

  while ((match = mermaidRegex.exec(mdContent)) !== null) {
    diagramCount++;
    const mmdContent = match[1];
    const mmdFile = path.join(diagramsDir, `diagram_${String(diagramCount).padStart(3, "0")}.mmd`);
    fs.writeFileSync(mmdFile, mmdContent, "utf8");
    log.append(`  wrote diagram_${String(diagramCount).padStart(3, "0")}.mmd (${mmdContent.length} chars)`);
  }

  log.append(`  total: ${diagramCount} mermaid diagram(s)`);

  // ── Step 2: Render each .mmd → .png via mmdc ─────────────────────────────
  new Notice(`Hive PDF: rendering ${diagramCount} mermaid diagram(s)…`);
  log.append("\n[Step 2] Render diagrams via mmdc");

  const mermaidConfig = JSON.stringify({
    theme: "neutral",
    themeVariables: {
      primaryTextColor: "#000000",
      secondaryTextColor: "#000000",
      tertiaryTextColor: "#000000",
      textColor: "#000000",
      lineColor: "#1a1a2e",
      primaryColor: "#00d4ff",
      primaryBorderColor: "#1a1a2e",
      secondaryColor: "#a8dadc",
      tertiaryColor: "#ffd700",
    },
  });
  const configFile = path.join(buildDir, "mermaid-config.json");
  fs.writeFileSync(configFile, mermaidConfig, "utf8");
  const configWsl = winToWsl(configFile);

  const chromeBin = "/mnt/d/0LOCAL/.cache/puppeteer/chrome/linux-147.0.7727.56/chrome-linux64/chrome";
  const scale = settings.mmdcScale;

  for (let i = 1; i <= diagramCount; i++) {
    const num = String(i).padStart(3, "0");
    const mmdWsl = `${diagramsWsl}/diagram_${num}.mmd`;
    const pngWsl = `${diagramsWsl}/diagram_${num}.png`;

    const cmd = `PUPPETEER_EXECUTABLE_PATH='${chromeBin}' mmdc -i '${mmdWsl}' -o '${pngWsl}' -c '${configWsl}' -t neutral -s ${scale} -b transparent 2>&1`;
    log.append(`  [${i}/${diagramCount}] mmdc diagram_${num}`);

    const result = await runWsl(distro, cmd);
    log.append(`    stdout: ${result.stdout.trim()}`);
    if (result.stderr) log.append(`    stderr: ${result.stderr.trim()}`);

    if (result.code !== 0) {
      log.flush();
      throw new Error(
        `mmdc failed on diagram_${num} (exit ${result.code}):\n${log.tailStderr(result.stderr)}`
      );
    }
  }

  // ── Step 3: aspect sizer ──────────────────────────────────────────────────
  new Notice("Hive PDF: sizing diagrams…");
  log.append("\n[Step 3] 9x_pdf_aspect_sizer.py");

  const sizerScript = "/mnt/d/0LOCAL/.claude/scripts/9x_pdf_aspect_sizer.py";
  const readyMdWsl = `${buildWsl}/note.ready.md`;

  // Feed the preprocessed markdown (Excalidraw already resolved) to the sizer
  const sizerCmd = `python3 '${sizerScript}' '${preprocessedMdWsl}' --diagrams-dir '${diagramsWsl}' --out '${readyMdWsl}' --verbose 2>&1`;
  const sizerResult = await runWsl(distro, sizerCmd);
  log.append(`  output: ${sizerResult.stdout.trim()}`);
  if (sizerResult.stderr) log.append(`  stderr: ${sizerResult.stderr.trim()}`);

  if (sizerResult.code !== 0) {
    log.flush();
    throw new Error(
      `aspect_sizer failed (exit ${sizerResult.code}):\n${log.tailStderr(sizerResult.stderr)}`
    );
  }

  // ── Step 3.5: mermaid.ink fallback for remaining ```mermaid blocks ──────────
  // 2026-05-25: fills the TODO from 2026-05-23. After Step 3 (aspect-sizer),
  // any ```mermaid blocks that survived (mmdc may have left them if it only
  // processes extracted .mmd files) are replaced by fetched PNGs from
  // mermaid.ink. We read the .ready.md file, find remaining blocks, fetch via
  // mermaid.ink, write PNGs to diagramsDir, and rewrite the .ready.md.
  //
  // Encoding strategy: pako-compressed base64url for diagrams ≥ 500 chars of
  // source (stays under URL length limits); plain base64url for shorter ones.
  // Cache key: SHA-256(source) → mermaid-{hex16}.png in diagramsDir.
  // On mermaid.ink error: leave a visible placeholder comment in the markdown.
  new Notice("Hive PDF: resolving remaining Mermaid blocks via mermaid.ink…");
  log.append("\n[Step 3.5] mermaid.ink fallback for remaining mermaid blocks");

  const readyMdPath = path.join(buildDir, "note.ready.md");
  let readyMdContent = fs.existsSync(readyMdPath)
    ? fs.readFileSync(readyMdPath, "utf8")
    : fs.readFileSync(path.join(buildDir, "note.preprocessed.md"), "utf8");

  // SHA-256 helper (Node.js built-in)
  const { createHash } = await import("crypto");
  const { default: https } = await import("https");
  const { default: zlib } = await import("zlib");

  /** Compute SHA-256 hex of a string */
  const sha256hex = (s: string): string =>
    createHash("sha256").update(s, "utf8").digest("hex");

  /** Raw DEFLATE (no zlib header) — what pako uses */
  const rawDeflate = (src: string): Promise<Buffer> =>
    new Promise((resolve, reject) =>
      zlib.deflateRaw(Buffer.from(src, "utf8"), { level: 9 }, (err, result) =>
        err ? reject(err) : resolve(result)
      )
    );

  /** Build mermaid.ink URL — pako for large, plain base64url for small */
  const mermaidInkUrl = async (source: string): Promise<string> => {
    const PAKO_THRESHOLD = 500;
    const theme = "default";
    if (source.length >= PAKO_THRESHOLD) {
      const deflated = await rawDeflate(source);
      const b64 = deflated.toString("base64url").replace(/=+$/, "");
      return `https://mermaid.ink/img/pako:${b64}?theme=${theme}&bgColor=white`;
    } else {
      const b64 = Buffer.from(source, "utf8").toString("base64url").replace(/=+$/, "");
      return `https://mermaid.ink/img/${b64}?theme=${theme}&bgColor=white`;
    }
  };

  /** Fetch a URL and return the body as Buffer, or null on error */
  const fetchPng = (url: string): Promise<Buffer | null> =>
    new Promise((resolve) => {
      const req = https.get(url, { headers: { "User-Agent": "swarmy-hive-plugin/1.1" } }, (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const body = Buffer.concat(chunks);
          // mermaid.ink returns small payloads on parse error
          resolve(body.length > 200 ? body : null);
        });
      });
      req.setTimeout(30_000, () => { req.destroy(); resolve(null); });
      req.on("error", () => resolve(null));
    });

  const mermaidRe = /```mermaid\n([\s\S]*?)\n```/g;
  let inkDiagramCount = 0;
  const inkReplacements: Array<{ placeholder: string; replacement: string }> = [];

  // Collect all remaining mermaid blocks
  let inkMatch: RegExpExecArray | null;
  while ((inkMatch = mermaidRe.exec(readyMdContent)) !== null) {
    const fullBlock = inkMatch[0];
    const source = inkMatch[1].trim();
    const hashPrefix = sha256hex(source).slice(0, 16);
    const pngName = `mermaid-${hashPrefix}.png`;
    const pngDestPath = path.join(diagramsDir, pngName);
    const pngMdRef = `diagrams/${pngName}`;
    inkDiagramCount++;

    // Use cached PNG if available
    if (fs.existsSync(pngDestPath) && fs.statSync(pngDestPath).size > 200) {
      log.append(`  [ink-${inkDiagramCount}] cache hit: ${pngName}`);
      const { w, h } = getPngDims(fs.readFileSync(pngDestPath));
      const ann = sizeAnnotation(w, h);
      const replacement = ann === "LANDSCAPE"
        ? `\n\\begin{landscape}\n\\begin{center}\n\\includegraphics[width=\\linewidth]{${pngMdRef}}\n\\end{center}\n\\end{landscape}\n\n`
        : `\n![Mermaid diagram ${inkDiagramCount}](${pngMdRef}){ ${ann} }\n`;
      inkReplacements.push({ placeholder: fullBlock, replacement });
      continue;
    }

    // Fetch from mermaid.ink
    try {
      const url = await mermaidInkUrl(source);
      log.append(`  [ink-${inkDiagramCount}] fetching from mermaid.ink: ${url.slice(0, 80)}…`);
      const pngBuf = await fetchPng(url);
      if (pngBuf && pngBuf.length > 200) {
        fs.writeFileSync(pngDestPath, pngBuf);
        const { w, h } = getPngDims(pngBuf);
        const ann = sizeAnnotation(w, h);
        log.append(`    ok: ${pngBuf.length} bytes, dims ${w}x${h}, ann=${ann}`);
        const replacement = ann === "LANDSCAPE"
          ? `\n\\begin{landscape}\n\\begin{center}\n\\includegraphics[width=\\linewidth]{${pngMdRef}}\n\\end{center}\n\\end{landscape}\n\n`
          : `\n![Mermaid diagram ${inkDiagramCount}](${pngMdRef}){ ${ann} }\n`;
        inkReplacements.push({ placeholder: fullBlock, replacement });
      } else {
        log.append(`    WARN: mermaid.ink returned empty/small payload — using placeholder`);
        inkReplacements.push({
          placeholder: fullBlock,
          replacement: `\n> **[Mermaid diagram ${inkDiagramCount} — render failed: mermaid.ink returned no data]**\n\n`,
        });
      }
    } catch (inkErr) {
      log.append(`    ERROR: ${inkErr}`);
      inkReplacements.push({
        placeholder: fullBlock,
        replacement: `\n> **[Mermaid diagram ${inkDiagramCount} — render failed: ${inkErr}]**\n\n`,
      });
    }
  }

  // Apply replacements to ready.md (rewrite file with PNGs inlined)
  if (inkDiagramCount > 0) {
    for (const { placeholder, replacement } of inkReplacements) {
      readyMdContent = readyMdContent.replace(placeholder, replacement);
    }
    fs.writeFileSync(readyMdPath, readyMdContent, "utf8");
    log.append(`  mermaid.ink pass done: ${inkDiagramCount} block(s) processed`);
  } else {
    log.append(`  no remaining mermaid blocks — step skipped`);
  }

  // ── Step 4: pandoc → PDF ──────────────────────────────────────────────────
  // 2026-05-23: parameterized via HivePdfSettings.preset (note/business/academic/custom)
  // + applyPreset() at top of file. Inline -V flags so plugin is self-contained.
  // External LaTeX header for no-split floats + hyperref config now supported via
  // latexHeaderPath setting (see HivePdfSettings).
  // 2026-05-25: upgraded colorlinks to NavyBlue; added highlight-style=tango;
  //   added --include-in-header support for print-ready-header.tex (no-split floats,
  //   needspace, booktabs, widow/orphan penalties).
  new Notice("Hive PDF: running pandoc…");
  log.append("\n[Step 4] pandoc → xelatex → PDF");

  const s = applyPreset(this.settings ?? DEFAULT_SETTINGS);
  const templateArg = s.useExternalLatexTemplate && s.latexTemplatePath
    ? `--template='${s.latexTemplatePath}'`
    : "";  // omit when not using external template — inline -V flags cover it

  // Include the print-ready LaTeX header (provides no-split floats, needspace,
  // NavyBlue hyperref, widow/orphan penalties, booktabs, caption styles).
  // Priority: (1) user-provided s.latexHeaderPath, (2) faerie2 canonical path,
  // (3) empty — inline -V flags remain the baseline fallback.
  const FALLBACK_HEADER = "/mnt/d/0local/gitrepos/faerie2/forensics/publication-renders/print-ready-header.tex";
  const headerTex = s.latexHeaderPath || FALLBACK_HEADER;
  const headerWsl = winToWsl(headerTex);
  const headerArg = (() => {
    try { return fs.existsSync(headerTex) ? `--include-in-header='${headerWsl}'` : ""; }
    catch { return ""; }
  })();

  const pandocCmd = [
    `cd '${buildWsl}'`,
    `&& pandoc '${readyMdWsl}'`,
    `--pdf-engine=xelatex`,
    templateArg,
    headerArg,
    `--resource-path='${buildWsl}:${buildWsl}/diagrams'`,
    `--toc`,
    `--toc-depth=3`,
    `--number-sections`,
    `--highlight-style=tango`,
    `-V geometry:margin=${s.marginInches}in`,
    `-V fontsize:${s.fontSize}`,
    `-V mainfont='${s.mainFont}'`,
    `-V sansfont='${s.sansFont}'`,
    `-V monofont='${s.monoFont}'`,
    `-V documentclass=article`,
    `-V colorlinks=true`,
    `-V linkcolor=NavyBlue`,
    `-V urlcolor=NavyBlue`,
    `-V citecolor=NavyBlue`,
    `-V toccolor=NavyBlue`,
    `-V papersize=letter`,
    `-o '${pdfWsl}'`,
    `2>&1`,
  ].filter(Boolean).join(" ");

  const pandocResult = await runWsl(distro, pandocCmd);
  log.append(`  stdout: ${pandocResult.stdout.trim()}`);
  if (pandocResult.stderr) log.append(`  stderr: ${pandocResult.stderr.trim()}`);

  if (pandocResult.code !== 0) {
    log.flush();
    throw new Error(
      `pandoc failed (exit ${pandocResult.code}):\n${log.tailStderr(pandocResult.stderr)}`
    );
  }

  log.append(`\n[done] PDF written: ${pdfWsl}`);
  log.append(`  mermaid diagrams: ${diagramCount} | excalidraw embeds: ${excalidrawCount}`);
  log.flush();

  return { pdfPath, log };
}

// ─── Template picker modal ─────────────────────────────────────────────────

class TemplateSuggestModal extends FuzzySuggestModal<HiveTemplate> {
  private onChoose: (template: HiveTemplate) => void;

  constructor(app: App, onChoose: (template: HiveTemplate) => void) {
    super(app);
    this.onChoose = onChoose;
    this.setPlaceholder("Pick a Hive diagram template…");
  }

  getItems(): HiveTemplate[] {
    return HIVE_TEMPLATES;
  }

  getItemText(item: HiveTemplate): string {
    return `${item.name} — ${item.description}`;
  }

  onChooseItem(item: HiveTemplate, _evt: MouseEvent | KeyboardEvent): void {
    this.onChoose(item);
  }
}

// ─── Plugin ────────────────────────────────────────────────────────────────

export default class HivePdfPlugin extends Plugin {
  settings!: HivePdfSettings;
  private detectedDistro: string | null = null;

  async onload() {
    await this.loadSettings();

    // Command 1: existing PDF export
    this.addCommand({
      id: "export-hive-pdf",
      name: "Export to Hive PDF (smart-sized diagrams)",
      checkCallback: (checking: boolean) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || file.extension !== "md") return false;
        if (!checking) {
          void this.runExport(file);
        }
        return true;
      },
    });

    // Command 2: insert Hive diagram from template
    this.addCommand({
      id: "insert-hive-diagram",
      name: "Insert Hive diagram from template",
      checkCallback: (checking: boolean) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || file.extension !== "md") return false;
        if (!checking) {
          void this.runInsertTemplate(file);
        }
        return true;
      },
    });

    this.addSettingTab(new HivePdfSettingTab(this.app, this));

    void detectWsl().then((d) => {
      this.detectedDistro = d;
    });
  }

  /** Returns the absolute path to the plugin's templates/ folder. */
  private getTemplatesDir(): string {
    // this.manifest.dir is the vault-relative path to the plugin folder
    const vaultRoot = (this.app.vault.adapter as unknown as { basePath: string }).basePath;
    return path.join(vaultRoot, this.manifest.dir ?? `.obsidian/plugins/${this.manifest.id}`, "templates");
  }

  async runInsertTemplate(file: TFile) {
    const modal = new TemplateSuggestModal(this.app, async (template) => {
      await this.insertTemplate(file, template);
    });
    modal.open();
  }

  async insertTemplate(file: TFile, template: HiveTemplate) {
    const vaultRoot = (this.app.vault.adapter as unknown as { basePath: string }).basePath;
    const noteAbsPath = path.join(vaultRoot, file.path);
    const noteDir = path.dirname(noteAbsPath);
    const noteBasename = path.basename(noteAbsPath, ".md");

    // Ensure assets/ folder exists
    const assetsDir = path.join(noteDir, "assets");
    if (!fs.existsSync(assetsDir)) {
      fs.mkdirSync(assetsDir, { recursive: true });
    }

    // Unique suffix (HHMMSS)
    const now = new Date();
    const uniq = [
      String(now.getHours()).padStart(2, "0"),
      String(now.getMinutes()).padStart(2, "0"),
      String(now.getSeconds()).padStart(2, "0"),
    ].join("");

    const destFilename = `${noteBasename}-${uniq}.excalidraw`;
    const destAbsPath = path.join(assetsDir, destFilename);
    const srcAbsPath = path.join(this.getTemplatesDir(), template.filename);

    // Copy template file
    if (!fs.existsSync(srcAbsPath)) {
      new Notice(`Hive PDF: template not found: ${srcAbsPath}`, 8000);
      console.error("[hive-pdf] Template missing:", srcAbsPath);
      return;
    }

    fs.copyFileSync(srcAbsPath, destAbsPath);

    // Insert wikilink at cursor
    const embedText = `![[assets/${destFilename}]]`;
    const activeView = this.app.workspace.getActiveViewOfType(
      (await import("obsidian")).MarkdownView
    );

    if (activeView?.editor) {
      const editor = activeView.editor;
      const cursor = editor.getCursor();
      editor.replaceRange(`\n${embedText}\n`, cursor);
      new Notice(`Hive PDF: inserted ${template.name} template`, 4000);
    } else {
      // Fallback: append to file
      const existing = await this.app.vault.read(file);
      await this.app.vault.modify(file, `${existing}\n${embedText}\n`);
      new Notice(`Hive PDF: appended ${template.name} template to note`, 4000);
    }
  }

  async runExport(file: TFile) {
    if (process.platform !== "win32") {
      new Notice(
        "Hive PDF: currently only supports Windows + WSL. See README for Mac/Linux workaround.",
        8000
      );
      return;
    }

    if (this.detectedDistro === null) {
      this.detectedDistro = await detectWsl();
    }
    if (this.detectedDistro === null) {
      new Notice(
        "Hive PDF: wsl.exe not found. Install WSL2 and ensure pandoc/mmdc/xelatex are inside it.",
        10000
      );
      return;
    }

    const distro = this.settings.wslDistro || this.detectedDistro;

    const vaultRoot = (this.app.vault.adapter as unknown as { basePath: string }).basePath;
    const noteAbsPath = path.join(vaultRoot, file.path);

    new Notice("Hive PDF: starting pipeline…");

    try {
      const { pdfPath } = await buildPdf(noteAbsPath, this.settings, distro, this.app);

      const msg = `Hive PDF ready: ${path.basename(pdfPath)}`;
      new Notice(msg, 8000);

      if (this.settings.openAfterBuild) {
        const { shell } = require("electron") as { shell: { openPath: (p: string) => Promise<string> } };
        await shell.openPath(pdfPath);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const snippet = message.slice(0, 300);
      new Notice(`Hive PDF FAILED:\n${snippet}`, 15000);
      console.error("[hive-pdf] Build error:", message);
    }
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

// ─── Settings tab ──────────────────────────────────────────────────────────

class HivePdfSettingTab extends PluginSettingTab {
  plugin: HivePdfPlugin;

  constructor(app: App, plugin: HivePdfPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Hive PDF Export — Settings" });

    // ── Output ──────────────────────────────────────────────────────────────

    containerEl.createEl("h3", { text: "Output" });

    new Setting(containerEl)
      .setName("Output directory")
      .setDesc(
        "Where to write the PDF. Leave blank to use the same folder as the note."
      )
      .addText((text) =>
        text
          .setPlaceholder("(same folder as note)")
          .setValue(this.plugin.settings.outputDir)
          .onChange(async (value) => {
            this.plugin.settings.outputDir = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Filename pattern")
      .setDesc(
        "Use {basename} for the note name, {timestamp} for YYYYMMDD-HHMM."
      )
      .addText((text) =>
        text
          .setPlaceholder("{basename}-{timestamp}.pdf")
          .setValue(this.plugin.settings.filenamePattern)
          .onChange(async (value) => {
            this.plugin.settings.filenamePattern = value.trim() || "{basename}-{timestamp}.pdf";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Open PDF after build")
      .setDesc("Automatically open the PDF in the default viewer when done.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.openAfterBuild)
          .onChange(async (value) => {
            this.plugin.settings.openAfterBuild = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Overwrite existing PDF")
      .setDesc(
        "If off, a timestamp suffix is appended when the output file already exists (safe default)."
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.overwriteExisting)
          .onChange(async (value) => {
            this.plugin.settings.overwriteExisting = value;
            await this.plugin.saveSettings();
          })
      );

    // ── Mermaid ──────────────────────────────────────────────────────────────

    containerEl.createEl("h3", { text: "Mermaid diagrams" });

    new Setting(containerEl)
      .setName("mmdc render scale")
      .setDesc("Higher = sharper PNG output. Default: 2. Recommended: 2–3.")
      .addSlider((slider) =>
        slider
          .setLimits(1, 4, 1)
          .setValue(this.plugin.settings.mmdcScale)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.mmdcScale = value;
            await this.plugin.saveSettings();
          })
      );

    // ── Excalidraw ───────────────────────────────────────────────────────────

    containerEl.createEl("h3", { text: "Excalidraw embeds" });

    new Setting(containerEl)
      .setName("Include Excalidraw embeds in PDF export")
      .setDesc(
        "Export ![[*.excalidraw]] embeds to PNG and include them in the PDF. Requires the Excalidraw plugin. Degrades gracefully if not installed."
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.includeExcalidraw)
          .onChange(async (value) => {
            this.plugin.settings.includeExcalidraw = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Excalidraw PNG export scale")
      .setDesc("Render scale for Excalidraw → PNG export. Default: 2. Range: 1–4.")
      .addSlider((slider) =>
        slider
          .setLimits(1, 4, 1)
          .setValue(this.plugin.settings.excalidrawScale)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.excalidrawScale = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Template folder")
      .setDesc(
        "Read-only. Templates are bundled inside the plugin folder."
      )
      .addText((text) => {
        const vaultRoot = (this.app.vault.adapter as unknown as { basePath: string }).basePath;
        const templatesPath = path.join(
          vaultRoot,
          this.plugin.manifest.dir ?? `.obsidian/plugins/${this.plugin.manifest.id}`,
          "templates"
        );
        text
          .setValue(templatesPath)
          .setDisabled(true);
      });

    // ── Advanced ─────────────────────────────────────────────────────────────

    containerEl.createEl("h3", { text: "Advanced" });

    new Setting(containerEl)
      .setName("WSL distro name")
      .setDesc(
        "Name of the WSL distro to use (run `wsl -l` to list). Leave blank to use the default."
      )
      .addText((text) =>
        text
          .setPlaceholder("(auto-detect default distro)")
          .setValue(this.plugin.settings.wslDistro)
          .onChange(async (value) => {
            this.plugin.settings.wslDistro = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("LaTeX header file (--include-in-header)")
      .setDesc(
        "Path to a .tex file injected via pandoc --include-in-header. " +
        "Provides: no-split tables/figures (float [H]), needspace for headings, " +
        "NavyBlue hyperref colorlinks, widow/orphan penalties, booktabs, caption styles. " +
        "Leave blank to auto-detect faerie2/forensics/publication-renders/print-ready-header.tex, " +
        "or enter a custom path. Set to 'none' to disable."
      )
      .addText((text) =>
        text
          .setPlaceholder("(auto: faerie2 print-ready-header.tex)")
          .setValue(this.plugin.settings.latexHeaderPath)
          .onChange(async (value) => {
            this.plugin.settings.latexHeaderPath = value.trim() === "none" ? "__disabled__" : value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("External LaTeX template")
      .setDesc(
        "Enable to use a custom pandoc LaTeX template (--template). " +
        "When off (default), inline -V flags control all styling. " +
        "Use this only if you need a fully custom document class."
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.useExternalLatexTemplate)
          .onChange(async (value) => {
            this.plugin.settings.useExternalLatexTemplate = value;
            await this.plugin.saveSettings();
          })
      );

    // Footer
    containerEl.createEl("hr");
    containerEl.createEl("p", {
      text: "Pipeline: Excalidraw → PNG, extract .mmd → mmdc (PNG), 9x_pdf_aspect_sizer.py, mermaid.ink fallback (Step 3.5), pandoc/xelatex + print-ready-header.tex (no-split floats, NavyBlue hyperref). Build logs in <note-folder>/.pdf-build/. All subprocess calls run inside WSL.",
      cls: "setting-item-description",
    });
  }
}
