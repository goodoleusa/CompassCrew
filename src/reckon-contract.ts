/**
 * reckon-contract.ts — THE ONE HOME for CompassCrew's wire contract with a reckon MCP server.
 *
 * WHY THIS FILE EXISTS. Before it, six modules each hand-rolled their own
 * `fetch(mcpUrl + "/tools/" + name)` and each hard-coded its own tool-name string. The names
 * had been through three unreviewed rebrands (`faerie_*` → `swarmy_*` → `compasscrew_*`) while
 * the server they call has always answered to `reckon_*`, so every one of those strings was a
 * guaranteed 404 and nothing in the plugin could notice: `callMcp` threw on `!r.ok` and the UI
 * rendered "⚠ 404" identically to "server is down". A rename that only happens on the client
 * is not a rename, it is a disconnection.
 *
 * THE RULE THIS FILE ENFORCES: the PRODUCT is CompassCrew; the WIRE is reckon. UI strings,
 * command ids, CSS classes and view types are ours to name. Tool names, verb names and
 * argument names are the SERVER's, and are copied verbatim from its registry. If you find
 * yourself typing a tool name anywhere else in this codebase, put it here instead.
 *
 * PROVENANCE OF THE NAMES BELOW: `runtime/mcp-server/tools/REGISTRY.json` (generated_at
 * 2026-07-28, 76 tools) plus each dispatcher's own docstring in
 * `runtime/mcp-server/tools/*.py`. That registry — not `TOOLS.md`, which is a stale
 * auto-generated inventory still listing the pre-dispatcher flat names (`charter_list`,
 * `coc_tail`, `record_annotation`) — is the authority.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// ALL VARS AT TOP — every constant, env-var name, file name and wire string.
// ═══════════════════════════════════════════════════════════════════════════════

/** `generated_at` of the server registry these names were transcribed from. */
export const RECKON_MCP_CONTRACT_REV = "2026-07-28";

/** Default MCP endpoint. There is no hosted default — bring your own server. */
export const DEFAULT_MCP_URL = "http://localhost:8765";

/** Bearer-token file in the vault root (current name). */
export const TOKEN_FILE = ".compasscrew-token";

/**
 * Pre-rebrand token filenames, still READ so an existing vault keeps working.
 * Read-only on purpose: nothing in this plugin writes them any more.
 */
export const LEGACY_TOKEN_FILES = [".swarmy-token", ".faerie-token"] as const;

/**
 * A PRIVATE signing key was once written here by `token-grabber.ts`.
 * It is now only ever looked for in order to be REPORTED and PURGED — see
 * `LEGACY_PRIVATE_KEY_REFUSAL`. Never written.
 */
export const LEGACY_PRIVATE_KEY_FILE = ".swarmy-user-key";

/**
 * DEMO_BEARER — public no-signup fallback token.
 * The server recognises this exact string in `auth.validate_token()` and returns tier="demo",
 * user_id="public-demo". Demo callers get read-only verbs; write/spawn verbs come back as
 * `{error_type: "tier_gate"}`, which `callReckonTool` raises as a `TierGateError` so the UI can
 * show an upgrade prompt instead of a raw HTTP error.
 */
export const DEMO_BEARER = "demo:public-readonly:v1";

/** Base URL for signup / auth / token-grab. Sourced from env; no live default is shipped. */
export const RECKON_WEB_HOST =
  (typeof process !== "undefined" && process.env && process.env.COMPASSCREW_MCP_URL
    ? process.env.COMPASSCREW_MCP_URL.replace(/\/+$/, "")
    : "https://your-mcp-server.example.com");

export const RECKON_SIGNUP_URL = `${RECKON_WEB_HOST}/signup`;

// ── Spawn identity ────────────────────────────────────────────────────────────
//
// Current contract (reckon-lite/tools/revenant_spawnkey_lite.py, the block above
// `ENV_CHILD_ID`): the CHILD generates its own keypair in-process and never writes the private
// half anywhere. What crosses a boundary is `RECKON_SPAWN_ID` — a PUBLIC label, safe in a
// transcript, a log or a screenshot. The child CLAIMS its slot by publishing only its PUBLIC
// key and proves possession thereafter by signing a target-bound, single-use challenge.
//
// The invariant, one line: NO VALUE THAT CAN SIGN MAY EVER LEAVE THE PROCESS THAT MADE IT.

