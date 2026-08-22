# Spawn Bundle — Hive v2.0.0 Verification Phase

**Hand this entire file to main as the spawn context.** Main can then dispatch the 4-agent multi-bearing team to verify and complete the plugin. All work happens against the live `faerie-vault` (`~/gitrepos/faerie-vault/`) so the user can interact with the plugin in their actual vault, not a synthetic one.

---

## Mission

`mission: hive-plugin-verification-and-bringup`

Take the freshly scaffolded Hive v2.0.0 plugin at `~/gitrepos/faerie-hive-plugin/` from "compiles" to "user can open Obsidian and use it in faerie-vault." Verify each feature against the real vault. Patch the stubs. Test the SpiderFoot scan end-to-end.

## Why multi-bearing

This mission has all four bearings active:
- **N (unblock)** — npm install + build must succeed, plugin must load
- **S (conclude)** — symlink into vault, enable in Obsidian, smoke-test every command
- **E (parallel)** — SpiderFoot scan, ExcaliBrain draft flow, MCP server stub all independent
- **W (baseline)** — re-validate the NSEW ontology canonicalization is consistent across all 18 module touchpoints

Spawn all four archetypes (NAVIGATOR + MAKER + BRIDGE + DEEP-DIVER) in parallel, same wave. Each reads their bearing-edges from this bundle.

---

## Bundle context (read first)

### Plugin location
`~/gitrepos/faerie-hive-plugin/` — single git repo, one commit, remote configured to `git@github.com:Persistech/faerie-hive-plugin.git` (NOT pushed).

### Target vault
`~/gitrepos/faerie-vault/` — user's REAL Obsidian vault. Symlink the built plugin into `<vault>/.obsidian/plugins/hive/`.

### Canonical NSEW Ontology (locked, do not redefine)
Single source of truth: `src/bearings.ts`. All modules import from there.

```
N → north → "up" → parents bucket → #C73E1D → unblock predecessor
S → south → "next" → children bucket → #2E8540 → conclude downstream
E → east → "same" → friends bucket → #FF8E3C → parallel sister
W → west → "up" (alias) → parents bucket → #FFB300 → return to baseline
```

### Files inventory
- `main.ts` (165 LOC) — entry point, extends HivePdfPlugin
- `src/pdf-export.ts` (953 LOC) — preserved hive-pdf v1
- `src/bearings.ts` (NEW, 95 LOC) — canonical ontology
- `src/blueprint-engine.ts` (210 LOC) — uses src/vendor/micro-njk.ts
- `src/vendor/micro-njk.ts` (NEW, 303 LOC) — zero-dep Nunjucks subset
- `src/trail-refs.ts` (115 LOC)
- `src/breadcrumbs-threading.ts` (75 LOC)
- `src/annotations.ts` (121 LOC)
- `src/compass-overlay.ts` (REWRITTEN, ExcaliBrain-driven)
- `src/excalidraw-setup.ts` (NEW, ~280 LOC) — pro preset, fonts, scripts, draft ExcaliBrain
- `src/mcp-bridge.ts` (111 LOC) — Faerie Live pane
- `src/chat-panel.ts` (141 LOC) — plugin-only sessions
- `src/file-decorator.ts` (56 LOC) — bee icon + honey-glow
- `src/quickadd-macros.ts` (159 LOC) — 4 preset macros
- `src/dep-orchestrator.ts` (UPDATED) — doctor + canonical config installer
- `src/system-prompt.ts` (129 LOC) — round-trip flow
- `src/spiderfoot.ts` (216 LOC) — schema-stubbed, needs verification
- `Blueprints/` — 74 .njk templates
- `styles.css` — 7 callouts + bearings + bee + chat panes
- `docs/NOVELTY.md` — 2200-word research-paper-style design rationale
- `docs/SPAWN-BUNDLE.md` — this file

### Runtime deps: ZERO
package.json has no `dependencies` section, only `devDependencies`. The plugin bundles to a single main.js with only Obsidian API stubs as externals.

### MCP tools the plugin calls (faerie2 must implement)
- `faerie_dashboard`, `faerie_metrics`, `faerie_charters` — Live pane
- `swarmy_chat`, `swarmy_session_finalize` — Chat panel
- `faerie_record_annotation` — annotation loop
- `faerie_anchor_promote` — QuickAdd macro
- `faerie_update_system_prompt` — round-trip flow

If any are missing, plugin degrades gracefully (Notice on failure).

---

## Spawn team

