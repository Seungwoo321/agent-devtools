# @agent-devtools/widget-core

## 1.2.0-beta.0

### Patch Changes

- Updated dependencies []:
  - @agent-devtools/core@1.2.0-beta.0

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

- [#11](https://github.com/Seungwoo321/agent-devtools/pull/11) [`b621331`](https://github.com/Seungwoo321/agent-devtools/commit/b621331110dac125484d223b0e9aee3b82ab052d) Thanks [@Seungwoo321](https://github.com/Seungwoo321)! - Absorb the dev-server respawn window so a hot reload no longer surfaces a
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

- [#11](https://github.com/Seungwoo321/agent-devtools/pull/11) [`cd230a6`](https://github.com/Seungwoo321/agent-devtools/commit/cd230a6de9ce4ac267ef18446edaea75bc56ddd2) Thanks [@Seungwoo321](https://github.com/Seungwoo321)! - Add a theme to the floating chat and every widget surface: a new `theme`
  setting with `auto` (the default), `light`, and `dark`. `auto` follows the
  operating system's `prefers-color-scheme`; `light` and `dark` pin the choice.
  The setting persists in localStorage alongside the provider and permission mode,
  and switching it flips a single `data-theme` attribute on the closed shadow
  host, so the browser recomputes every colour through CSS custom properties with
  no per-component re-render.

  The dark palette is the only set of tokens defined centrally on the host. Light
  is the absence of tokens: every surface reads its colour as
  `var(--adt-token, <literal>)`, where the literal fallback is that element's
  original light colour. So light stays byte-identical to the previous look and
  each surface keeps its own light nuance, while dark is single-sourced — the same
  token can resolve to a different light value per surface (a user bubble's text
  is white in light, body text is near-black, and both become the same light grey
  in dark). Surfaces that are intentionally dark in both themes (the picked-element
  code card) keep their dark treatment by reading a raised-surface token rather
  than inverting with the accent.

  Every widget surface participates: the composer, launcher, message stream,
  picked-element evidence, tool output, handoff modal, and settings panel. The
  launcher and accent controls invert correctly so dark mode reads as a true dark
  theme rather than a tinted light one.

- [#11](https://github.com/Seungwoo321/agent-devtools/pull/11) [`3fbaf3b`](https://github.com/Seungwoo321/agent-devtools/commit/3fbaf3b611760793a2932955f4a5ebd70f3bb70b) Thanks [@Seungwoo321](https://github.com/Seungwoo321)! - Persist the widget's visibility across page reloads. The orchestrator now
  remembers two on/off axes in localStorage and restores them on mount: the
  composer panel's open/closed state (toggled by the launcher, the close button,
  Escape, or picking an element) and the widget-level visibility (toggled by the
  Ctrl/Cmd+Shift+; hotkey). This matches the standard devtools convention where
  the tool reopens in the state you left it. Persistence lives in the
  orchestrator rather than the composer because only the orchestrator can tell a
  user-driven open/close apart from a system-driven transient collapse (the panel
  hiding during element-picking, or the whole surface going dark), so a transient
  collapse never clobbers the user's remembered choice. Storage access is wrapped
  in try/catch and degrades silently where localStorage is unavailable (file://,
  private mode, sandboxed iframes, quota-exceeded).

### Patch Changes

- [#11](https://github.com/Seungwoo321/agent-devtools/pull/11) [`3fbaf3b`](https://github.com/Seungwoo321/agent-devtools/commit/3fbaf3b611760793a2932955f4a5ebd70f3bb70b) Thanks [@Seungwoo321](https://github.com/Seungwoo321)! - Show the working ("typing") indicator during every idle period of a turn, not
  only while waiting for the first response. Previously the three-dot indicator
  was a one-shot placeholder pushed when the user submitted and removed on the
  first assistant event, so in an agentic turn the surface looked frozen while a
  tool executed and while the model round-tripped on a tool result. The indicator
  is now a derived view of the conversation state: it sits at the tail whenever a
  turn is in flight and the assistant is between visible actions (after submit,
  while a tool runs, and during the model round-trip after a tool result), and is
  dropped the moment text or tool input streams again or the turn ends. It is
  deliberately not shown after a finished text block, since a turn that ends on
  text emits its completion immediately and a dot there would only flash.
- Updated dependencies [[`4cdbe4b`](https://github.com/Seungwoo321/agent-devtools/commit/4cdbe4b2e2103c015dd8fda2278ce683c1ece0a5), [`6317aa3`](https://github.com/Seungwoo321/agent-devtools/commit/6317aa3fdc501738aa89fcae6a660384e3f7bc15)]:
  - @agent-devtools/core@1.1.0

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

- [#11](https://github.com/Seungwoo321/agent-devtools/pull/11) [`b621331`](https://github.com/Seungwoo321/agent-devtools/commit/b621331110dac125484d223b0e9aee3b82ab052d) Thanks [@Seungwoo321](https://github.com/Seungwoo321)! - Absorb the dev-server respawn window so a hot reload no longer surfaces a
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

- [#11](https://github.com/Seungwoo321/agent-devtools/pull/11) [`cd230a6`](https://github.com/Seungwoo321/agent-devtools/commit/cd230a6de9ce4ac267ef18446edaea75bc56ddd2) Thanks [@Seungwoo321](https://github.com/Seungwoo321)! - Add a theme to the floating chat and every widget surface: a new `theme`
  setting with `auto` (the default), `light`, and `dark`. `auto` follows the
  operating system's `prefers-color-scheme`; `light` and `dark` pin the choice.
  The setting persists in localStorage alongside the provider and permission mode,
  and switching it flips a single `data-theme` attribute on the closed shadow
  host, so the browser recomputes every colour through CSS custom properties with
  no per-component re-render.

  The dark palette is the only set of tokens defined centrally on the host. Light
  is the absence of tokens: every surface reads its colour as
  `var(--adt-token, <literal>)`, where the literal fallback is that element's
  original light colour. So light stays byte-identical to the previous look and
  each surface keeps its own light nuance, while dark is single-sourced — the same
  token can resolve to a different light value per surface (a user bubble's text
  is white in light, body text is near-black, and both become the same light grey
  in dark). Surfaces that are intentionally dark in both themes (the picked-element
  code card) keep their dark treatment by reading a raised-surface token rather
  than inverting with the accent.

  Every widget surface participates: the composer, launcher, message stream,
  picked-element evidence, tool output, handoff modal, and settings panel. The
  launcher and accent controls invert correctly so dark mode reads as a true dark
  theme rather than a tinted light one.

- [#11](https://github.com/Seungwoo321/agent-devtools/pull/11) [`3fbaf3b`](https://github.com/Seungwoo321/agent-devtools/commit/3fbaf3b611760793a2932955f4a5ebd70f3bb70b) Thanks [@Seungwoo321](https://github.com/Seungwoo321)! - Persist the widget's visibility across page reloads. The orchestrator now
  remembers two on/off axes in localStorage and restores them on mount: the
  composer panel's open/closed state (toggled by the launcher, the close button,
  Escape, or picking an element) and the widget-level visibility (toggled by the
  Ctrl/Cmd+Shift+; hotkey). This matches the standard devtools convention where
  the tool reopens in the state you left it. Persistence lives in the
  orchestrator rather than the composer because only the orchestrator can tell a
  user-driven open/close apart from a system-driven transient collapse (the panel
  hiding during element-picking, or the whole surface going dark), so a transient
  collapse never clobbers the user's remembered choice. Storage access is wrapped
  in try/catch and degrades silently where localStorage is unavailable (file://,
  private mode, sandboxed iframes, quota-exceeded).

### Patch Changes

- [#11](https://github.com/Seungwoo321/agent-devtools/pull/11) [`3fbaf3b`](https://github.com/Seungwoo321/agent-devtools/commit/3fbaf3b611760793a2932955f4a5ebd70f3bb70b) Thanks [@Seungwoo321](https://github.com/Seungwoo321)! - Show the working ("typing") indicator during every idle period of a turn, not
  only while waiting for the first response. Previously the three-dot indicator
  was a one-shot placeholder pushed when the user submitted and removed on the
  first assistant event, so in an agentic turn the surface looked frozen while a
  tool executed and while the model round-tripped on a tool result. The indicator
  is now a derived view of the conversation state: it sits at the tail whenever a
  turn is in flight and the assistant is between visible actions (after submit,
  while a tool runs, and during the model round-trip after a tool result), and is
  dropped the moment text or tool input streams again or the turn ends. It is
  deliberately not shown after a finished text block, since a turn that ends on
  text emits its completion immediately and a dot there would only flash.
- Updated dependencies [[`4cdbe4b`](https://github.com/Seungwoo321/agent-devtools/commit/4cdbe4b2e2103c015dd8fda2278ce683c1ece0a5), [`6317aa3`](https://github.com/Seungwoo321/agent-devtools/commit/6317aa3fdc501738aa89fcae6a660384e3f7bc15)]:
  - @agent-devtools/core@1.1.0-beta.0

## 1.0.0

### Patch Changes

- Updated dependencies [[`9e0acd0`](https://github.com/Seungwoo321/agent-devtools/commit/9e0acd0213161d04437d3f990c9ad6bf1a756cb1)]:
  - @agent-devtools/core@1.0.0

## 1.0.0-beta.1

### Patch Changes

- Updated dependencies [[`9e0acd0`](https://github.com/Seungwoo321/agent-devtools/commit/9e0acd0213161d04437d3f990c9ad6bf1a756cb1)]:
  - @agent-devtools/core@1.0.0-beta.1

## 0.7.0-beta.0

### Patch Changes

- Updated dependencies []:
  - @agent-devtools/core@0.7.0-beta.0

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

### Patch Changes

- Updated dependencies [[`a7e5ed5`](https://github.com/Seungwoo321/agent-devtools/commit/a7e5ed5fec27895545f511e21f0b9f0f7a51488b)]:
  - @agent-devtools/core@0.6.0

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

### Patch Changes

- Updated dependencies [[`19bd25a`](https://github.com/Seungwoo321/agent-devtools/commit/19bd25acb4a4470d56a5c313e01edbe75ee329bb)]:
  - @agent-devtools/core@0.5.0
