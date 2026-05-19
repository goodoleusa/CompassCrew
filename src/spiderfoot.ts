import { App, Modal, Notice, Plugin, TFile } from "obsidian";
import * as fs from "fs";
import * as path from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

/**
 * SpiderFoot integration.
 *
 * Flow:
 *  1. User runs "Faerie: SpiderFoot scan target".
 *  2. Plugin invokes the faerie2 SpiderFoot skill via WSL/bash, which uses
 *     a uv/poetry-managed venv to keep the local install stable (the install
 *     is famously finicky — pinning python + spiderfoot version via
 *     `install_launch.sh` in the skill folder solves it).
 *  3. The agent writes its scan output (events JSON + CSV exports) to a
 *     run-id-stamped folder under forensics/osint-runs/<date>/<run_id>/.
 *  4. Plugin reads that folder, summarises into the OSINT-Spiderfoot-Report
 *     blueprint, writes the report to vault/02-OSINT/<target>/<run_id>.md,
 *     and copies the CSVs into a sibling `_spiderfoot-data/` sidecar.
 *  5. No JSON is shown in the rendered report; the CSVs are linked.
 *
 * The plugin never parses raw HTML from SpiderFoot's web UI — it consumes
 * only the agent's structured exports. This keeps Obsidian-side rendering
 * deterministic and the report beautiful.
 */

export interface SpiderfootSettings {
  faerieRepoRoot: string;          // absolute; e.g. /mnt/d/0local/gitrepos/faerie2
  skillRelPath: string;            // e.g. .openhands/skills/spiderfoot
  pythonRunner: "uv" | "poetry" | "system";
  outputBase: string;              // vault-relative; e.g. 02-OSINT
}

export const DEFAULT_SPIDERFOOT_SETTINGS: SpiderfootSettings = {
  faerieRepoRoot: "/mnt/d/0local/gitrepos/faerie2",
  skillRelPath: ".openhands/skills/spiderfoot",
  pythonRunner: "uv",
  outputBase: "02-OSINT",
};

function vaultRoot(app: App): string {
  return (app.vault.adapter as unknown as { basePath: string }).basePath;
}

class TargetModal extends Modal {
  inputEl!: HTMLInputElement;
  constructor(app: App, private onSubmit: (target: string) => void) { super(app); }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "SpiderFoot scan" });
    contentEl.createEl("label", { text: "Target (domain / IP / email / name):" });
    this.inputEl = contentEl.createEl("input", { type: "text" });
    this.inputEl.style.width = "100%";
    const btn = contentEl.createEl("button", { text: "Run scan" });
    btn.onclick = () => {
      const v = this.inputEl.value.trim();
      if (!v) return;
      this.onSubmit(v);
      this.close();
    };
  }
  onClose() { this.contentEl.empty(); }
}

function csvRowCount(csvPath: string): number {
  try {
    const raw = fs.readFileSync(csvPath, "utf8");
    const lines = raw.split(/\r?\n/).filter((l) => l.length > 0);
    return Math.max(0, lines.length - 1);
  } catch { return 0; }
}

function readCsvColumn(csvPath: string, columnName: string, limit = 50): string[] {
  try {
    const raw = fs.readFileSync(csvPath, "utf8");
    const lines = raw.split(/\r?\n/);
    if (!lines.length) return [];
    const header = lines[0].split(",");
    const idx = header.indexOf(columnName);
    if (idx < 0) return [];
    const out: string[] = [];
    for (let i = 1; i < lines.length && out.length < limit; i++) {
      const cols = lines[i].split(",");
      if (cols[idx]) out.push(cols[idx].replace(/^"|"$/g, ""));
    }
    return out;
  } catch { return []; }
}

