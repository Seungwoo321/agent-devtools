---
'@agent-devtools/widget-core': minor
'@agent-devtools/vite': minor
---

Make the widget survive a host page that throws — and turn captured runtime
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