/** PUBLIC label naming which spawn slot this hand holds. Safe to log. Never itself identity. */
export const ENV_SPAWN_ID = "RECKON_SPAWN_ID";

/** Retired 2026-07-30 (operator ruling). A bearer secret: whoever holds it *is* the identity. */
export const ENV_SPAWN_TOKEN_RETIRED = "RECKON_SPAWN_TOKEN";

/** Deprecated 2026-08-01. Carries a raw private ed25519 seed in plaintext. */
export const ENV_SPAWN_KEY_DEPRECATED = "RECKON_SPAWN_KEY";

export const SPAWN_TOKEN_REFUSAL =
  `REFUSED — ${ENV_SPAWN_TOKEN_RETIRED} is a BEARER TOKEN and was retired as an authentication ` +
  `credential on 2026-07-30. Whoever holds it authenticates as you, and every reader of the ` +
  `transcript that carried it holds it. CompassCrew will not read it. Use ${ENV_SPAWN_ID}.`;

export const SPAWN_KEY_REFUSAL =
  `REFUSED — ${ENV_SPAWN_KEY_DEPRECATED} carries a PRIVATE ed25519 seed in plaintext through the ` +
  `environment, the process table and any log that captures either. Nothing about it is hashed; ` +
  `it is a bearer secret wearing a key's name. CompassCrew never reads it and never writes it. ` +
  `The correct path: generate a keypair in-process (see coc-identity.ts), publish only the ` +
  `PUBLIC half, and carry the PUBLIC ${ENV_SPAWN_ID}.`;

export const LEGACY_PRIVATE_KEY_REFUSAL =
  `A file named ${LEGACY_PRIVATE_KEY_FILE} exists in this vault. Plugin versions before 2.1.0 ` +
  `accepted a private signing key as a URL query parameter and wrote it here in plaintext. ` +
  `That key must be considered COMPROMISED: treat it as published, rotate it at the server, and ` +
  `delete the file. CompassCrew no longer reads, writes or transmits any private key.`;

// ── The tool surface ──────────────────────────────────────────────────────────
//
// Verbatim from the server registry. Verb-dispatchers take `verb` (or, for
// reckon_consolidate, `tier`) as their first argument.

export const TOOL = {
  /** Dashboard composition. verbs: status | mission_control | frontier | fleet | agency | … */
  DASHBOARD: "reckon_dashboard",
  /** System telemetry. verbs: read | eval | eval_compare | evolve | membench | emergence | usage | … */
  METRICS: "reckon_metrics",
  /** Charter lifecycle. verbs: list | lifecycle | get | update | declare | create | from_intent | close | … */
  CHARTER: "reckon_charter",
  /** System-prompt surfaces. verbs: view | history | list | get | update(pro) */
  PROMPT: "reckon_prompt",
  /** Single-shot chat. args: message, model. TIER: pro. */
  CHAT: "reckon_chat",
  /** System maintenance + session finalize. verbs: session_finalize | status | tail | … */
  SYSTEM: "reckon_system",
  /** Collaboration. verbs: presence_list | presence_heartbeat | invite | record_annotation | post_annotation | list_annotations */
  COLLAB: "reckon_collab",
  /** Agent ops. verbs: spawn | spawn_team | team_status | decide | orchestrate | route_model | frontier_walk */
  AGENT: "reckon_agent",
  /** Mission graph. verbs: graph | add | complete — NOTE: there is no propose_bearings verb. */
  MISSION: "reckon_mission",
  /** TTL ladder + crystal lifecycle. Dispatches on `tier`, not `verb`: run | anchor_promote | crystallize | … */
  CONSOLIDATE: "reckon_consolidate",
  /** API tokens. verbs: rotate | mint | revoke | list | beta_invite | … Returns NO signing key. */
  TOKEN: "reckon_token",
  /** COC chain. verbs: tail | for_charter | for_session | sign | verify | append_human */
  COC: "reckon_coc",
  /** Artifact signing. verbs: sign | verify | fingerprint | init */
  SIGN: "reckon_sign",
  /** Signing-key administration. verbs: register | revoke | verify */
  PUBKEY: "reckon_pubkey",
  /** Manifest ops. verb-dispatched. */
  MANIFEST: "reckon_manifest",
  /** Vault operations. verb-dispatched. */
  VAULT: "reckon_vault",
  /** Spawn bundles. */
  SPAWN: "reckon_spawn",
  /** Reckon-native task list / frontier. */
  TASKS: "reckon_tasks",
  /** Excalidraw drawing pipeline. verb-dispatched. */
  EXCALIDRAW: "reckon_excalidraw",
  /** Shared RecursiveCanvas state for pair sessions. */
  CANVAS: "reckon_canvas",
  /** SKILL.md operations. verb-dispatched. */
  SKILL: "reckon_skill",
  /** Canonical intro / orientation for any LLM connecting to reckon MCP. */
  INTRO: "reckon_intro",
  /** Tier capability matrix — public, no auth required. */
  DOCTRINE: "reckon_doctrine_get",
} as const;