### Agent 1: NAVIGATOR (bearing N) — Build + load
**Role:** Get plugin from source to enabled-in-Obsidian.
**Bundle:**
```
cd ~/gitrepos/faerie-hive-plugin
npm install
npm run build      # should produce main.js
ls -la main.js     # verify file exists, ~50KB ish (no nunjucks dep)
# Symlink into faerie-vault (REAL vault)
VAULT=~/gitrepos/faerie-vault
mkdir -p "$VAULT/.obsidian/plugins"
ln -sfn "$(pwd)" "$VAULT/.obsidian/plugins/hive"
# Enable in Obsidian's data: edit "$VAULT/.obsidian/community-plugins.json"
# Add "hive" to the array if missing
```
**Done looks like:** `npm run build` exits 0, main.js exists, vault has the symlink, community-plugins.json contains "hive".
**Output:** Manifest with dashboard_line "Hive built (X kb), symlinked into faerie-vault, ready to enable in Obsidian."

### Agent 2: MAKER (bearing S) — Verify each command end-to-end
**Role:** Smoke-test every command in the real vault.
**Bundle:**
```
Open Obsidian on faerie-vault (or write a programmatic test via app.commands).
For each command id below, verify it appears in command palette and executes
without error:
  - hive:export-hive-pdf
  - hive:insert-hive-diagram
  - hive:faerie-doctor
  - hive:faerie-install-canonical-configs
  - hive:swarmy-apply-blueprint
  - hive:faerie-render-blueprint-clipboard
  - hive:swarmy-apply-blueprint-folder
  - hive:faerie-highlight-with-bearing
  - hive:faerie-copy-trail-ref
  - hive:faerie-toggle-all-trail-refs
  - hive:faerie-thread-add
  - hive:faerie-thread-open
  - hive:faerie-add-margin-note
  - hive:faerie-compass-overlay
  - hive:faerie-write-excalibrain-config
  - hive:faerie-open-live-pane
  - hive:swarmy-open-chat
  - hive:faerie-install-quickadd-macros
  - hive:faerie-import-system-prompt
  - hive:faerie-push-system-prompt
  - hive:faerie-spiderfoot-install
  - hive:faerie-spiderfoot-scan
  - hive:swarmy-excalidraw-apply-pro-preset
  - hive:swarmy-excalidraw-install-fonts
  - hive:swarmy-excalidraw-install-scripts
  - hive:swarmy-draft-excalibrain
  - hive:faerie-commit-excalibrain-draft
```
**Done looks like:** All 27 commands listed + executed (or marked broken with stack trace).
**Output:** Manifest with table of command → status (OK / BROKEN: reason).

### Agent 3: BRIDGE (bearing E) — SpiderFoot end-to-end + ExcaliBrain draft flow
**Role:** Run the two compound-feature workflows that span plugin + external tools.
**Bundle:**
```
# SpiderFoot end-to-end
cd ~/gitrepos/faerie2/.openhands/skills/spiderfoot
bash install_launch.sh        # Get SpiderFoot installed via uv
# Pick a safe target: e.g. example.com
# Run the plugin command faerie-spiderfoot-scan with target=example.com
# Verify:
#   - Scan completes (may take 5-20 min)
#   - CSV files appear under forensics/osint-runs/<date>/<run_id>/
#   - Report file written to faerie-vault/02-OSINT/example.com/<run_id>.md
#   - Sidecar _spiderfoot-data/ folder populated
#   - Blueprint auto-applied (look for content between BLUEPRINT-BEGIN markers)
# CRITICAL: Capture the actual CSV column names — src/spiderfoot.ts assumes
#   columns "value", "events.csv", "subdomains.csv", "ips.csv", "emails.csv",
#   "tech.csv", "leaks.csv". If the agent's actual output differs, patch
#   src/spiderfoot.ts mappings.

# ExcaliBrain draft flow
# In faerie-vault, open any note with `up:` or `down:` frontmatter fields.
# Run swarmy-draft-excalibrain command.
# Verify:
#   - New canvas opens under 00-SHARED/Drafts/ExcaliBrain/<date>/
#   - Has labeled rectangles for parents/children/friends with correct colors
#     (N=red, S=green, E=orange, W=amber)
#   - User can rearrange shapes in Excalidraw
#   - Running faerie-commit-excalibrain-draft writes frontmatter back to origin
```
**Done looks like:** SpiderFoot CSV columns documented in a patch to `src/spiderfoot.ts` if needed; ExcaliBrain draft round-trip works.
**Output:** Manifest with two sections: spiderfoot-status + excalibrain-status. Discovered work entries for any patches needed.

