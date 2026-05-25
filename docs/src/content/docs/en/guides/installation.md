---
title: Installation
description: Wire agent-devtools into a React, Vue, Angular, Svelte, Next, or Nuxt app in five minutes.
---

agent-devtools ships an adapter for each of the ten host stacks below. Pick
the section that matches your stack — the rest of the docs apply to all
adapters equally.

## 0. Prerequisites

You need the following two things ready before continuing.

1. **Claude Code CLI installed and logged in.**
   ```bash
   # If you've never installed it
   curl -fsSL https://claude.ai/install.sh | bash
   # Log in (Claude Pro / Max account)
   claude /login
   ```
   You're done as soon as an OAuth session file appears under `~/.claude/`.
2. **Node.js 24 LTS or newer.**
   Verify with `node --version`.

> agent-devtools never asks for an Anthropic API key. It reuses the OAuth
> session that the CLI already maintains.

## 1. Pick your stack

Each adapter ships a runnable example under
[`examples/`](https://github.com/Seungwoo321/agent-devtools/tree/main/examples)
and a `smoke:no-leak` script that verifies zero widget code reaches the
production bundle.

| Stack            | Install                                                        |
| ---------------- | -------------------------------------------------------------- |
| React + Vite     | `pnpm add -D @agent-devtools/vite @agent-devtools/react`       |
| Vue 3 + Vite     | `pnpm add -D @agent-devtools/vite @agent-devtools/vue`         |
| Vue 2 + Vite     | `pnpm add -D @agent-devtools/vite @agent-devtools/vue2`        |
| Angular + Vite   | `pnpm add -D @agent-devtools/vite @agent-devtools/angular`     |
| Svelte + Vite    | `pnpm add -D @agent-devtools/vite @agent-devtools/svelte`      |
| SvelteKit        | `pnpm add -D @agent-devtools/vite @agent-devtools/sveltekit`   |
| Next.js 15 (App) | `pnpm add -D @agent-devtools/next @agent-devtools/react`       |
| Next.js (Pages)  | `pnpm add -D @agent-devtools/next-pages @agent-devtools/react` |
| Nuxt 3           | `pnpm add -D @agent-devtools/nuxt @agent-devtools/vue`         |
| Nuxt 2           | `pnpm add -D @agent-devtools/nuxt2 @agent-devtools/vue2`       |

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

```tsx
// src/main.tsx — mount the widget in dev only
if (import.meta.env.DEV) {
  const { mountAgentDevtools, createDefaultTransport } =
    await import('@agent-devtools/react');
  mountAgentDevtools({
    transport: createDefaultTransport({
      baseUrl: 'http://127.0.0.1:4317',
      pairingToken: '<delivered via your provisioning mechanism>',
    }),
  });
}
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

The Vite plugin auto-mounts the Vue widget on the dev server — no manual
`mountAgentDevtoolsVue()` call needed from your app entry.

### Next.js 15 (App or Pages Router)

```ts
// next.config.ts
import type { NextConfig } from 'next';
import { withAgentDevtools } from '@agent-devtools/next';

const config: NextConfig = { reactStrictMode: true };
export default withAgentDevtools(config);
```

```tsx
// app/agent-devtools.tsx (App Router) — or use from _app.tsx (Pages Router)
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

```tsx
// app/layout.tsx
import { AgentDevtools } from './agent-devtools';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html>
      <body>
        {children}
        <AgentDevtools />
      </body>
    </html>
  );
}
```

`withAgentDevtools` installs a webpack alias for the widget chain on
production builds; the bootstrap shim early-returns when
`NODE_ENV === 'production'` so DCE strips the call site to a no-op.

### Nuxt 3

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@agent-devtools/nuxt'],
});
```

The module reads `nuxt.options.dev`. On `nuxt build` / `nuxt generate`,
`setup` returns before `addPlugin` is called and the widget chain never
enters the bundle graph.

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

The Vite plugin auto-mounts the Vue 2 widget on the dev server. Peer range:
`vue >= 2.7`.

### Nuxt 2

```js
// nuxt.config.js
export default {
  modules: ['@agent-devtools/nuxt2'],
  build: {
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

Nuxt 2's webpack 4 excludes `node_modules` from babel-loader, so the widget
chain has to be listed in `build.transpile`. Layer 1 short-circuits in
`nuxt build` / `nuxt generate` before `addPlugin` is reached. Peer range:
`nuxt >= 2.15`, `vue >= 2.7`.

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

The walker uses `window.ng.getOwningComponent` / `getComponent` from Ivy's
debug API, which is only available before `enableProdMode()`. Peer range:
`@angular/core >= 17`.

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

The walker reads `element.__svelte_meta.loc.{file,line,column}`, the
dev-only metadata the Svelte compiler attaches to every DOM element. Peer
range: `svelte >= 4`.

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

Use `import.meta.env.PROD` (Vite's compile-time replacement) rather than
`dev` from `$app/environment`. Rollup statically removes the
`if`/`await import()` branch on `vite build`, so the widget chain never
enters the production client bundle. Peer range: `@sveltejs/kit >= 2`.

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

`withAgentDevtools` installs the same production webpack alias as the App
Router wrapper. Peer range: `next >= 12`, `react >= 18`.

## 2. Run the dev server

```bash
pnpm dev
```

If a purple round floating icon appears in the bottom-right of the browser,
installation is complete.

The first click briefly displays the pairing token notice, and the dev server
console emits logs similar to the following.

```
[agent-devtools] pairing token (memory-only, rotates per CLI start)
[agent-devtools] provider: acp (default) — connecting to local Claude Code
```

## 3. Next steps

- [First run](/en/guides/first-run/) — send the first prompt to the widget and
  confirm code edits actually land
- [Permission modes](/en/guides/permission-modes/) — stop being asked to approve every action
- [Providers guide](/en/guides/providers/) — switch to SDK mode

## When installation doesn't work

- **Widget icon doesn't appear** → [Troubleshooting: widget never appears](/en/guides/troubleshooting/#widget-never-appears-on-the-dev-server-at-all)
- **`501 agent stream not configured`** → [Troubleshooting: provider not configured](/en/guides/troubleshooting/#claude-code-cli-handshake-failure-acp-child-terminates-immediately-after-spawn)
- **`claude` CLI reports missing** → revisit the Step 0 CLI installation