export function registerSpiderfoot(plugin: Plugin, getSettings: () => SpiderfootSettings) {
  plugin.addCommand({
    id: "faerie-spiderfoot-install",
    name: "Faerie: SpiderFoot install / repair (uv venv)",
    callback: async () => {
      const s = getSettings();
      const skill = path.join(s.faerieRepoRoot, s.skillRelPath);
      const installer = path.join(skill, "install_launch.sh");
      if (!fs.existsSync(installer)) {
        new Notice(`Installer not found: ${installer}`); return;
      }
      new Notice("SpiderFoot install starting (background). Watch terminal for progress.", 8000);
      const cmd = s.pythonRunner === "uv"
        ? `bash -lc "cd '${skill}' && uv venv .venv && uv pip install -r requirements.txt 2>/dev/null; bash '${installer}'"`
        : s.pythonRunner === "poetry"
        ? `bash -lc "cd '${skill}' && poetry install && bash '${installer}'"`
        : `bash -lc "bash '${installer}'"`;
      try {
        const { stdout, stderr } = await execAsync(cmd, { maxBuffer: 64 * 1024 * 1024 });
        new Notice("SpiderFoot install finished. See log output.", 6000);
        console.log("[spiderfoot:install]", stdout, stderr);
      } catch (e) {
        new Notice("SpiderFoot install failed: " + (e as Error).message, 10000);
      }
    },
  });

  plugin.addCommand({
    id: "faerie-spiderfoot-scan",
    name: "Faerie: SpiderFoot scan target",
    callback: () => {
      new TargetModal(plugin.app, async (target) => {
        const s = getSettings();
        const skill = path.join(s.faerieRepoRoot, s.skillRelPath);
        const date = new Date().toISOString().slice(0, 10);
        const runId = `sf-${Date.now()}`;
        const outDir = path.join(s.faerieRepoRoot, "forensics", "osint-runs", date, runId);
        fs.mkdirSync(outDir, { recursive: true });

        const py = s.pythonRunner === "uv"
          ? `uv run --project '${skill}' python '${skill}/spiderfoot.py'`
          : s.pythonRunner === "poetry"
          ? `cd '${skill}' && poetry run python spiderfoot.py`
          : `python3 '${skill}/spiderfoot.py'`;
        const cmd = `bash -lc "${py} --target '${target.replace(/'/g, "")}' --out '${outDir}'"`;

        new Notice(`SpiderFoot scanning ${target}… (this can take 5–20 min)`, 8000);
        try {
          await execAsync(cmd, { maxBuffer: 256 * 1024 * 1024, timeout: 30 * 60 * 1000 });
        } catch (e) {
          new Notice("SpiderFoot scan failed: " + (e as Error).message, 10000);
          return;
        }

        // Build sidecar inside the vault.
        const vault = vaultRoot(plugin.app);
        const reportDir = path.join(vault, s.outputBase, target.replace(/[^a-zA-Z0-9._-]/g, "_"));
        const sidecar = path.join(reportDir, "_spiderfoot-data");
        fs.mkdirSync(sidecar, { recursive: true });
        for (const f of fs.readdirSync(outDir)) {
          if (f.endsWith(".csv")) {
            fs.copyFileSync(path.join(outDir, f), path.join(sidecar, f));
          } else if (f.endsWith(".json")) {
            // Store raw JSON under sidecar but rename to _raw.json so it
            // doesn't surface in Obsidian's file explorer as a primary doc.
            fs.copyFileSync(path.join(outDir, f), path.join(sidecar, `_raw_${f}`));
          }
        }

        // Summarise into report frontmatter.
        const eventsCsv = path.join(sidecar, "events.csv");
        const subsCsv = path.join(sidecar, "subdomains.csv");
        const reportPath = path.join(reportDir, `${runId}.md`);
        const counts = {
          subdomain: csvRowCount(subsCsv),
          ip: csvRowCount(path.join(sidecar, "ips.csv")),
          email: csvRowCount(path.join(sidecar, "emails.csv")),
          tech: csvRowCount(path.join(sidecar, "tech.csv")),
          leak: csvRowCount(path.join(sidecar, "leaks.csv")),
        };
        const subdomains = readCsvColumn(subsCsv, "value", 30);
        const eventsTotal = csvRowCount(eventsCsv);

        const fm = [
          "---",
          "type: osint-report",
          "source: spiderfoot",
          `target: "${target}"`,
          `run_id: ${runId}`,
          `scanned_at: ${new Date().toISOString()}`,
          `events_total: ${eventsTotal}`,
          `sidecar_dir: ./_spiderfoot-data/`,
          "counts:",
          `  subdomain: ${counts.subdomain}`,
          `  ip: ${counts.ip}`,
          `  email: ${counts.email}`,
          `  tech: ${counts.tech}`,
          `  leak: ${counts.leak}`,
          "subdomains:",
          ...subdomains.map((s) => `  - "${s}"`),
          "narrative: \"Scan completed. Review findings below; structured exports in ./_spiderfoot-data/.\"",
          "---",
          "",
          `> [!brood] SpiderFoot scan ${target} — apply blueprint **OSINT-Spiderfoot-Report** to render the full report.`,
          "",
          "<!-- BLUEPRINT-BEGIN:OSINT-Spiderfoot-Report -->",
          "<!-- BLUEPRINT-END:OSINT-Spiderfoot-Report -->",
          "",
        ].join("\n");
        fs.writeFileSync(reportPath, fm, "utf8");

        // Open the report and auto-apply the blueprint.
        const rel = path.relative(vault, reportPath).replace(/\\/g, "/");
        const tfile = plugin.app.vault.getAbstractFileByPath(rel);
        if (tfile instanceof TFile) {
          await plugin.app.workspace.getLeaf(true).openFile(tfile);
          (plugin.app as any).commands.executeCommandById("hive:faerie-apply-blueprint");
        }
        new Notice(`SpiderFoot scan complete: ${eventsTotal} events. Report: ${rel}`, 12000);
      }).open();
    },
  });
}
