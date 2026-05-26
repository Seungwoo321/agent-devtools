# @agent-devtools/e2e

> Internal Playwright E2E smoke suite for agent-devtools examples.

This package is **private** and is not published to npm. It drives the `examples/react-vite` app under Chromium and exercises the widget end-to-end against both provider runtimes.

## What this covers

The suite runs two complementary specs.

### `specs/widget-shell.spec.ts` — provider-agnostic widget shell

These tests never call the agent server, so they pass regardless of authentication state — the right canary for "Vite plugin + bootstrap + mount" wiring.

- The launcher mounts inside the widget host (closed shadow root, flipped open for the test run via `AGENT_DEVTOOLS_OPEN_SHADOW=1`) and toggles the composer.
- The gear icon swaps the stream view for the settings panel; only one of the two is visible at a time (shared slot).
- The settings panel surfaces the workspace root the dev server reported via `/v1/agent/info`.
- Picking a DOM element fills the composer chip with a component-aware label — verifies the fiber walker fed evidence into the composer's chip state.

### `specs/providers-live.spec.ts` — live provider round-trips

These tests hit live providers and are auto-skipped when the `claude` CLI is not authenticated. Both providers ultimately consume the user's Anthropic Pro 5h quota, so the suite runs single-worker, single-project to avoid amplifying the rate-limit window without buying signal.

- The **ACP** provider (`@agentclientprotocol/claude-agent-acp`, JSON-RPC over stdio to the local `claude` CLI) answers a one-shot prompt with at least one assistant message. Assertions are structural — a user bubble appears, an assistant bubble appears, no error bubble was rendered.
- The **SDK** provider (`@anthropic-ai/claude-agent-sdk`, in-process `query()`) answers after the user toggles the provider radio.
- The picked element is forwarded in the `POST /v1/agent/stream` request payload, including `tagName`, `outerHTML`, and (for React 19 dev builds) the resolved `source.fileName` / `source.lineNumber` — regression net for the React 19 `_debugStack` resolver.

The suite also enforces the dev-only guard implicitly: the test webserver runs `pnpm --filter @agent-devtools/example-react-vite dev`, so any regression that lets the widget bundle leak into a production build is caught upstream by the example's smoke script and the per-package guard in `.claude/rules/dev-only-guard.md`.

## How to run

From the repo root:

```bash
pnpm install               # workspace install
pnpm e2e:install           # download the Playwright Chromium browser
pnpm e2e                   # run the full suite (auto-spawns the dev server)
```

The webserver picks port `5183` by default (set in `playwright.config.ts`) and is reused between runs locally (`reuseExistingServer: true`); CI always starts a fresh server. The widget mounts with an open shadow root for the lifetime of the test webserver only — `AGENT_DEVTOOLS_OPEN_SHADOW=1` is scoped to that subprocess, never set in production code.

Other scripts available from this package:

```bash
pnpm --filter @agent-devtools/e2e test           # alias of `playwright test`
pnpm --filter @agent-devtools/e2e test:headed    # run with a visible browser
pnpm --filter @agent-devtools/e2e test:ui        # Playwright UI mode
pnpm --filter @agent-devtools/e2e typecheck      # tsc --noEmit
```

Failures preserve a trace, a screenshot, and a video under `test-results/`; the HTML report lands in `playwright-report/`.

### Live provider prerequisites

`specs/providers-live.spec.ts` requires:

- The `claude` CLI on `PATH`.
- A Claude Pro/Max subscription logged in via `claude` — both ACP and SDK delegate auth to it.

Without these the live specs auto-skip with a clear message; the shell specs in `widget-shell.spec.ts` still run.

## Files

```
packages/e2e/
├── playwright.config.ts     Chromium-only, single worker, dev server boot
├── specs/
│   ├── widget-shell.spec.ts     widget shell smoke (no provider auth needed)
│   └── providers-live.spec.ts   ACP + SDK round-trips (auto-skip without claude CLI)
└── support/
    └── fixtures.ts          shared WidgetHandle fixture, closed-shadow helpers, hasClaudeAuth()
```

`fixtures.ts` extends `@playwright/test` with a `widget` fixture so specs read like user stories rather than Playwright API plumbing, centralises the open-shadow CSS dance for locating the composer / stream / settings panel, and exposes `hasClaudeAuth()` for the live-provider skip guard.
