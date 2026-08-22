# `/coc` — chain of custody, identity and signing

The custody surface, as it actually exists on a current reckon MCP server. Every entry below is
a real registered tool with a real verb; nothing here is aspirational.

---

## Identity is a KEY, never a label

A hand proves who it is by POSSESSING a key, not by claiming an id. A claimed lane id with no
key behind it is **FAIL/FORBIDDEN**, never a soft green. Absent-with-nothing-claimed is
**UNMEASURED**. Those are two different facts and a gate that cannot look says which.

**The invariant, one line: no value that can sign may ever leave the process that made it.**

What this forbids, concretely:

| Pattern | Status | Why |
|---|---|---|
| `RECKON_SPAWN_TOKEN` | **RETIRED** 2026-07-30 | A bearer secret. Whoever holds it authenticates as you, and everyone who read the transcript holds it. |
| `RECKON_SPAWN_KEY` | **DEPRECATED** 2026-08-01 | Carries a raw private ed25519 seed in plaintext through the environment, process table, shell history and transcript. Nothing is hashed. A bearer secret wearing a key's name. |
| A private key in a URL, a prompt, a config file or a log | **REFUSED** | Same property as the two above, with extra places to leak from. |
| `RECKON_SPAWN_ID` | **CURRENT** | A PUBLIC label. Safe in a transcript, a log or a screenshot. It NAMES which key a hand holds; it is never itself identity. |

The correct handshake is not novel — it is what SSH host keys and WebAuthn do, for the same
reason: **the authority's job is not to ISSUE a secret, it is to WITNESS and BIND one it never
sees.** The child generates its own keypair in-process, claims its parent-opened slot by
publishing only its PUBLIC key, and proves possession thereafter by signing a target-bound,
single-use challenge. First claim wins; a filled slot refuses a second.

### In CompassCrew

| Command | What it does |
|---|---|
| `CompassCrew: create signing identity` | Generates an Ed25519 keypair in-process with `extractable: false`. The private half is a live `CryptoKey` handle in IndexedDB: it can sign, and there is no code path — in this plugin or any other — that can turn it back into bytes. |
| `CompassCrew: register public key` | `reckon_pubkey verb=register`. Only `pubkey_pem` crosses the wire; the call has no parameter that could carry a private half. |
| `CompassCrew: signing + spawn identity status` | Reports the SIGNING KEY axis and the SPAWN SLOT axis as **separate rows**. They are orthogonal facts and a banner that conflates them reports a verdict it never measured. |
| `CompassCrew: purge legacy plaintext signing key` | Deletes `.swarmy-user-key`, written by plugin versions before 2.1.0. Deleting the file is not un-publishing the key — rotate it. |

**The cost, named rather than hidden:** a non-extractable key cannot be backed up. Clear the
vault's browser storage and it is gone; generate and re-register. That is the correct trade — a
signing key that can be backed up is a signing key that can be stolen.

---

## Salt taxonomy — four axes, never conflated

Each is reported **separately**. A single merged "signed ✓" is a verdict nobody measured.

| Salt | Scope | What it proves |
|---|---|---|
| **VERBAL** | master-level, human | the OPERATOR is present (human 2FA) |
| **SPAWN** | per-hand, cryptographic | WHICH hand — the salted spawn-key handshake |
| **DURESS** | master-level, human | a coerced-operator signal (distinct derivation) |
| **DEVICE** | device-level | which device the seed lives on |

VERBAL ("is the operator present?") and SPAWN ("which hand?") are **orthogonal**. A banner must
render them as two rows.

---

## Signing is PQ-default

`pq_sign` **ML-DSA-65** is the default signer across this ecosystem. Ed25519 is retained for
SSH, Rekor, and the human COC chain. PQ has no native HD derivation, so PQ keys are
**path-addressed** off the master: each node of the Russian-doll derivation (operator phrase →
device → session → sub/instance) derives its `seed32` via `key_custody`, then uses the SEED32
API that round-trips. **The seed never leaves the device. Sub-keys are DERIVED, never copied.**

CompassCrew registers an **ed25519** identity, because WebCrypto has no ML-DSA. It says so
rather than implying PQ coverage it does not have.

---

## Chain operations

```
reckon_coc  verb=tail          n=20                  # last N leaves off the live spine
reckon_coc  verb=for_charter   charter_id="<id>"     # 4-layer evidence: entry_hash → Merkle → git → Rekor
reckon_coc  verb=for_session   session_id="<id>"     # the shareable public receipt
reckon_coc  verb=verify        artifact_path=… signature=… agent_type=…
reckon_coc  verb=append_human  operation=… content_sha256=… content_bytes=… address=…

reckon_sign verb=sign          artifact_path=… agent_type=…   # → {signature:'ed25519:<b64>', key_id}
reckon_sign verb=fingerprint   agent_type=…
```

---

## Verifying a chain — reachability, not adjacency

**This is the correction most stale verifiers get wrong.**

Shards are STORAGE. The chain is ORDER. Sequence is recovered by REPLAYING LINKS, never by
concatenating files in directory order. `verify_chain` used to test file adjacency — line *N*'s
`prev_entry_hash` must equal line *N−1*'s `entry_hash` — which is a *stronger* claim than the
chain ever made, and false by construction for any shard whose storage order is not its link
order.

Measured 2026-08-05 over 111 chain-bearing ledgers (3,900 leaves): the adjacency test reported
**2,230 breaks**; resolving every parent against the union of all leaves as a SET reported
**0 dangling**. The ledger was sound; the TEST was wrong. The repo-wide RED it produced blocked
~275 attest-gaps — meaning a diligent adversarial review and a rubber stamp produced the
identical outcome, the worst state an attest door can be in.

**This weakens nothing.** A parent that resolves NOWHERE is still a hole and still a hard FAIL —
that is the check with teeth, and adjacency noise was drowning it. Out-of-order storage is
reported under its own name, and forks are detected on purpose rather than as an accident.

`CompassCrew: verify chain of custody` implements exactly this, plus:

- **both hash recipes, NAMED** — `current` (excludes `entry_hash`/`signature`/`pq_signature`) and
  `legacy-pq-in-body` (pre-2026-08-03). A leaf verifying under a superseded recipe is a different
  fact from one verifying under the current one; collapsing them makes a recipe boundary
  indistinguishable from tampering. Pre-2026-08-03 leaves are **kept, never "fixed"** — rewriting
  them to today's recipe would forge new hashes over old bytes.
- **the full historical alias set** — `prev_entry_hash`, `prev_chain_hash`, `prev_hash`,
  `prev_phase_entry_sha`, `prev_entry_sha`, `parent_hash`, `previous_hash`. A partial alias list
  once made 26 real custody entries invisible to every verifier while verification reported clean.
- **telemetry rows skipped**, and an all-telemetry input reported UNMEASURED rather than PASS.
- **signatures reported UNMEASURED with the reason named** — leaves stamp their own `sig_body`
  scheme id, and an unknown scheme is UNVERIFIABLE, never "assume current". Trying shapes until
  one verifies is how a forged leaf is made to verify. Verify signatures server-side.