export type ReckonTool = (typeof TOOL)[keyof typeof TOOL];

/**
 * Tools this plugin's UI depends on, and the exact verb it sends. Kept as data so a smoke test
 * can assert the whole surface at once instead of exercising six views by hand — see
 * `scripts/smoke/mcp_contract_smoke.mjs`.
 */
export const CONTRACT_CALLS: ReadonlyArray<{ tool: ReckonTool; args: Record<string, unknown>; used_by: string }> = [
  { tool: TOOL.DASHBOARD, args: { verb: "status" }, used_by: "mcp-bridge (Live pane)" },
  { tool: TOOL.METRICS, args: { verb: "read" }, used_by: "mcp-bridge (Live pane)" },
  { tool: TOOL.CHARTER, args: { verb: "list", status: "active" }, used_by: "charter-dashboard" },
  { tool: TOOL.CHARTER, args: { verb: "get", charter_id: "" }, used_by: "charter-dashboard" },
  { tool: TOOL.CHARTER, args: { verb: "update", charter_id: "" }, used_by: "charter-dashboard" },
  { tool: TOOL.CHARTER, args: { verb: "declare", charter_id: "" }, used_by: "charter-dashboard" },
  { tool: TOOL.PROMPT, args: { verb: "update" }, used_by: "system-prompt" },
  { tool: TOOL.CHAT, args: { message: "" }, used_by: "chat-panel" },
  { tool: TOOL.SYSTEM, args: { verb: "session_finalize" }, used_by: "chat-panel" },
  { tool: TOOL.COLLAB, args: { verb: "record_annotation" }, used_by: "annotations" },
  { tool: TOOL.CONSOLIDATE, args: { tier: "anchor_promote" }, used_by: "quickadd-macros" },
  { tool: TOOL.TOKEN, args: { verb: "rotate" }, used_by: "token-grabber" },
  { tool: TOOL.COC, args: { verb: "tail", n: 20 }, used_by: "coc-verify" },
  { tool: TOOL.PUBKEY, args: { verb: "register" }, used_by: "coc-identity" },
];

// ═══════════════════════════════════════════════════════════════════════════════
// CHUNK: settings shape
// ═══════════════════════════════════════════════════════════════════════════════

export interface McpBridgeSettings {
  mcpUrl: string;
  tokenPath: string;
  refreshSeconds: number;
}

export const DEFAULT_MCP_BRIDGE_SETTINGS: McpBridgeSettings = {
  mcpUrl: DEFAULT_MCP_URL,
  tokenPath: TOKEN_FILE,
  refreshSeconds: 60,
};

// ═══════════════════════════════════════════════════════════════════════════════
// CHUNK: token resolution
// ═══════════════════════════════════════════════════════════════════════════════

/** Minimal surface of Obsidian's `App` this module needs — keeps it unit-testable off-Obsidian. */
export interface VaultLike {
  vault: { adapter: { basePath?: string } & Record<string, unknown> };
}

/** Filesystem access is injected so this module stays importable in a plain Node smoke test. */
export interface FsLike {
  readFileSync(p: string, enc: BufferEncoding): string;
  existsSync(p: string): boolean;
}

export function vaultRoot(app: VaultLike): string {
  return (app.vault.adapter as unknown as { basePath: string }).basePath;
}

/**
 * Resolve the effective bearer token.
 *
 * Priority: the configured token file → any legacy token filename → DEMO_BEARER.
 * Never returns null: a fresh clone auto-connects in read-only demo mode, and a tier_gate is a
 * far more legible failure than a 401.
 */
