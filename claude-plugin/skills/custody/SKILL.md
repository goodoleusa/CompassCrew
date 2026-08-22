---
description: "Chain-of-custody, signing-identity, and artifact-verification status for reckon-tracked work — reads the live COC chain, signing keys, and pubkey registry over MCP. Use when the user asks about custody, signing status, whether an artifact/manifest verifies, or wants to register/rotate a signing identity."
---

# custody — Chain of custody, identity, and signing status

This skill is a thin client over the `reckon` MCP server's custody surface. Every fact reported
here is what the server returns — there is no local verification, hashing, or signature-checking
logic in this plugin. If you find yourself computing a hash or re-deriving a chain link by hand,
stop: call `reckon_coc verb=verify` or `reckon_coc_v2_proof_get` instead and report what it says.

## Identity model (read this before reporting any status)

A hand proves who it is by **possessing a key**, never by **claiming an id**. Report status as
one of three verdicts — PASS, FAIL, or UNMEASURED — never collapse them into a single ✓/✗:

- **PASS** — a public key is registered and the server verifies a signature against it.
- **FAIL** — something was claimed (an id, a key) but doesn't verify. Name what failed.
- **UNMEASURED** — nothing was offered to check. Absent and wrong are different facts; say which
  one you have.

Never ask the user for or accept a private key, seed, or bearer token in a prompt, file, or URL
parameter. The only identity value that ever crosses a boundary is a **public** key or a
**public** label. If a user pastes something that looks like a private key or seed, refuse to
use it and tell them why (whoever holds it authenticates as them).

## Tool calls

All calls go through the `reckon` MCP server already configured in this plugin's `.mcp.json`
(`https://mcp.reckon.systems/free`, no credential required for the calls below).

**Chain reads:**
```
reckon_coc            verb=tail          n=20
reckon_coc            verb=for_charter   charter_id="<id>"
reckon_coc            verb=for_session   session_id="<id>"
reckon_coc_v2_block_get   block_id="<id>"
reckon_coc_v2_proof_get   entry_hash="<hash>"
```

**Verify an artifact or signature:**
```
reckon_coc  verb=verify   artifact_path=... signature=... agent_type=...
reckon_sign verb=verify   artifact_path=... signature=...
```
Report exactly what comes back, including which hash recipe matched if the response names one
(the server may distinguish a current recipe from a superseded one — that is a real fact about
the artifact's age, not noise to collapse away).

**Sign / register identity (only when the user explicitly asks to sign or register):**
```
reckon_sign   verb=sign          artifact_path=... agent_type=...   # -> {signature, key_id}
reckon_sign   verb=fingerprint   agent_type=...
reckon_pubkey verb=register      github_user=... pubkey_pem=...     # PUBLIC key only
reckon_pubkey verb=revoke        github_user=...
reckon_pubkey verb=verify        coc_human_entry=...
```
`reckon_pubkey verb=register` never takes a private key parameter — if the server ever appears
to want one, that is a contract break, not something to work around locally.

**Append a human custody entry:**
```
reckon_coc verb=append_human  operation=... content_sha256=... content_bytes=... address=...
```
Compute `content_sha256` by hashing the actual bytes being attested (standard SHA-256, not a
proprietary recipe) — this is generic hashing of user-supplied content, not custody logic.

## Reporting a custody/signing status summary

When asked "is this signed" / "what's the custody status" / "am I set up to sign", report as a
small table with **separate rows**, never a merged verdict:

| Axis | What it proves | How to check |
|---|---|---|
| Signing key | do we have a registered public key for this identity | `reckon_pubkey verb=verify` |
| Chain tail | most recent custody entries | `reckon_coc verb=tail` |
| This artifact | does it verify, and under which hash recipe | `reckon_coc verb=verify` |

If a call 404s or comes back `{error_type: "tier_gate"}`, say so plainly — "that tool isn't
available on this server" vs. "this needs a paid tier, sign in at https://mcp.reckon.systems" are
different facts, and collapsing them into one warning hides which one is true.
