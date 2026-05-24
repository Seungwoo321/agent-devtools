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

| Stack            | Install                                                        | Example                                            |
| ---------------- | -------------------------------------------------------------- | -------------------------------------------------- |
| React + Vite     | `pnpm add -D @agent-devtools/vite @agent-devtools/react`       | [`examples/react-vite`](./examples/react-vite)     |
| Vue 3 + Vite     | `pnpm add -D @agent-devtools/vite @agent-devtools/vue`         | [`examples/vue-vite`](./examples/vue-vite)         |
| Vue 2 + Vite     | `pnpm add -D @agent-devtools/vite @agent-devtools/vue2`        | [`examples/vue2-vite`](./examples/vue2-vite)       |
| Angular + Vite   | `pnpm add -D @agent-devtools/vite @agent-devtools/angular`     | [`examples/angular-vite`](./examples/angular-vite) |
| Svelte + Vite    | `pnpm add -D @agent-devtools/vite @agent-devtools/svelte`      | [`examples/svelte-vite`](./examples/svelte-vite)   |
| SvelteKit        | `pnpm add -D @agent-devtools/vite @agent-devtools/sveltekit`   | [`examples/sveltekit`](./examples/sveltekit)       |
| Next.js 15 (App) | `pnpm add -D @agent-devtools/next @agent-devtools/react`       | [`examples/next`](./examples/next)                 |
| Next.js (Pages)  | `pnpm add -D @agent-devtools/next-pages @agent-devtools/react` | [`examples/next-pages`](./examples/next-pages)     |
| Nuxt 3           | `pnpm add -D @agent-devtools/nuxt @agent-devtools/vue`         | [`examples/nuxt`](./examples/nuxt)                 |
| Nuxt 2           | `pnpm add -D @agent-devtools/nuxt2 @agent-devtools/vue2`       | [`examples/nuxt2`](./examples/nuxt2)               |

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

### Vue 2 + Vite

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import vue2 from '@vitejs/plugin-vue2';
import { agentDevtools } from '@agent-devtools/vite';

export default defineConfig({
  plugins: [vue2(), agentDevtools({ framework: 'vue2' })],
});
```

### Nuxt 2

```js
// nuxt.config.js
export default {
  modules: ['@agent-devtools/nuxt2'],
  build: {
    // Nuxt 2 ships webpack 4 + babel-loader and excludes node_modules from
    // transpilation by default. The widget chain pulls in marked which uses
    // syntax webpack 4 cannot parse natively, so list it explicitly.
    transpile: [
      '@agent-devtools/nuxt2',
      '@agent-devtools/vue2',
      '@agent-devtools/react',
      '@agent-devtools/core',
      'marked',
    ],
  },
};
```

### Angular + Vite

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import angular from '@analogjs/vite-plugin-angular';
import { agentDevtools } from '@agent-devtools/vite';

export default defineConfig({
  plugins: [angular(), agentDevtools({ framework: 'angular' })],
});
```

### Svelte + Vite

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { agentDevtools } from '@agent-devtools/vite';

export default defineConfig({
  plugins: [svelte(), agentDevtools({ framework: 'svelte' })],
});
```

### SvelteKit

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';

  let { children } = $props();

  onMount(async () => {
    if (import.meta.env.PROD) return;
    const { mountAgentDevtoolsSvelteKit } = await import('@agent-devtools/sveltekit');
    mountAgentDevtoolsSvelteKit();
  });
</script>

{@render children()}
```

`import.meta.env.PROD` is Vite's compile-time replacement, so Rollup statically removes the `if`/`await import()` branch on `vite build`.

### Next.js (Pages Router)

```ts
// next.config.ts
import { withAgentDevtools } from '@agent-devtools/next-pages';

export default withAgentDevtools({ reactStrictMode: true });
```

```tsx
// pages/_app.tsx
import { useEffect } from 'react';
import { bootstrapAgentDevtools } from '@agent-devtools/next-pages/bootstrap';
import type { AppProps } from 'next/app';

export default function App({ Component, pageProps }: AppProps) {
  useEffect(() => {
    bootstrapAgentDevtools();
  }, []);
  return <Component {...pageProps} />;
}
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
| [`@agent-devtools/vue2`](./packages/vue2)                 | `0.1.0` | Vue 2.7 component-tree walker + picker + widget              |
| [`@agent-devtools/angular`](./packages/angular)           | `0.1.0` | Angular Ivy walker + picker + widget                         |
| [`@agent-devtools/svelte`](./packages/svelte)             | `0.1.0` | Svelte 4/5 `__svelte_meta` resolver + picker + widget        |
| [`@agent-devtools/sveltekit`](./packages/sveltekit)       | `0.1.0` | SvelteKit layout mount + server `handle` binding             |
| [`@agent-devtools/next`](./packages/next)                 | `0.1.0` | Next.js 15 App Router wrapper — webpack alias + bootstrap    |
| [`@agent-devtools/next-pages`](./packages/next-pages)     | `0.1.0` | Next.js Pages Router wrapper — same wrapper for `>= 12`      |
| [`@agent-devtools/nuxt`](./packages/nuxt)                 | `0.1.0` | Nuxt 3 module — dev-only plugin auto-injection               |
| [`@agent-devtools/nuxt2`](./packages/nuxt2)               | `0.1.0` | Nuxt 2 module — dev-only client plugin auto-injection        |
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
