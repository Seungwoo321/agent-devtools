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

- User guide (en / ko): <https://agent-devtools-docs.vercel.app/>
- Context and scope: [`CONTEXT.md`](./CONTEXT.md)

## Quick Start

Pick the row that matches your stack. Each adapter ships with a runnable example under [`examples/`](./examples) and a production-leak smoke (`pnpm --filter <example> run smoke:no-leak`) that asserts zero widget code reaches the production bundle.

| Stack        | Install                                                  | Example                                        |
| ------------ | -------------------------------------------------------- | ---------------------------------------------- |
| React + Vite | `pnpm add -D @agent-devtools/vite @agent-devtools/react` | [`examples/react-vite`](./examples/react-vite) |
| Vue 3 + Vite | `pnpm add -D @agent-devtools/vite @agent-devtools/vue`   | [`examples/vue-vite`](./examples/vue-vite)     |
| Next.js 15   | `pnpm add -D @agent-devtools/next @agent-devtools/react` | [`examples/next`](./examples/next)             |
| Nuxt 3       | `pnpm add -D @agent-devtools/nuxt @agent-devtools/vue`   | [`examples/nuxt`](./examples/nuxt)             |

### React + Vite

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { agentDevtools } from '@agent-devtools/vite';

export default defineConfig({
  plugins: [react(), agentDevtools()],
});
```

### Vue 3 + Vite

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { agentDevtools } from '@agent-devtools/vite';

export default defineConfig({
  plugins: [vue(), agentDevtools({ framework: 'vue' })],
});
```

### Next.js 15 (App or Pages Router)

```ts
// next.config.ts
import type { NextConfig } from 'next';
import { withAgentDevtools } from '@agent-devtools/next';

const config: NextConfig = { reactStrictMode: true };
export default withAgentDevtools(config);
```

```tsx
// app/agent-devtools.tsx (App Router) — or call from _app.tsx (Pages Router)
'use client';
import { useEffect } from 'react';
import { bootstrapAgentDevtools } from '@agent-devtools/next/bootstrap';

export function AgentDevtools(): null {
  useEffect(() => {
    bootstrapAgentDevtools();
  }, []);
  return null;
}
```

### Nuxt 3

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@agent-devtools/nuxt'],
});
```

In every case, running `pnpm dev`:

1. Spawns a local agent server on `127.0.0.1` on a free port (sequential fallback if 4317 is taken).
2. Mints a pairing token in memory and injects it into the dev HTML at `window.__AGENT_DEVTOOLS_CONFIG__` — never embedded in a URL.
3. Shows the widget launcher on the page. Click → chat opens → "Pick" a component → speak the request.
4. On `pnpm build` the adapter disables itself end-to-end. Zero widget bytes reach the production bundle (see [Security defaults](#security-defaults)).

## Packages

| Package                                                   | Version | Description                                                  |
| --------------------------------------------------------- | ------- | ------------------------------------------------------------ |
| [`@agent-devtools/core`](./packages/core)                 | `0.1.0` | Framework-agnostic core (server, agent engine, widget shell) |
| [`@agent-devtools/harness-core`](./packages/harness-core) | `0.1.0` | Domain-agnostic loop strategy + LLM provider abstraction     |
| [`@agent-devtools/react`](./packages/react)               | `0.1.0` | React 19 fiber walker + DOM picker + auto context            |
| [`@agent-devtools/vue`](./packages/vue)                   | `0.1.0` | Vue 3 vnode walker + DOM picker + closed shadow widget       |
| [`@agent-devtools/next`](./packages/next)                 | `0.1.0` | Next.js 15 wrapper — webpack alias + bootstrap shim          |
| [`@agent-devtools/nuxt`](./packages/nuxt)                 | `0.1.0` | Nuxt 3 module — dev-only plugin auto-injection               |
| [`@agent-devtools/vite`](./packages/vite)                 | `0.1.0` | Vite 8 plugin — auto-inject widget + dev-only guard          |

## Security defaults

- **dev-only** — every adapter's mount entry throws when `NODE_ENV === 'production'` (Layer 2 runtime guard). Build-time integrations (Vite `apply: 'serve'`, Next webpack alias + DCE, Nuxt `nuxt.options.dev` gate) keep the widget code out of the production graph (Layer 1 build guard).
- **production-leak guard** — every example carries a symbol-based scanner under `scripts/check-no-leak.mjs` that scans the real production output (`dist/`, `.next/`, `.output/`) for widget-chain identifiers (`mountAgentDevtools`, `createDefaultTransport`, `getFiberForElement`, `pumpToSse`, …) and fails the build if any leak. CI runs this matrix on every push.
- **127.0.0.1 binding** — the local agent server binds loopback only. No external network exposure. If the port is taken, falls back sequentially.
- **Pairing token** — rotated on every CLI start, memory only, never persisted to disk, never embedded in a URL. Delivered only via the `Authorization: Bearer …` header.
- **Closed Shadow DOM** — isolates the widget from host app CSS / DOM / state. A separate React 19 (or Vue 3) module instance gives a dual-tree boundary against the host.

## Requirements

- Node.js **≥24** (LTS Krypton)
- pnpm **≥11**
- (To actually run) an active Claude Pro/Max subscription (includes Agent SDK Credit from 2026-06-15)

## Development

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build:examples  # builds all four examples and runs the no-leak smoke
```

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for the full developer guide.

## License

[MIT](./LICENSE) © Seungwoo Lee
