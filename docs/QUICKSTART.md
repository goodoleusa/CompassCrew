---
type: canon
status: crystallized
tier: quickstart
last_updated: 2026-05-19T00:00:00Z
---

# Quickstart — Five Minutes From Clone to First Crystal

This is the linear walkthrough. Follow it top to bottom. By the end you will have the plugin installed, an MCP token configured, a trail-ref dropped, a compass overlay open, an annotation written, and you will have *seen* a crystallization pass happen.

If you only want the marketing pitch, read [README.md](../README.md). If you want the *why*, read [PHILOSOPHY.md](PHILOSOPHY.md). This doc is the *how*.

---

## Prerequisites

- Obsidian ≥ 1.5
- Node ≥ 18, npm ≥ 9
- A vault you can write to (test vault recommended for first run)
- ~200 MB free disk for `node_modules` during build

You do **not** need: an OpenAI key, a local LLM, a Docker daemon, or admin access to anything. The plugin works fully local for trail-refs, compass overlay, blueprints, callouts, and PDF export. MCP features are optional and free (GitHub OAuth).

---

## Step 1 — Clone and build (≈90 seconds)

```bash
git clone https://github.com/Persistech/faerie-hive-plugin
cd faerie-hive-plugin
npm install
npm run build
```

**What you should see:** `esbuild` outputs `main.js` in the repo root. No errors. `dist/` does not exist — Obsidian loads `main.js` from the plugin folder directly.

**Failure mode A — "Cannot find module 'obsidian'":** You ran `npm install` in the wrong directory. `cd` back into the cloned repo and retry.

---

## Step 2 — Symlink into your vault (≈10 seconds)

```bash
ln -s "$(pwd)" /path/to/your/vault/.obsidian/plugins/hive
```

Replace `/path/to/your/vault/` with the real path. The symlink approach means you can `git pull` and `npm run build` to update; no copy step needed.

**Windows:** use `mklink /D` in an admin shell, or copy the folder if symlinks are painful.

**What you should see:** `ls /path/to/your/vault/.obsidian/plugins/hive` shows the repo contents.

---

## Step 3 — Enable in Obsidian (≈30 seconds)

1. Open your vault in Obsidian.
2. Settings → Community plugins → **Reload plugins** (the circular arrow).
3. Find **Hive** in the list. Toggle it on.
4. You should see a new ribbon icon (🐝) on the left sidebar.

**Failure mode B — Plugin missing from list:** Settings → Community plugins → confirm "Restricted mode" is OFF. Restricted mode hides all community plugins including symlinked ones.

---

## Step 4 — Run doctor (≈20 seconds)

Open the command palette (`Cmd+P` / `Ctrl+P`) and run **`faerie: doctor`**.

A modal opens listing companion plugins you have, should have, and should *never* have:

```
✅ Dataview installed
⚠️  Meta Bind not found — recommended
⚠️  QuickAdd not found — recommended
⚠️  Breadcrumbs not found — recommended
⚠️  ExcaliBrain not found — recommended (for compass overlay)
❌ Templater installed — Hive replaces this; consider disabling
```

Click **Install recommended**. The doctor uses Obsidian's BRAT-style community-plugin install flow. Wait ~30 seconds for downloads.

**What you should see:** All five companions check green. Reload plugins one more time.

---

## Step 5 — Set the MCP token (optional, ≈60 seconds)

Skip this step if you only want local features. Add it later via the same command.

1. Run **`faerie: grab MCP token`** (plugin ≥ v2.1) → opens GitHub OAuth in your browser. Approve. The plugin auto-saves to `<vault>/.swarmy-token`.
2. Or manually: visit `https://your-mcp-server.example.com`, sign in with GitHub, copy the token, then:

```bash
echo "your-token-here" > /path/to/vault/.swarmy-token
chmod 600 /path/to/vault/.swarmy-token
```

**What you should see:** Run **`faerie: doctor`** again — the "MCP connection" row goes green. The 🐝 Faerie Live panel (right sidebar) starts populating with active charters every 60s.

**Failure mode C — "Token rejected (401)":** Your GitHub username is not in `GITHUB_ALLOWED_USERS` on the faerie server. The token file exists but the server refuses it. Either ping the admin to add you or run in local-only mode (the plugin still does 80% of what it does without MCP).

---

## Step 6 — Drop your first trail-ref (≈30 seconds)

Open any note. Highlight a phrase. Press **`Cmd+Shift+H`** (`Ctrl+Shift+H` on Linux/Windows).

A modal opens:

```
Trail-ref bearing:
  ( ) N — unblock (jasper red)
  ( ) S — ship   (emerald green)
  ( ) E — parallel (coral orange)
  ( ) W — baseline (amber yellow)

Destination: [fuzzy file picker]
```

