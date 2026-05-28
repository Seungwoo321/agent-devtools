---
'@agent-devtools/widget-core': minor
---

Absorb the dev-server respawn window so a hot reload no longer surfaces a
spurious network error on the next prompt. The default transport already
retried when `fetch()` rejected before any Response (the request never left
the client); it now treats a `503` from the dev-server proxy the same way,
because the proxy returns `503 "agent server not ready"` _before_ forwarding
anything upstream while the agent server respawns — so the prompt never
reached the agent and a retry can't duplicate the turn. This is the common
"network error right after a dev-server restart / hot reload" case.

Retries now use capped exponential backoff (base `300ms`, cap `2000ms`,
default four retries ≈ 4.1s total) so a multi-second respawn is waited out
while a genuinely dead server still fails within a bounded window. A new
`preResponseRetryMaxBackoffMs` option exposes the cap, and the default
retry count rose from 1 to 4.

The idempotency boundary is unchanged: any failure that proves the prompt
reached the agent — a `2xx` stream that later drops mid-flight, `500`,
`502`, `401`, or a silent-stream timeout — is never auto-retried, since the
agent may have already started editing files and re-sending would re-run the
LLM. Those still surface as an error for the user to retry deliberately.