export function resolveToken(
  fs: FsLike,
  join: (...parts: string[]) => string,
  root: string,
  tokenPath: string,
): { token: string; source: string; isDemo: boolean } {
  const candidates = [tokenPath, ...LEGACY_TOKEN_FILES];
  for (const name of candidates) {
    try {
      const t = fs.readFileSync(join(root, name), "utf8").trim();
      if (t) return { token: t, source: name, isDemo: t === DEMO_BEARER };
    } catch { /* absent — try the next candidate */ }
  }
  return { token: DEMO_BEARER, source: "demo-fallback", isDemo: true };
}

// ═══════════════════════════════════════════════════════════════════════════════
// CHUNK: the single call door
// ═══════════════════════════════════════════════════════════════════════════════

/** A `{error_type:"tier_gate"}` response — the caller's tier is too low, not a transport fault. */
export class TierGateError extends Error {
  readonly isTierGate = true;
  constructor(readonly tool: string, readonly upgradeUrl: string) {
    super(`${tool}: sign-in required — ${upgradeUrl}`);
    this.name = "TierGateError";
  }
}

/** Any non-2xx from the MCP server. Carries the status so a 404 is distinguishable from a 500. */
export class McpHttpError extends Error {
  constructor(readonly tool: string, readonly status: number) {
    super(`${tool}: HTTP ${status}`);
    this.name = "McpHttpError";
  }
}

export function toolUrl(mcpUrl: string, tool: ReckonTool | string): string {
  return `${mcpUrl.replace(/\/+$/, "")}/tools/${tool}`;
}

/**
 * POST one MCP tool call. THE only place this plugin talks to a reckon server.
 *
 * Throws `TierGateError` for a tier gate and `McpHttpError` for a bad status, so callers can
 * tell "you need to sign in", "that tool does not exist here" (404) and "the server is down"
 * apart. Collapsing those three into one "⚠" is what let the wrong tool names survive.
 */
export async function callReckonTool<T = unknown>(
  opts: { mcpUrl: string; token: string; tool: ReckonTool | string; args?: Record<string, unknown> },
): Promise<T> {
  const r = await fetch(toolUrl(opts.mcpUrl, opts.tool), {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${opts.token}` },
    body: JSON.stringify(opts.args ?? {}),
  });
  if (!r.ok) throw new McpHttpError(String(opts.tool), r.status);
  const data = (await r.json()) as T & { error_type?: string; upgrade_url?: string };
  if (data && data.error_type === "tier_gate") {
    throw new TierGateError(String(opts.tool), data.upgrade_url || RECKON_SIGNUP_URL);
  }
  return data;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CHUNK: spawn-identity resolution
// ═══════════════════════════════════════════════════════════════════════════════

export type SpawnIdVerdict = "PASS" | "FAIL" | "UNMEASURED";

export interface SpawnIdentity {
  verdict: SpawnIdVerdict;
  spawnId: string | null;
  detail: string;
}

/**
 * Read this process's spawn identity from the environment.
 *
 * Three-valued on purpose (doctrine: a gate that cannot look says UNMEASURED, never clean):
 *   PASS       — a public RECKON_SPAWN_ID is present.
 *   FAIL       — a RETIRED or DEPRECATED private/bearer credential is present. Named, never
 *                silently ignored, so the deprecation can't be mistaken for "nothing was offered".
 *   UNMEASURED — nothing was offered at all. Absent and wrong are different facts.
 *
 * NOTE WHAT IS NOT HERE, and deliberately never will be: any read of a private seed, mnemonic or
 * salt. If a future change adds one, the design has been reverted to the deprecated pattern
 * whatever it is called.
 */
export function resolveSpawnIdentity(env: Record<string, string | undefined> = (typeof process !== "undefined" ? process.env : {})): SpawnIdentity {
  if (env[ENV_SPAWN_TOKEN_RETIRED]) {
    return { verdict: "FAIL", spawnId: null, detail: SPAWN_TOKEN_REFUSAL };
  }
  if (env[ENV_SPAWN_KEY_DEPRECATED]) {
    return { verdict: "FAIL", spawnId: null, detail: SPAWN_KEY_REFUSAL };
  }
  const id = (env[ENV_SPAWN_ID] || "").trim();
  if (id) {
    return { verdict: "PASS", spawnId: id, detail: `${ENV_SPAWN_ID}=${id} (public label)` };
  }
  return {
    verdict: "UNMEASURED",
    spawnId: null,
    detail: `no ${ENV_SPAWN_ID} in the environment — this hand is unspawned or was launched ` +
            `outside the reckon spawn pipeline. Not an error; simply nothing to measure.`,
  };
}
