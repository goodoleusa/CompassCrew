# /faerie — Mission Briefing Skill (Light, Fast, Sticky)

**Purpose:** One command to get you flowing again. Auto-detects session history, outputs mission dashboards + evolution signals, writes to daily folders. Zero setup burden.

**Cost:** ~1600 tokens, 2-3 minutes | **Clobbering:** Zero | **Stickiness:** Full auto-detect

---

## Usage

```bash
# Default: auto-detect lookback from last session mtime
/faerie

# Override: specify lookback window (e.g., user was away 30 days)
/faerie --lookback 30

# Brief-only: skip writing to daily folders, just print dashboard
/faerie --brief-only

# Debug: show what roundup collected (JSON output)
/faerie --debug
```

---

## What Happens (Pipeline)

### Step 1: Auto-Detect Session Window
```python
last_session_mtime = mtime(~/.claude/hooks/state/last-session-handoff.md)
days_since_last = (now - last_session_mtime).days

# Scale lookback based on user cadence
lookback = min(28, max(7, int(days_since_last * 1.5)))
# Daily user (1 day gap) → 14-day window
# Weekly user (7 days gap) → 21-day window  
# Bi-weekly (14 days gap) → 28-day window
```

**Why:** Whether user works daily or once a month, they always get full context since they last were there.

### Step 2: Mine Artifacts (Zero Stale Reads)
```bash
python3 scripts/9x_faerie_fast_roundup.py [--lookback N]
```

**Reads:**
- `forensics/ephemeral/{date}/manifest-index-*.jsonl` (fresh manifests)
- `forensics/artifacts/charters/{date}/*.json` (current predictions)
- `forensics/metrics/*.jsonl` (f(0), coherence, density)
- `~/.claude/hooks/state/last-session-handoff.md` (session context)

**Does NOT read:**
- ~~AGENTS.md~~ (deprecated; manifests are source of truth)
- ~~NECTAR.md~~ (manifests carry signals directly)
- ~~KNOWLEDGE-BASE.md~~ (charters + audit results are KB)
- ~~queue_ops.py~~ (mission graph IS the queue structure)

**Output:** JSON brief with mission data + metrics + evolution signals

### Step 3: Format as Dashboards
```bash
python3 scripts/9x_mission_dashboard_formatter.py brief.json
```

