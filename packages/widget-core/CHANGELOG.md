# @agent-devtools/widget-core

## 1.3.3

### Patch Changes

- Updated dependencies [[`469188f`](https://github.com/Seungwoo321/agent-devtools/commit/469188f05949c641c01cc603e99672524bc202e7)]:
  - @agent-devtools/core@1.3.3

## 1.3.3-beta.0

### Patch Changes

- Updated dependencies [[`469188f`](https://github.com/Seungwoo321/agent-devtools/commit/469188f05949c641c01cc603e99672524bc202e7)]:
  - @agent-devtools/core@1.3.3-beta.0

## 1.3.2

### Patch Changes

- Updated dependencies []:
  - @agent-devtools/core@1.3.2

## 1.3.2-beta.0

### Patch Changes

- Updated dependencies []:
  - @agent-devtools/core@1.3.2-beta.0

## 1.3.1

### Patch Changes

- Updated dependencies []:
  - @agent-devtools/core@1.3.1

## 1.3.1-beta.0

### Patch Changes

- Updated dependencies []:
  - @agent-devtools/core@1.3.1-beta.0

## 1.3.0

### Minor Changes

- [#15](https://github.com/Seungwoo321/agent-devtools/pull/15) [`3aaa7d3`](https://github.com/Seungwoo321/agent-devtools/commit/3aaa7d39fbfe0afcc678b53940f592f59b666e9a) Thanks [@Seungwoo321](https://github.com/Seungwoo321)! - Add slash-command autocomplete to the in-page widget composer.

  Typing `/` in the composer now opens a filterable menu of the workspace's slash commands — project and user commands plus skills — each showing its description and argument hint, mirroring the terminal experience. The catalogue is prefetched at mount through a new server endpoint (`GET /v1/agent/commands`) that lists the workspace commands without invoking the model, so the menu is available on the very first keystroke before any message is sent, and it still refreshes from the agent's `available_commands_update` stream. Arrow keys move the highlight, Enter/Tab confirm (inserting `/name ` with the caret ready for arguments), and Escape dismisses the menu. Selecting a command sends the raw text for native runtime expansion — there is no client-side macro expansion. Wired across the html runner and the React, Vue, Vue 2, Next.js, Nuxt, Svelte, SvelteKit and Angular adapters.

### Patch Changes

- Updated dependencies [[`3aaa7d3`](https://github.com/Seungwoo321/agent-devtools/commit/3aaa7d39fbfe0afcc678b53940f592f59b666e9a)]:
  - @agent-devtools/core@1.3.0

## 1.3.0-beta.0

### Minor Changes

- [`3aaa7d3`](https://github.com/Seungwoo321/agent-devtools/commit/3aaa7d39fbfe0afcc678b53940f592f59b666e9a) Thanks [@Seungwoo321](https://github.com/Seungwoo321)! - Add slash-command autocomplete to the in-page widget composer.

  Typing `/` in the composer now opens a filterable menu of the workspace's slash commands — project and user commands plus skills — each showing its description and argument hint, mirroring the terminal experience. The catalogue is prefetched at mount through a new server endpoint (`GET /v1/agent/commands`) that lists the workspace commands without invoking the model, so the menu is available on the very first keystroke before any message is sent, and it still refreshes from the agent's `available_commands_update` stream. Arrow keys move the highlight, Enter/Tab confirm (inserting `/name ` with the caret ready for arguments), and Escape dismisses the menu. Selecting a command sends the raw text for native runtime expansion — there is no client-side macro expansion. Wired across the html runner and the React, Vue, Vue 2, Next.js, Nuxt, Svelte, SvelteKit and Angular adapters.

### Patch Changes

- Updated dependencies [[`3aaa7d3`](https://github.com/Seungwoo321/agent-devtools/commit/3aaa7d39fbfe0afcc678b53940f592f59b666e9a)]:
  - @agent-devtools/core@1.3.0-beta.0

## 1.2.1

### Patch Changes

- [#13](https://github.com/Seungwoo321/agent-devtools/pull/13) [`56eb210`](https://github.com/Seungwoo321/agent-devtools/commit/56eb210502b621c2fdd2952bafb5c2eab4538512) Thanks [@Seungwoo321](https://github.com/Seungwoo321)! - Stop host-page keyboard shortcuts from firing while the user types in the
  chat panel. Closed shadow root isolates the DOM tree but not events —
  `KeyboardEvent` is `composed: true`, so a keystroke inside the panel
  retargets onto the shadow host and keeps bubbling to the host document.
  A bubble-phase `stopPropagation` for `keydown` / `keyup` / `keypress` is
  now attached on the shadow host so widget-internal handlers (composer
  `Enter` submit, etc.) still run, but host listeners (Storybook `D`,
  Notion `/`, VSCode webview `F1`, …) no longer pick up the event.

  Known DOM-standard limit: capture-phase listeners on the host `document`
  or `window` still receive the event — they sit higher in the composed
  path and run before any widget element's listener. Practically all real
  host global shortcuts are bubble-phase, so this is best-effort
  isolation, documented in `picker-strategy.md`.

- Updated dependencies []:
  - @agent-devtools/core@1.2.1

## 1.2.1-beta.0

### Patch Changes

- [`56eb210`](https://github.com/Seungwoo321/agent-devtools/commit/56eb210502b621c2fdd2952bafb5c2eab4538512) Thanks [@Seungwoo321](https://github.com/Seungwoo321)! - Stop host-page keyboard shortcuts from firing while the user types in the
  chat panel. Closed shadow root isolates the DOM tree but not events —
  `KeyboardEvent` is `composed: true`, so a keystroke inside the panel
  retargets onto the shadow host and keeps bubbling to the host document.
  A bubble-phase `stopPropagation` for `keydown` / `keyup` / `keypress` is
  now attached on the shadow host so widget-internal handlers (composer
  `Enter` submit, etc.) still run, but host listeners (Storybook `D`,
  Notion `/`, VSCode webview `F1`, …) no longer pick up the event.

  Known DOM-standard limit: capture-phase listeners on the host `document`
  or `window` still receive the event — they sit higher in the composed
  path and run before any widget element's listener. Practically all real
  host global shortcuts are bubble-phase, so this is best-effort
  isolation, documented in `picker-strategy.md`.

- Updated dependencies []:
  - @agent-devtools/core@1.2.1-beta.0

## 1.2.0

### Minor Changes

- [#12](https://github.com/Seungwoo321/agent-devtools/pull/12) [`29b80b1`](https://github.com/Seungwoo321/agent-devtools/commit/29b80b15fad3f4adb901d31155d2b7ff78d1e352) Thanks [@Seungwoo321](https://github.com/Seungwoo321)! - Make the widget survive a host page that throws — and turn captured runtime
  errors into a one-click handoff to the agent. Four cooperating layers, all
  dev-only, all routed through the same observer evidence stream so the agent
  sees host failures and devtool-internal failures in one place.
  - **L0 — ultra-early trap (Vite plugin).** The Vite plugin now emits a
    classic `<script>` ahead of the deferred module bootstrap. The script
    installs `error` + `unhandledrejection` listeners on `window` into a
    bounded ring buffer hung off `window.__AGENT_DEVTOOLS_EARLY_ERRORS__`.
    Anything that fires before the widget mounts is captured and drained
    into the observer the moment `start()` runs, instead of vanishing into
    the browser's default handler. The plugin also wraps the
    `mountAgentDevtools()` call itself in a `try/catch` so a mount failure
    surfaces as a `console.error` + a synthetic `ErrorEvent` rather than a
    dead widget. A new `@agent-devtools/widget-core/bootstrap` sub-export
    ships only the trap-builder so the Node-side plugin does not pull the
    full browser bundle into its graph.
  - **L1 — widget-internal throw containment.** A new `createWidgetGuard`
    wraps every boundary callback the orchestrator hands to its sub-pieces
    (composer submit / picker click / launcher click / settings panel / keydown
    hotkey / handoff modal / …). Sync throws and rejected promises are
    captured as `widget-internal` records — a new `ErrorRecordKind` distinct
    from host kinds so the agent can tell devtool-internal failures apart —
    routed through the same redact + buffer + subscribe path as native
    captures, and swallowed at the boundary so the widget surface stays
    responsive. The guard is itself defensive: if `ingest` throws it falls
    back to `console.error`; if even that fails it gives up silently rather
    than re-breaking the boundary it was protecting.
  - **L2 — active surfacing.** The launcher button grows a small red badge
    bubble (top-right, `pointer-events: none` so it can never swallow a
    click); the composer panel grows a slim error banner with an "Analyze"
    button. Both render the live unread count and both reset to zero on
    acknowledgement. Clicking Analyze prefills the textarea with an
    analysis prompt referencing the captured count, opens the panel, and
    focuses the input — the user just confirms with Enter. Counts above 99
    collapse to "99+". The orchestrator subscribes to the observer once
    and pushes the count to both surfaces.
  - **L3 — privacy redaction.** Already shipped on the observer level; with
    L0 wired through the same path, query-parameter values in URLs /
    messages / stacks are masked before they reach any subscriber, so the
    badge count never tips a stack-trace token into devtools.

  Public API additions on `widget-core`:
  - `mountAgentDevtools().observer.ingest(record)` — public ingest seam used
    by the L1 guard and exposed for adapter-level error pipes.
  - `launcher.setErrorCount(n)` / `launcher.getErrorCount()` — badge surface.
  - `composer.setErrorCount(n)` / `composer.getErrorCount()` /
    `composer.onAnalyzeErrors(count)` — banner + analyze affordance.
  - `@agent-devtools/widget-core/bootstrap` — `{ EARLY_ERRORS_GLOBAL,
buildEarlyErrorTrapScript }` for bundler plugins.

  No production-build behaviour changes: the 2-layer dev-only guard
  (`apply: 'serve'` + `NODE_ENV` refusal) is unaffected — the L0 script is
  emitted by the same plugin that's already skipped on `vite build`.

### Patch Changes

- Updated dependencies []:
  - @agent-devtools/core@1.2.0

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
