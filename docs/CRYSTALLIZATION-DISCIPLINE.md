# 💎 Crystallization Discipline

> The biggest problem with Obsidian is it will grow over time. Atomization makes
> connections visible — but then things get messy. Crystallization is how we
> control the chaos.

## The principle

A vault left to itself bloats. Atomic notes pile up. Templates land but never get
trimmed. Daily folders sprawl. Agents write generously to grab attention.

The hive solves this not by writing less, but by writing **in cycles** that
include their own refinement. Within the same session:

```
Phase 1 — Voluminous   →    Phase 2 — Crystallized
─────────────────────       ────────────────────────
Write fast. Write often.    Sync scripts run. Sibling
First impressions matter.   notes detect overlap, merge,
Land 5 takes on a problem.  prune dupes. Promote the
Brainstorm in markdown.     surviving paragraph. Retire
                            the others to forensics/.
                            One crystal remains.
```

The vault never gets messy because **the refinement isn't a separate task you
forgot to do**. It's part of the same cycle the writing belongs to.

## How the cycle runs

### Voluminous phase

- Multiple agents land notes within minutes of each other
- Each writes generously — full sentences, redundant context, three takes on
  every idea
- Notes land in `00-SHARED/Daily/{date}/{task_id}/` with full frontmatter
- First impressions are the point — the agent isn't trying to be terse, it's
  trying to be *findable*
- Bearings, charters, addresses all get written even when redundant

### Crystallization phase (same session, automatically)

Sync scripts fire on a schedule (or on session-end, or on user demand):

1. **`scripts/dev/vault/06-daily-mirror.py`** — pulls source-of-truth from
   `forensics/ephemeral/{date}/` and refreshes vault Daily/. Anything in vault
   Daily/ that doesn't have a source manifest gets demoted to a draft suffix.
2. **`scripts/dev/vault/09-internals-sync.py`** — re-renders Faerie-System-
   Internals/ from canonical sources. Stale templates auto-purge.
3. **`scripts/dev/vault/10-crystallize.py`** *(future)* — runs the actual
   crystallizer: scans the day's notes, detects near-duplicates via address
   prefix + sha-similarity, merges siblings, writes a HONEY droplet
   summarizing the survivors, retires the rest with a `superseded_by:` link.

By session end, what landed as 12 takes on a problem becomes:
- 1 crystallized HONEY droplet in `forensics/honey/{date}/{slug}.md`
- The strongest source manifest in `forensics/artifacts/`
- The rest in `forensics/ephemeral/` with `superseded_by:` pointers (never
  deleted — forensic chain holds)

## Anti-bloat is built in, not bolted on

The discipline is structural, not behavioral:

| Mechanism | Anti-bloat effect |
|---|---|
| **Charters as cornerstone** | Every manifest must `charter_ref` to a real charter. Orphan notes get flagged + retired by validator. |
| **w4w addresses** | Two manifests at the same 3-slot prefix are sibling-candidates. Sync script auto-flags for crystallization. |
| **NSEW bearings** | Inferred E (sibling) edges connect parallel work; sync detects redundant siblings and proposes merge. |
| **`coc-human.jsonl` parallel chain** | Your annotations don't pollute the AI's atomic notes; they live in `Human/` as their own thread. |
| **Daily folder TTL** | After 30 days, daily folders condense into a weekly digest. After 90, the digest becomes a monthly. After 1y, into the year's anchor set. |
| **Crystallization gates promotions** | Nothing reaches `forensics/anchors/` without surviving the crystallization pass. |
| **Eval dimension G (emergence)** | Tracks manifest completeness. Drops if bloat outpaces structure. Triggers a crystallization sweep. |

## What the user sees

Open the vault Monday morning after a long Sunday session:

- `Daily/2026-05-18/` has 6 notes — clean, well-titled, one charter at the top, manifests under it as a cluster
- `Human/2026-05-18/` has your 3 annotations from Sunday night
- `00-SHARED/Faerie-System-Internals/` reflects the latest formula values
- No half-written drafts visible; no duplicate "draft-2.md" siblings; no broken
  references

What happened: agents wrote 24 notes Sunday between 4pm and midnight. By
midnight crystallization ran. 18 got merged or retired to `forensics/ephemeral/`
(still queryable). 6 became canonical. The vault is clean because the apiary
runs its own housekeeping.

## What you do

Annotate freely. Drop trail-refs. Sketch in Excalidraw. Don't worry about
keeping things tidy — the cycle does that. Your job is to **read the
crystals**, not curate the volume.

If a crystal is wrong, drop a `> [!charter]` callout proposing the right shape,
sketch a topology in Excalidraw, commit it, and the next cycle will reconcile.

## When the cycle fails

The sync scripts log every refusal. If two manifests genuinely belong as one
note but the crystallizer didn't merge them, it's an eval signal — dimension G
should have caught it. Files in `forensics/audits/crystallization-misses/`
collect the failures so the algorithm tunes over time.

## A note on the metaphor

Bees build comb generously — wax goes everywhere first, then nurse bees cap
the cells that hold honey and tear down the ones that didn't pan out. The
hive's structure is not authored top-down. It's **selected from abundance**.

The faerie vault works the same way. Write generously. Trust the cycle.
Read the crystals. The mess is supposed to land — and then dissolve.

🐝 → 🌼 → 🍯 → 💎
