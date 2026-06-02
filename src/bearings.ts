/**
 * Canonical NSEW Bearings Ontology
 * =================================
 *
 * The single source of truth for compass bearings across the entire plugin.
 * Every module that touches bearings (trail-refs, breadcrumbs, compass
 * overlay, blueprints, file-decorator) must import from THIS file.
 *
 * The ontology is also documented in:
 *   - CLAUDE.md  (Five Principles section)
 *   - HONEY.md   (canonical bearings entry)
 *   - swarmy/prompts/partials/bearings.njk
 *
 * If you change anything here, also update those three files. The ontology
 * is the topology of the mission graph; drifting definitions = drifting
 * graph = harmful mutation.
 *
 * NOTE (pluggable ontology, task #36):
 * --------------------------------------
 * The BEARING_LABEL / BEARING_COLOR / BEARING_GLYPH / BEARING_ROLE records
 * below are now the DISPLAY layer and may be mutated at runtime by
 * `ontology-loader.ts` based on `vault/.hive/ontology.yaml`. The structural
 * NSEW keys + iteration order + Breadcrumbs / ExcaliBrain bucket mappings
 * NEVER change — those are the topology. Only the user-facing surface
 * (label text, color hex, glyph, role description) is per-user. Importers
 * keep getting the same object reference; mutation propagates ambiently.
 */

export type Bearing = "N" | "S" | "E" | "W";

/** Long-form semantic role of each bearing. */
export const BEARING_ROLE: Record<Bearing, string> = {
  N: "North — unblock predecessor (reverse-dependency, upstream anchor)",
  S: "South — conclude / ship downstream (forward-dependency, next deliverable)",
  E: "East — parallel sister work (same DAG level, same mission)",
  W: "West — return to baseline / re-seat assumptions (backtrack to HQ)",
};

/** Short label for UI (≤32 chars). */
export const BEARING_LABEL: Record<Bearing, string> = {
  N: "N — unblock predecessor",
  S: "S — conclude downstream",
  E: "E — parallel sister",
  W: "W — return to baseline",
};

/** Canonical color per bearing (used in styles.css + ExcaliBrain config). */
export const BEARING_COLOR: Record<Bearing, string> = {
  N: "#C73E1D", // jasper red — danger / blocking
  S: "#2E8540", // emerald green — shipping / forward
  E: "#FF8E3C", // amber orange — parallel work
  W: "#FFB300", // honey gold — baseline / return
};

/** Glyph for inline rendering. */
export const BEARING_GLYPH: Record<Bearing, string> = {
  N: "↑",
  S: "↓",
  E: "→",
  W: "←",
};

/**
 * Mapping bearing → Breadcrumbs frontmatter field.
 *
 * Rationale:
 *  - N goes to `up` (Breadcrumbs' "parent" field; upstream anchor)
 *  - S goes to `next` (forward-flow sibling; the next-in-thread)
 *  - E goes to `same` (parallel sister; conventional Breadcrumbs field)
 *  - W also goes to `up`, BUT we tag the entry with `rationale: "baseline"`
 *    so it can be distinguished from N in the trail view. (Breadcrumbs
 *    doesn't have a native "backtrack" field; up is the semantic kin.)
 */
export const BEARING_TO_BC_FIELD: Record<Bearing, "up" | "down" | "next" | "prev" | "same"> = {
  N: "up",
  S: "next",
  E: "same",
  W: "up",
};

/**
 * Mapping bearing → ExcaliBrain hierarchy bucket.
 *
 * ExcaliBrain has three buckets: parents, children, friends.
 *   - N (north / upstream)   → parents
 *   - S (south / downstream) → children
 *   - E (east / parallel)    → friends
 *   - W (west / baseline)    → parents (returns to anchor)
 */
export const BEARING_TO_EXCALIBRAIN_BUCKET: Record<Bearing, "parents" | "children" | "friends"> = {
  N: "parents",
  S: "children",
  E: "friends",
  W: "parents",
};

/** All bearings in canonical iteration order: N, S, E, W. */
export const BEARINGS: readonly Bearing[] = ["N", "S", "E", "W"] as const;

/** Is the candidate a valid bearing? */
export function isBearing(x: unknown): x is Bearing {
  return typeof x === "string" && (BEARINGS as readonly string[]).includes(x);
}
