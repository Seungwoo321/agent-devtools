---
'@agent-devtools/core': patch
---

fix(core): keep the command-lister ACP session ephemeral so it stops logging a `resourceNotFound` on every dev-server restart

The command-lister session (`GET /v1/agent/commands`) only lists slash commands and never carries a conversation turn, so the agent never writes a transcript for it. It was nonetheless persisted in the `(cwd, clientSessionId) → acpSessionId` store like a chat session, so after a dev-server restart the runtime tried to `loadSession` an id the agent could not resume — the agent (Claude Code) emitted `[acp-child] … session/load … -32002 Resource not found` to stderr on every page reload. The failure was already caught and fell back to `newSession` (commands still returned 200), but the noise was alarming and looked like a broken integration.

`getOrCreateSession` now treats the reserved command-lister key as store-exempt: it skips both the resume attempt and the persistence write, minting a fresh session each run. Chat sessions are unaffected and still resume across restarts. Verified end-to-end: a real chat session resumes correctly after a restart, while the command-lister no longer triggers the `session/load` error.
