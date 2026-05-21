---
title: Security model
description: agent-devtools security boundary — pairing token, 2-layer dev-only guard, 127.0.0.1 loopback, closed shadow DOM.
---

## TL;DR

agent-devtools is a **local dev-server-only** tool. Zero bytes of widget code reach a production bundle, and there is no externally-reachable surface. This page documents the four layers that uphold that boundary.

## Pairing Token

The agent server requires `Authorization: Bearer <token>` on every request. The token contract is defined in [`packages/core/src/server/auth.ts`](https://github.com/Seungwoo321/agent-devtools/blob/main/packages/core/src/server/auth.ts).

- **Rotation policy** — 32 random bytes (`crypto.randomBytes(32)` encoded as base64url), minted **once per CLI process start**. The token dies with the process; a restart produces a brand-new token.
- **In-memory only / never persisted** — the token is not written to any file. It does not leak into dotenv, lock files, or caches.
- **Never in URLs** — to avoid leaking via browser history, external reverse-proxy logs, or error-reporter URL capture, the token never appears in a query string or path. Only an inline `<script>` in the dev HTML `<head>` exposes it via `window.__AGENT_DEVTOOLS_CONFIG__`. It is not present in any source file — it lives only inside Vite's `transformIndexHtml` response (see the header comment in [`packages/vite/src/plugin.ts`](https://github.com/Seungwoo321/agent-devtools/blob/main/packages/vite/src/plugin.ts)).
- **Header transport** — fetch and SSE requests carry the token solely via `Authorization: Bearer …`.
- **Constant-time comparison** — the server validates with `timingSafeEqual` to deny length/content side-channel attacks (`packages/core/src/server/auth.ts:26`).

## Dev-Only Guard (2-layer)

To prevent widget code from ever shipping to production users, every bundler integration follows the same **two-layer guard**. Full contract: [`.claude/rules/dev-only-guard.md`](https://github.com/Seungwoo321/agent-devtools/blob/main/.claude/rules/dev-only-guard.md).

### Layer 1: Build-time exclusion

In a production build, the agent-devtools code path **never enters the module graph in the first place**. We do not rely on tree-shaking.

- **Vite** — the `agentDevtools()` plugin declares `apply: 'serve'` (`packages/vite/src/plugin.ts:109`), so `vite build` ignores the plugin entirely. `transformIndexHtml` is never invoked, so neither the widget bootstrap nor the pairing-token inline script can sneak into production HTML.
- **User-side dynamic import guard** — when mounting manually without the plugin, the recommended pattern is `if (import.meta.env.DEV) { await import('@agent-devtools/react') }` (see the README "Mounting without the plugin" section). The dynamic import itself is tree-shaken out of the production bundle.
- **Next.js / Nuxt / Webpack** — same discipline: the plugin/module entry only adds imports or entries after checking `NODE_ENV !== 'production'` (or `nuxt.options.dev`). New adapters must inherit this contract verbatim.

### Layer 2: Runtime NODE_ENV gate

Even if Layer 1 is bypassed, the code refuses to run. **Fail-loud (throw) is the default** — silent no-op would hide a misdeployment.

- `mountAgentDevtools()` throws when `process.env.NODE_ENV === 'production'` (see `isProductionBuild` in [`packages/react/src/orchestrator/mount.ts:464`](https://github.com/Seungwoo321/agent-devtools/blob/main/packages/react/src/orchestrator/mount.ts)). The explicit override `{ force: true }` is the only escape hatch and is intended for justified operational debugging.
- `startAgentDevtoolsServer` performs the same check — the server will never `listen` in production.
- `enabled: false` and similar runtime opt-out options are a **separate layer** from Layer 2. Opt-out is a dev-time off switch and does not substitute for the production block.

## 127.0.0.1 Loopback

The local agent server **binds the loopback interface only** — there is no external network exposure.

- The `LOOPBACK_HOST = '127.0.0.1'` constant is enforced at the type level (`packages/core/src/server/server.ts:9`). The `host` option type itself is `typeof LOOPBACK_HOST`, so binding to any other interface is not even expressible.
- If the default port is busy, **sequential fallback** tries subsequent ports. If no port in `[desiredPort, desiredPort + maxAttempts - 1]` is free, startup fails with an explicit error.
- The browser does not hit `http://127.0.0.1:<port>` directly. It goes through a **same-origin proxy mount (`/__agent_devtools`)** on the Vite dev server (`packages/vite/src/plugin.ts`). This removes the CORS preflight surface and keeps the loopback binding strictly server-side.

## Closed Shadow DOM

The widget UI mounts onto the host page inside a **closed shadow root**.

- Host CSS variables, global styles, and event flow are isolated. None of the widget's CSS leaks into the host.
- The React 19 runtime is a **separate module instance** — the widget does not depend on the host's React provider/context, Pinia, or Redux store (dual-tree). Version mismatches with the host React are not a concern.
- The `AGENT_DEVTOOLS_OPEN_SHADOW=1` environment variable is **Playwright E2E-only**. It flips the shadow root to open so automation can snapshot the widget's internal DOM; the production-default closed isolation is never changed (`packages/vite/src/plugin.ts:103`).

For the full adapter isolation contract, see the "Isolation" section in [`.claude/rules/adapter-discipline.md`](https://github.com/Seungwoo321/agent-devtools/blob/main/.claude/rules/adapter-discipline.md).

## Automated regression guards

Two automated checks run continuously to prevent any of the four layers from silently breaking.

1. **Dev injection check** — the example's `pnpm dev` HTML must contain the widget bootstrap `<script>` tag.
2. **Production no-leak check** — grepping every text file in the example's `pnpm build` output must yield **zero** occurrences of `@agent-devtools`. This is enforced by [`packages/vite/src/build-integration.test.ts`](https://github.com/Seungwoo321/agent-devtools/blob/main/packages/vite/src/build-integration.test.ts), which runs a real production build.

If either check fails in CI, release is automatically blocked. Any change that bypasses or disables a regression guard must carry an explicit justification in the PR body or it will be rejected.

## Related docs

- Installation & plugin configuration: [`installation`](/en/guides/installation/), [`configuration`](/en/guides/configuration/)
- Permission model: [`permission-modes`](/en/guides/permission-modes/)
- First-run walkthrough: [`first-run`](/en/guides/first-run/)
