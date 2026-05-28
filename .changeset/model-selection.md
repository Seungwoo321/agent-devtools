---
'@agent-devtools/core': minor
'@agent-devtools/widget-core': minor
---

Add model selection so a prompt can run on the same models the Claude Code
terminal offers. A new `model` setting exposes the terminal's `/model` menu —
`default`, `opus`, `sonnet`, `haiku` — in the settings panel, persists in
localStorage alongside the provider, permission mode and theme, and rides on
each request body. `default` is a sentinel that sends no model on the wire, so
the chosen provider keeps its own default exactly as it does today.

Both providers resolve the alias through the shared Claude Agent SDK resolver,
so no live model-discovery round-trip is needed. The SDK provider forwards the
alias as the `query()` `model` option. The ACP provider applies it with
`session/set_model` after the session is established and before the prompt is
dispatched; it remembers the last applied model per session to skip a redundant
round-trip when the model is unchanged across turns, and surfaces an error
(rather than silently running on the wrong model) if the agent rejects the
request. The server validates only that `model` is a non-empty string and
forwards it verbatim, leaving the model set open for full date-pinned ids or
future tiers without a protocol change.
