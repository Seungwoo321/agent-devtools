# @agent-devtools/vite

## 1.2.1

### Patch Changes

- Updated dependencies [[`56eb210`](https://github.com/Seungwoo321/agent-devtools/commit/56eb210502b621c2fdd2952bafb5c2eab4538512)]:
  - @agent-devtools/widget-core@1.2.1
  - @agent-devtools/core@1.2.1

## 1.2.1-beta.0

### Patch Changes

- Updated dependencies [[`56eb210`](https://github.com/Seungwoo321/agent-devtools/commit/56eb210502b621c2fdd2952bafb5c2eab4538512)]:
  - @agent-devtools/widget-core@1.2.1-beta.0
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

- Updated dependencies [[`29b80b1`](https://github.com/Seungwoo321/agent-devtools/commit/29b80b15fad3f4adb901d31155d2b7ff78d1e352)]:
  - @agent-devtools/widget-core@1.2.0
  - @agent-devtools/core@1.2.0

## 1.2.0-beta.0

### Patch Changes

- Updated dependencies []:
  - @agent-devtools/core@1.2.0-beta.0
  - @agent-devtools/widget-core@1.2.0-beta.0

## 1.1.0

### Patch Changes

- Updated dependencies [[`4cdbe4b`](https://github.com/Seungwoo321/agent-devtools/commit/4cdbe4b2e2103c015dd8fda2278ce683c1ece0a5), [`6317aa3`](https://github.com/Seungwoo321/agent-devtools/commit/6317aa3fdc501738aa89fcae6a660384e3f7bc15)]:
  - @agent-devtools/core@1.1.0

## 1.1.0-beta.0

### Patch Changes

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
