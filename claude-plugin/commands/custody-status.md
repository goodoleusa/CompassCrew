---
description: "Report chain-of-custody and signing-identity status for an artifact, charter, or session, using the reckon MCP server."
argument-hint: "[artifact_path | charter_id=... | session_id=...]"
allowed-tools: mcp__reckon__*
---

Use the `custody` skill. Resolve the argument:

- If it looks like a file path, call `reckon_coc verb=verify artifact_path=<arg>` (plus
  `reckon_sign verb=verify` if a signature is available) and report the verdict.
- If it's `charter_id=...`, call `reckon_coc verb=for_charter charter_id=<id>`.
- If it's `session_id=...`, call `reckon_coc verb=for_session session_id=<id>`.
- If no argument was given, call `reckon_coc verb=tail n=20` and summarize the recent chain.

Report using the three-row axis table from the `custody` skill (signing key / chain tail / this
artifact), with PASS/FAIL/UNMEASURED verdicts — never a single merged status.