Pick **S** (south / ship), pick any destination note. Confirm.

**What you should see:** The phrase is now a typed link: `[phrase](DESTINATION.md "S")`. With the Hive theme enabled, it renders emerald green. `Cmd+Hover` over it — a peek panel slides in showing the destination's content without navigating away. `Cmd+Click` opens the destination in a new pane.

This is the Latticework affordance, extended with compass typing. See [CONCEPTS.md](CONCEPTS.md#bearings) for what each bearing means.

---

## Step 7 — Open the compass overlay (≈20 seconds)

With any note open that has at least one trail-ref or one frontmatter bearing field (e.g., `north: [[Other Note]]`), run **`faerie: compass overlay for current note`**.

An ExcaliBrain pane opens to the right. The current note sits in the center as a hexagon. Its N/S/E/W neighbors are rendered as colored nodes:

- North-edges: jasper red (the blockers, the prerequisites)
- South-edges: emerald green (the deliverables, what ships next)
- East-edges: coral orange (the sister work, the parallel tracks)
- West-edges: amber yellow (the baselines, what to re-validate)

**What you should see:** A typed graph, not a generic backlinks blob. The native Obsidian graph cannot show typed edges; this can. Click any node to navigate.

If the pane is empty: the note has no bearings yet. Add some via trail-refs (Step 6) or by editing frontmatter.

---

## Step 8 — Write your first annotation (≈45 seconds)

Open any AI-authored note (any note in `00-SHARED/Daily/{date}/` will do; if you have none yet, create one with `> [!droplet] test insight` as the body).

Run **`faerie: annotate current artifact`** (or `Cmd+Shift+M`).

A new note opens in `Human/{date}/`, prefilled with:

```yaml
---
type: annotation
references_ai_artifact: 00-SHARED/Daily/2026-05-19/something.md
references_sha256: <sha256 of that artifact>
created: 2026-05-19T14:32:00Z
---

# Annotation

<write here>
```

Write a sentence. Save. **What you should see:**

1. Your annotation is now in `Human/2026-05-19/`, hash-stamped against the artifact.
2. `forensics/coc-human.jsonl` has a new line appending your annotation's hash.
3. If MCP is configured, the annotation is POSTed to the faerie server. The next agent that loads a bundle including this artifact will see your annotation via `{{ human_annotations }}`.

You just steered the AI without writing a single prompt. See [PHILOSOPHY.md](PHILOSOPHY.md#3-anytime-steering-live-or-queued) for why this matters.

---

## Step 9 — Trigger a crystallization pass (≈60 seconds)

If you have run a full session (multiple agents have landed manifests in `00-SHARED/Daily/{date}/`), run **`faerie: crystallize today`**.

The crystallizer:

1. Scans today's daily folder for sibling manifests (same w4w address prefix).
2. Detects near-duplicates via SHA-similarity + bearing overlap.
3. Merges siblings into one canonical manifest.
4. Writes a HONEY droplet to `forensics/honey/{date}/{slug}.md` summarizing survivors.
5. Retires losers to `forensics/ephemeral/` with `superseded_by:` pointers.

**What you should see:** A summary modal:

```
Crystallization complete.
  - 12 manifests scanned
  - 4 sibling-clusters detected
  - 4 honey droplets minted
  - 8 manifests retired to forensics/ephemeral/
  - Daily folder: 6 surviving canonical notes
```

The daily folder is now clean. Nothing was deleted — the chain holds. The mess landed and dissolved. See [CRYSTALLIZATION-DISCIPLINE.md](CRYSTALLIZATION-DISCIPLINE.md) for the principle.

---

## Where to go next

You now have the full loop running: AI artifacts land, you annotate, bearings type the connections, the compass shows the topology, crystallization cleans up.

Three good next moves:

1. **Read [CONCEPTS.md](CONCEPTS.md)** — learn the grammar (charters, manifests, anchors, droplets, trails). Every emoji ties to a real semantic role.
2. **Run `faerie: breadcrumbs tutorial`** — generates a vault-local tutorial explaining the 4-field bearing model in plain English.
3. **Open `00-SHARED/Faerie-System-Internals/00-Home.md`** — every AI template, formula, and system prompt as a real Obsidian note. Inspect them. Edit them. The vault is the cockpit.

If you want the architectural picture, see [ARCHITECTURE.md](ARCHITECTURE.md). If you want to know how Hive differs from Smart Connections / Copilot / Local GPT / RAG plugins, see [COMPARISON.md](COMPARISON.md).

🐝 → 🌼 → 🍯
