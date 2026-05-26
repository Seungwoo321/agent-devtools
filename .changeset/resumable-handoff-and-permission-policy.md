---
'@agent-devtools/core': minor
'@agent-devtools/harness-core': minor
'@agent-devtools/widget-core': minor
'@agent-devtools/react': minor
'@agent-devtools/vue': minor
'@agent-devtools/vue2': minor
'@agent-devtools/next': minor
'@agent-devtools/next-pages': minor
'@agent-devtools/nuxt': minor
'@agent-devtools/nuxt2': minor
'@agent-devtools/angular': minor
'@agent-devtools/svelte': minor
'@agent-devtools/sveltekit': minor
'@agent-devtools/vite': minor
---

Publish the resumable handoff flow and per-action permission controls that
landed on the repository after the 0.5.0 release. The terminal handoff modal
now offers a `claude --resume <session>` command beside the append system
prompt file, resolved from the client session through the ACP session store.
The agent runtime gates file edits, shell, web fetch, and MCP tool calls
through an action-aware permission policy instead of a single mode switch.
The Vite plugin hardens its enrichment endpoints and ships safer defaults,
the launcher gains visibility controls, and the picked-context preamble and
stream renderer carry richer evidence and pending placeholders. These
changes were merged but never reached npm because the merging pull request
carried no changeset; this changeset closes that gap.