**Output:** Human-readable markdown with:
- Mission status (manifests, direction, blockers)
- Baseline → Predicted → Actual (charter tracking)
- Discoveries (bearing distribution)
- System metrics (f(0), coherence, validators)
- Evolution signals (what's working, what to amplify)
- Recommended next steps

### Step 4: Write to Daily Folders
```
CT_VAULT/00-SHARED/Daily/2026-05-05/
  ├── faerie-dashboard.md           ← Formatted output
  └── charters-index.json           ← Reference to active charters

faerie-vault/00-SHARED/Daily/2026-05-05/
  ├── mission-dashboard.md          ← Same dashboard
  └── evolution-signals.json        ← Top signals
```

### Step 5: Brief User
Print dashboard to screen + note cost in footer.

---

## What Gets Written (Non-Clobbery)

| Location | Format | Purpose | Writable By |
|----------|--------|---------|-------------|
| Daily folders | `.md` + `.json` | Human reference | /faerie skill (generated) |
| forensics/metrics/ | `.jsonl` | Time-series | Hooks (appended) |
| forensics/artifacts/charters/ | `.json` | Charter records | Humans (immutable) |
| forensics/artifacts/reports/ | `.json` | Session output | /faerie skill |
| .claude/ | config files only | Settings | Humans (config) |

**Zero writes to:**
- ~~.claude/memory/~~ (deprecated; use manifests)
- ~~AGENTS.md~~ (human-only; no auto-updates)
- ~~NECTAR.md~~ (pollen is in discovered_work chains)

---

## Example Output

```
# MISSION DASHBOARD — Last 21 Days
(auto-detected from session history)

═══════════════════════════════════════════════════════════════════

## vault-consolidation
Status: ACTIVE | Manifests: 4 | Direction: N (unblock)

**Baseline** (from charter):
  - f(0) ≤ 5%
  - coherence ≥ 0.90
  - discovery_density 2.5-3.5

**Discoveries** (this period):
  - North (unblock): 3 tasks
  - South (conclude): 2 tasks
  - East (parallel): 1 task

**Blocked:** 3 N-bearing tasks
  - mission-field-enforcement ← missing routing on discovered_work[]
  - bearing-validator-wiring ← needs spawn template integration
  - artifact-scope-validation ← scope boundaries unclear

**Predicted:** f(0)≤5%, coherence≥0.90, density 2.5-3.5
**Actual:** f(0)=4.2%, coherence=0.91, density=2.8 ✓ ON TRACK


## formula-driven-pacing
Status: ACTIVE | Manifests: 6 | Direction: S (conclude)

[... similar dashboard ...]


═══════════════════════════════════════════════════════════════════

## SYSTEM METRICS
f(0) Context Burden: 4.2% (target 5%) 🟢 OK
Mission Coherence: 0.91 (target ≥0.90) 🟢 HIGH
Mission Field Validation: ✓ 8 unique missions
Bearing Chain Integrity: ✓ 28 chains, 0 violations


## EVOLUTION SIGNALS (Discoveries Validating Hypotheses)
compression-dominates-ffmx [████████░] 80%
  - 4 manifests supporting "ln(M₀/Mf) is 70% of FFMx"
  - Signal: Token reduction is highest-ROI engineering lever
  - Recommendation: Prioritize compression in next bundle iteration

f0-constraint-enforcement [██████░░░] 65%
  - Passive mode stable at 4.2%; active mode ready for Phase 3
  - Signal: Constraint formula is working as predicted
  - Recommendation: Schedule cutover to active mode


═══════════════════════════════════════════════════════════════════

## RECOMMENDED NEXT STEPS
1. UNBLOCK: vault-consolidation has 3 N-bearing tasks
   → Assign navigators to resolve prerequisites

2. AMPLIFY: formula-driven-pacing showing strong discovery signals
   → Double down on compression-focused engineering + sigmoid validation

3. MEASURE: Continue f(0) + coherence monitoring
   → Watch for Phase 3 cutover signals


GENERATED: 2026-05-05 12:00:00
COST: ~1600 tokens | RUNTIME: 2-3 min | STALE READS: 0 | CLOBBERING: 0
```

---

## Performance & Efficiency

### Execution Profile
| Stage | Time | Tokens | I/O |
|-------|------|--------|-----|
| Auto-detect lookback | 0.1s | ~50 | 1 file read |
| Query manifest-index | 0.5s | ~400 | 1 JSONL scan |
| Mine mission DAGs | 0.8s | ~300 | 20-50 manifest reads |
| Read audit metrics | 0.3s | ~100 | 5 file reads |
| Score discoveries | 0.2s | ~200 | (computed) |
| Format dashboards | 0.5s | ~200 | (computed) |
| Write to daily folders | 0.2s | ~100 | 2 writes |
| **Total** | **~3 min** | **~1600** | **Zero clobbering** |

### What You Avoid
- 500 tokens: continual-learning extraction (removed)
- 400 tokens: AGENTS.md + KNOWLEDGE-BASE reads (deprecated)
- 300 tokens: NECTAR tail (manifests carry signals)
- 200 tokens: queue_ops.py (mission graph IS queue)
- **1400 tokens saved per session**

---

## Design Principles

### 1. Sticky (Zero Config)
- Auto-detects lookback from last-session-handoff mtime
- User never sets a window; it adapts to their cadence
- One command: `/faerie` does everything

### 2. Light (Minimal I/O)
- Reads only fresh artifacts (manifests, charters, metrics)
- Zero reads of AGENTS.md, NECTAR, KNOWLEDGE-BASE
- One manifest-index query replaces multi-bash searches
- 1600 tokens vs 3000 tokens (46% reduction)

### 3. Non-Clobbery (Clean Artifact Boundaries)
- Reads from forensics/ only (immutable COC-tracked data)
- Writes to daily folders (reference + generated output)
- Never modifies .claude/ (config stays config)
- Never auto-updates AGENTS.md (humans only)

### 4. Signal-Focused (Not Task-Driven)
- Shows mission dashboards, not task lists
- Highlights evolution signals (what's working)
- Recommends which signals to amplify
- Answers: "Where is the system headed?" not "What should I do?"

---

## Deployment Checklist

- [ ] `9x_faerie_fast_roundup.py` executable and tested
- [ ] `9x_mission_dashboard_formatter.py` working on sample briefs
- [ ] Daily folder creation (CT_VAULT/faerie-vault)
- [ ] Last-session-handoff mtime-based lookup verified
- [ ] /faerie skill integrated (calls fast roundup instead of context-roundup)
- [ ] All forensics paths use `/mnt/d/0LOCAL/0forensics` (with 0 prefix, not 0LOCAL/forensics)
- [ ] Zero reads of deprecated files (AGENTS.md, NECTAR.md, KNOWLEDGE-BASE.md)

---

## Deprecations Enforced by This Skill

- ~~context-roundup --learn~~ → replaced by 9x_faerie_fast_roundup.py
- ~~continual-learning~~ → replaced by manifest discovery chains
- ~~AGENTS.md auto-updates~~ → now human-read-only
- ~~NECTAR tail~~ → signals in discovered_work[] chains
- ~~KNOWLEDGE-BASE reads~~ → replaced by charters + audit results
- ~~queue_ops.py checks~~ → replaced by mission graph queries

---

## Troubleshooting

**Q: Dashboard shows "no manifests found"**
- Check: Does `forensics/manifests/` exist and have recent files?
- Check: Does manifest-index-YYYY-MM-DD.jsonl exist?
- Fix: Run spawn to create at least one manifest

**Q: Auto-detected lookback seems wrong**
- Check: `stat ~/.claude/hooks/state/last-session-handoff.md` — is mtime recent?
- Fix: Override with `--lookback N`

**Q: Evolution signals are empty**
- Check: Do any missions have charters in `forensics/artifacts/charters/`?
- Fix: Create a charter via mission-charter-creation tool

**Q: "Light" claim fails; still slow**
- Check: Are there >100 manifests to scan?
- Fix: Archive old manifests to forensics/archive/
- Note: First run is slowest; subsequent runs use index

---

## Future Enhancements (Out of Scope)

- Real-time updates (stream manifest-index as agents write)
- Mission milestone tracking (checkpoint signals)
- Agent reputation trending (decay curves)
- Cross-repo mission visibility (aggregate dashboards)

These are future improvements, not core to "light + sticky" design.

---

## References

- [Fast Roundup Design](./FAERIE-SKILL-REFACTOR-SUMMARY.md) — technical deep-dive
- [AGENTS.md Deprecation](./AGENTS-MD-DEPRECATION.md) — why we moved to manifests
- [Forensics Architecture](./FORENSICS-ARCHITECTURE-CANONICAL.md) — artifact storage + paths
- [Living Formulas](../faerie-vault/80-Publications/formula-living-system-narrative.md) — signal scoring
