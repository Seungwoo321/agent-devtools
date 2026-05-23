<p align="center">
  <img src="./assets/brand/logo.svg" width="96" height="96" alt="agent-devtools logo" />
</p>

<h1 align="center">agent-devtools</h1>

<p align="center">
  OSS in-page agent devtools for React/Vue/Next/Nuxt — bring your own LLM subscription.
</p>

<p align="center">
  <strong>English</strong> · <a href="./README.ko.md">한국어</a>
</p>

A floating chat window pinned to the page you are developing. Ask in natural language to change UI or behavior, and the agent reads and edits the code **inside that same chat window**. No separate IDE required.

## Demo

![agent-devtools demo: launcher → picker → composer → live edit](./assets/demo.gif)

Inside the widget, type something like "make the Counter title bigger and red" and the agent reads `App.tsx` and `styles.css` and applies an `Edit`. Vite HMR reflects the new CSS instantly so you confirm the result without leaving the page.

## Status

Early alpha (`0.1.0`). Phase 0 covers React + Vite + Claude Pro/Max end-to-end. Published on npm; the API may change before `1.0`.

- User guide (en / ko): <https://agent-devtools.seungwoo321.dev>
- Context, decision log, scope: [`CONTEXT.md`](./CONTEXT.md)

## What it is

- A devtools-category OSS — same category as React DevTools or TanStack Query DevTools.
- Local LLM agent calls and code edits — the Claude Agent SDK reuses your own Claude Pro/Max subscription (Agent SDK Credit).
- BYO subscription — the project never carries the API key bill for you.

## What it is not

- Not coupled to an AI IDE; it is not a chat forwarder for Cursor / Windsurf / Claude Code.
- Not production-safe; dev-only and permanently out of scope for production.
- Not a hosted service; the CLI runs only on the user's machine.

## Quick Start (React + Vite)

```bash
pnpm add -D @agent-devtools/vite @agent-devtools/react
```

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { agentDevtools } from '@agent-devtools/vite';

export default defineConfig({
  plugins: [react(), agentDevtools()],
});
```

When you run `pnpm dev`:

1. The local agent server auto-spawns alongside the Vite dev server on a free port on `127.0.0.1`.
2. A pairing token is minted in memory and injected into the dev HTML at `window.__AGENT_DEVTOOLS_CONFIG__` (never exposed in the URL).
3. The widget launcher button appears on the page. Click it → chat opens → "Pick" a component → speak the request.
4. On `vite build` the plugin disables itself via `apply: 'serve'`. Zero bytes of widget code reach the production bundle (the automated [bundle-leak guard](./packages/vite/src/build-integration.test.ts) enforces it).

### Mounting manually without the plugin

```tsx
// Preferred — the dynamic import itself tree-shakes out of production bundles.
if (import.meta.env.DEV) {
  const { mountAgentDevtools, createDefaultTransport } =
    await import('@agent-devtools/react');
  mountAgentDevtools({
    transport: createDefaultTransport({
      baseUrl: 'http://127.0.0.1:4317',
      pairingToken: '<delivered by your provisioning mechanism>',
    }),
  });
}
```

The manual import path refuses to mount when `NODE_ENV === 'production'` (force override: `{ force: true }`). The dynamic-import guard above is the second line of defense that keeps the widget code out of the bundle even if that first line is briefly bypassed.

For full integration scenarios see [`examples/react-vite`](./examples/react-vite) and [`examples/react-vite/SMOKE-TESTS.md`](./examples/react-vite/SMOKE-TESTS.md).

## Differentiation

|                | Stagewise                               | agent-devtools                             |
| -------------- | --------------------------------------- | ------------------------------------------ |
| Required tool  | An AI IDE such as Cursor / Windsurf     | Browser only                               |
| Who pays       | Cursor subscription or the IDE-side key | Your own LLM subscription (Claude Pro/Max) |
| Response lives | Inside the IDE chat panel               | Inside the page widget                     |
| Eye movement   | Browser → IDE → browser                 | Stays in the browser                       |

## Packages

| Package                                                   | Version | Description                                                  |
| --------------------------------------------------------- | ------- | ------------------------------------------------------------ |
| [`@agent-devtools/core`](./packages/core)                 | `0.1.0` | Framework-agnostic core (server, agent engine, widget shell) |
| [`@agent-devtools/harness-core`](./packages/harness-core) | `0.1.0` | Domain-agnostic loop strategy + LLM provider abstraction     |
| [`@agent-devtools/react`](./packages/react)               | `0.1.0` | React 19 fiber walker + DOM picker + auto context            |
| [`@agent-devtools/vite`](./packages/vite)                 | `0.1.0` | Vite 8 plugin — auto-inject widget + dev-only guard          |
| `@agent-devtools/next` / `vue` / `nuxt`                   | planned | Follow-up milestone                                          |

## Security defaults

- **dev-only** — `mountAgentDevtools()` throws immediately when `NODE_ENV === 'production'` (override: `{ force: true }`). The Vite plugin sets `apply: 'serve'` so it never participates in the build step.
- **production-leak guard** — `apply: 'serve'` plus a user-side `if (import.meta.env.DEV) { … }` dynamic import together strip every widget identifier from the build output. [`packages/vite/src/build-integration.test.ts`](./packages/vite/src/build-integration.test.ts) runs a real production build and asserts the sentinel is absent.
- **127.0.0.1 binding** — the local agent server binds loopback only. No external network exposure. If the port is taken, falls back sequentially.
- **Pairing token** — rotated on every CLI start, memory only, never persisted to disk, never embedded in a URL. Delivered only via the `Authorization: Bearer …` header.
- **Closed Shadow DOM** — isolates the widget from host app CSS / DOM / state, and a separate React 19 module instance gives a dual-tree boundary.

## Requirements

- Node.js **≥24** (LTS Krypton)
- pnpm **≥11**
- (To actually run) an active Claude Pro/Max subscription (includes Agent SDK Credit from 2026-06-15)

## Development

```bash
pnpm install
pnpm typecheck
pnpm test
```

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for the full developer guide.

## License

[MIT](./LICENSE) © Seungwoo Lee