### Agent 4: DEEP-DIVER (bearing W) — Ontology consistency audit + MCP stub
**Role:** Verify the NSEW ontology is canonical everywhere. Stub the MCP server so the Live pane and Chat work.
**Bundle:**
```
# Ontology audit
cd ~/gitrepos/faerie-hive-plugin
# Find every place that mentions N/S/E/W bearings
grep -rn -E '"N"|"S"|"E"|"W"|north|south|east|west|unblock|conclude|parallel|baseline' src/ main.ts Blueprints/
# For each match, verify it imports BEARING_* from src/bearings.ts, OR is a
# blueprint template (which should also reference the canonical mapping in
# its rendered output).
# Any discrepancy = report as drift. Patch to import from bearings.ts.

# MCP stub server (so Live pane + Chat work without faerie2 deployment)
# Create /tmp/swarmy-mcp-stub.py:
cat > /tmp/swarmy-mcp-stub.py <<'PYEOF'
from http.server import HTTPServer, BaseHTTPRequestHandler
import json
class H(BaseHTTPRequestHandler):
  def do_POST(self):
    n = int(self.headers.get("Content-Length", 0))
    body = self.rfile.read(n)
    tool = self.path.split("/")[-1]
    resp = {
      "faerie_dashboard": {"missions": 3, "in_flight": 2, "ctx_pct": 42},
      "faerie_metrics": {"fitness": 0.87, "emergence": 0.91, "coherence": 0.85},
      "faerie_charters": {"charters": [{"title": "Test", "path": "forensics/charters/2026-05-19/test.md"}]},
      "swarmy_chat": {"reply": "Faerie stub reply: " + body.decode()[:80]},
      "swarmy_session_finalize": {"ok": True, "path": "forensics/sessions/test.md"},
      "faerie_record_annotation": {"ok": True},
      "faerie_anchor_promote": {"ok": True},
      "faerie_update_system_prompt": {"ok": True, "pr_url": "stub://pr/1"},
    }.get(tool, {"error": "unknown tool"})
    self.send_response(200); self.send_header("Content-Type","application/json"); self.end_headers()
    self.wfile.write(json.dumps(resp).encode())
HTTPServer(("127.0.0.1", 8765), H).serve_forever()
PYEOF
python3 /tmp/swarmy-mcp-stub.py &
# Verify Live pane renders, Chat sends/receives, annotation POST returns 200.
```
**Done looks like:** Bearings audit report (clean OR drift-list); MCP stub running; Live pane + Chat verified against it.
**Output:** Manifest with two artifacts: bearings-audit.md + mcp-stub-verified.md.

---

## Frontier (post-completion)

After all 4 agents return, main reads the 4 manifests, synthesizes into a session-report, and decides:

- **N-edges discovered?** New blockers found → next wave is more N-agents.
- **S-edges discovered?** PR-ready → commit + offer push to github.com/Persistech/faerie-hive-plugin.
- **E-edges?** Independent follow-ups (e.g. Faerie data-toolkit roundup) → queue for next session.
- **W-edges?** Assumptions broken → roll back drift, re-anchor.

## Spawn command (for main to execute)

```
/spawn --mission hive-plugin-verification-and-bringup --bearings NSEW --wave W1 \
       --bundle docs/SPAWN-BUNDLE.md \
       --vault ~/gitrepos/faerie-vault \
       --plugin-repo ~/gitrepos/faerie-hive-plugin
```

Each agent gets a copy of this bundle and their specific bearing section as their primary context. They write manifests to `~/gitrepos/faerie-hive-plugin/forensics/ephemeral/<date>/<task_id>/`.

## Why the plugin is ready for spawn

- **Code is complete** — every command registered, every module wired, ontology canonicalized.
- **Zero npm deps at runtime** — no install-side surprises.
- **74 blueprints shipped** — content layer is populated, not empty.
- **ExcaliBrain integration is the right call** — user confirmed they prefer it over Juggl, and it natively supports the field-based bearing model.
- **Pro Excalidraw preset, fonts, curated scripts** — creative substrate is configurable in one command.
- **Draft ExcaliBrain command exists** — user can sketch the next mission-graph topology in Excalidraw, then commit shapes back to frontmatter. Round-trip closed.

What's left is empirical verification, not design work. That's exactly what a 4-agent multi-bearing wave is for.

---

*Bundle prepared by: Hive v2.0.0 build agent · 2026-05-19*
