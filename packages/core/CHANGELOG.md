# Changelog

## 1.3.3

### Patch Changes

- [#18](https://github.com/Seungwoo321/agent-devtools/pull/18) [`469188f`](https://github.com/Seungwoo321/agent-devtools/commit/469188f05949c641c01cc603e99672524bc202e7) Thanks [@Seungwoo321](https://github.com/Seungwoo321)! - fix(core): keep the command-lister ACP session ephemeral so it stops logging a `resourceNotFound` on every dev-server restart

  The command-lister session (`GET /v1/agent/commands`) only lists slash commands and never carries a conversation turn, so the agent never writes a transcript for it. It was nonetheless persisted in the `(cwd, clientSessionId) → acpSessionId` store like a chat session, so after a dev-server restart the runtime tried to `loadSession` an id the agent could not resume — the agent (Claude Code) emitted `[acp-child] … session/load … -32002 Resource not found` to stderr on every page reload. The failure was already caught and fell back to `newSession` (commands still returned 200), but the noise was alarming and looked like a broken integration.

  `getOrCreateSession` now treats the reserved command-lister key as store-exempt: it skips both the resume attempt and the persistence write, minting a fresh session each run. Chat sessions are unaffected and still resume across restarts. Verified end-to-end: a real chat session resumes correctly after a restart, while the command-lister no longer triggers the `session/load` error.

## 1.3.3-beta.0

### Patch Changes

- [#18](https://github.com/Seungwoo321/agent-devtools/pull/18) [`469188f`](https://github.com/Seungwoo321/agent-devtools/commit/469188f05949c641c01cc603e99672524bc202e7) Thanks [@Seungwoo321](https://github.com/Seungwoo321)! - fix(core): keep the command-lister ACP session ephemeral so it stops logging a `resourceNotFound` on every dev-server restart

  The command-lister session (`GET /v1/agent/commands`) only lists slash commands and never carries a conversation turn, so the agent never writes a transcript for it. It was nonetheless persisted in the `(cwd, clientSessionId) → acpSessionId` store like a chat session, so after a dev-server restart the runtime tried to `loadSession` an id the agent could not resume — the agent (Claude Code) emitted `[acp-child] … session/load … -32002 Resource not found` to stderr on every page reload. The failure was already caught and fell back to `newSession` (commands still returned 200), but the noise was alarming and looked like a broken integration.

  `getOrCreateSession` now treats the reserved command-lister key as store-exempt: it skips both the resume attempt and the persistence write, minting a fresh session each run. Chat sessions are unaffected and still resume across restarts. Verified end-to-end: a real chat session resumes correctly after a restart, while the command-lister no longer triggers the `session/load` error.

## 1.3.2

## 1.3.2-beta.0

## 1.3.1

## 1.3.1-beta.0

## 1.3.0

### Minor Changes

- [#15](https://github.com/Seungwoo321/agent-devtools/pull/15) [`3aaa7d3`](https://github.com/Seungwoo321/agent-devtools/commit/3aaa7d39fbfe0afcc678b53940f592f59b666e9a) Thanks [@Seungwoo321](https://github.com/Seungwoo321)! - Add slash-command autocomplete to the in-page widget composer.

  Typing `/` in the composer now opens a filterable menu of the workspace's slash commands — project and user commands plus skills — each showing its description and argument hint, mirroring the terminal experience. The catalogue is prefetched at mount through a new server endpoint (`GET /v1/agent/commands`) that lists the workspace commands without invoking the model, so the menu is available on the very first keystroke before any message is sent, and it still refreshes from the agent's `available_commands_update` stream. Arrow keys move the highlight, Enter/Tab confirm (inserting `/name ` with the caret ready for arguments), and Escape dismisses the menu. Selecting a command sends the raw text for native runtime expansion — there is no client-side macro expansion. Wired across the html runner and the React, Vue, Vue 2, Next.js, Nuxt, Svelte, SvelteKit and Angular adapters.

## 1.3.0-beta.0

### Minor Changes

- [`3aaa7d3`](https://github.com/Seungwoo321/agent-devtools/commit/3aaa7d39fbfe0afcc678b53940f592f59b666e9a) Thanks [@Seungwoo321](https://github.com/Seungwoo321)! - Add slash-command autocomplete to the in-page widget composer.

  Typing `/` in the composer now opens a filterable menu of the workspace's slash commands — project and user commands plus skills — each showing its description and argument hint, mirroring the terminal experience. The catalogue is prefetched at mount through a new server endpoint (`GET /v1/agent/commands`) that lists the workspace commands without invoking the model, so the menu is available on the very first keystroke before any message is sent, and it still refreshes from the agent's `available_commands_update` stream. Arrow keys move the highlight, Enter/Tab confirm (inserting `/name ` with the caret ready for arguments), and Escape dismisses the menu. Selecting a command sends the raw text for native runtime expansion — there is no client-side macro expansion. Wired across the html runner and the React, Vue, Vue 2, Next.js, Nuxt, Svelte, SvelteKit and Angular adapters.

## 1.2.1

## 1.2.1-beta.0

## 1.2.0

## 1.2.0-beta.0

## 1.1.0

### Minor Changes

- [#11](https://github.com/Seungwoo321/agent-devtools/pull/11) [`4cdbe4b`](https://github.com/Seungwoo321/agent-devtools/commit/4cdbe4b2e2103c015dd8fda2278ce683c1ece0a5) Thanks [@Seungwoo321](https://github.com/Seungwoo321)! - Add model selection so a prompt can run on the same models the Claude Code
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

### Patch Changes

- [#11](https://github.com/Seungwoo321/agent-devtools/pull/11) [`6317aa3`](https://github.com/Seungwoo321/agent-devtools/commit/6317aa3fdc501738aa89fcae6a660384e3f7bc15) Thanks [@Seungwoo321](https://github.com/Seungwoo321)! - Fix the in-process SDK provider being rejected with "API Error: 400 role 'system' is not supported on this model". The provider omitted `systemPrompt`, so the Claude Agent SDK fell back to its minimal default prompt instead of the full Claude Code prompt that `claude -p` uses by default. It now opts into the `claude_code` preset, restoring terminal parity, and pins `settingSources` so project `CLAUDE.md` context cannot be silently dropped by a future SDK default change.

## 1.1.0-beta.0

### Minor Changes

- [#11](https://github.com/Seungwoo321/agent-devtools/pull/11) [`4cdbe4b`](https://github.com/Seungwoo321/agent-devtools/commit/4cdbe4b2e2103c015dd8fda2278ce683c1ece0a5) Thanks [@Seungwoo321](https://github.com/Seungwoo321)! - Add model selection so a prompt can run on the same models the Claude Code
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

### Patch Changes

- [#11](https://github.com/Seungwoo321/agent-devtools/pull/11) [`6317aa3`](https://github.com/Seungwoo321/agent-devtools/commit/6317aa3fdc501738aa89fcae6a660384e3f7bc15) Thanks [@Seungwoo321](https://github.com/Seungwoo321)! - Fix the in-process SDK provider being rejected with "API Error: 400 role 'system' is not supported on this model". The provider omitted `systemPrompt`, so the Claude Agent SDK fell back to its minimal default prompt instead of the full Claude Code prompt that `claude -p` uses by default. It now opts into the `claude_code` preset, restoring terminal parity, and pins `settingSources` so project `CLAUDE.md` context cannot be silently dropped by a future SDK default change.

## 1.0.0

### Major Changes

- [#10](https://github.com/Seungwoo321/agent-devtools/pull/10) [`9e0acd0`](https://github.com/Seungwoo321/agent-devtools/commit/9e0acd0213161d04437d3f990c9ad6bf1a756cb1) Thanks [@Seungwoo321](https://github.com/Seungwoo321)! - agent-devtools 1.0 — generally available. The Vite plugin, the framework-agnostic widget core, and every framework adapter (React, Vue 2 and 3, Next App Router and Pages Router, Nuxt 2 and 3, Svelte, SvelteKit, Angular, plain HTML) all reach the 1.0 stable line on the same fixed major track. The fixed group keeps adapter and core compatibility implicit, so the version of the adapter you install always matches the version of the core it expects. Pre 1.0 beta consumers should pin the new 1.0 stable line; no public API was removed at this milestone, the bump marks general availability rather than a breaking redesign.

## 1.0.0-beta.1

### Major Changes

- [`9e0acd0`](https://github.com/Seungwoo321/agent-devtools/commit/9e0acd0213161d04437d3f990c9ad6bf1a756cb1) Thanks [@Seungwoo321](https://github.com/Seungwoo321)! - agent-devtools 1.0 — generally available. The Vite plugin, the framework-agnostic widget core, and every framework adapter (React, Vue 2 and 3, Next App Router and Pages Router, Nuxt 2 and 3, Svelte, SvelteKit, Angular, plain HTML) all reach the 1.0 stable line on the same fixed major track. The fixed group keeps adapter and core compatibility implicit, so the version of the adapter you install always matches the version of the core it expects. Pre 1.0 beta consumers should pin the new 1.0 stable line; no public API was removed at this milestone, the bump marks general availability rather than a breaking redesign.

## 0.7.0-beta.0

## 0.6.0

### Minor Changes

- [#8](https://github.com/Seungwoo321/agent-devtools/pull/8) [`a7e5ed5`](https://github.com/Seungwoo321/agent-devtools/commit/a7e5ed5fec27895545f511e21f0b9f0f7a51488b) Thanks [@Seungwoo321](https://github.com/Seungwoo321)! - Publish the resumable handoff flow and per-action permission controls that
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

## 0.5.0

### Minor Changes

- [#6](https://github.com/Seungwoo321/agent-devtools/pull/6) [`19bd25a`](https://github.com/Seungwoo321/agent-devtools/commit/19bd25acb4a4470d56a5c313e01edbe75ee329bb) Thanks [@Seungwoo321](https://github.com/Seungwoo321)! - Release the fixed-mode 0.5.0 line so the npm registry catches up to the
  repository state. This bumps Node engines to `>=22.13.0` to match the
  pnpm 11.x minimum, ships the new `@agent-devtools/widget-core` package
  as the framework-agnostic widget shell, and publishes the first stable
  versions of the new adapters: `@agent-devtools/vue2`,
  `@agent-devtools/next-pages`, `@agent-devtools/nuxt2`,
  `@agent-devtools/angular`, `@agent-devtools/svelte`, and
  `@agent-devtools/sveltekit`. Existing packages move onto the same
  version line, eliminating the dual-core drift that affected end-user
  installs of `@agent-devtools/vite` with older `@agent-devtools/core`
  servers.

## [0.3.0](https://github.com/Seungwoo321/agent-devtools/compare/core-v0.2.0-beta.2...core-v0.3.0) (2026-05-24)

## [0.2.0](https://github.com/Seungwoo321/agent-devtools/compare/core-v0.2.0-beta.1...core-v0.2.0) (2026-05-23)

## [0.2.0-beta.1](https://github.com/Seungwoo321/agent-devtools/compare/core-v0.2.0-beta.0...core-v0.2.0-beta.1) (2026-05-23)

## 0.2.0-beta.0 (2026-05-23)
