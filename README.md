<p align="center">
  <img src="./assets/brand/logo.svg" width="96" height="96" alt="agent-devtools logo" />
</p>

<h1 align="center">agent-devtools</h1>

<p align="center">
  <strong>Claude Code, inside your running app.</strong>
</p>

<p align="center">
  A floating chat that picks any component, reads the code, and edits files itself — right there in the browser. No IDE forwarding, no second login or vendor API key — it reuses your existing Claude Pro/Max subscription through the Claude Code CLI OAuth.
</p>

<p align="center">
  <strong>English</strong> · <a href="./README.ko.md">한국어</a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@agent-devtools/core"><img src="https://img.shields.io/npm/v/@agent-devtools/core?label=npm&color=cb3837" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/@agent-devtools/core"><img src="https://img.shields.io/node/v/@agent-devtools/core?color=339933" alt="Node engine" /></a>
  <a href="https://github.com/Seungwoo321/agent-devtools/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/Seungwoo321/agent-devtools/ci.yml?branch=main&label=ci" alt="ci" /></a>
  <a href="https://agent-devtools-docs.vercel.app/en/guides/security/#dev-only-guard-2-layer"><img src="https://img.shields.io/badge/production-no--leak%20verified-2ea44f" alt="production no-leak verified" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/github/license/Seungwoo321/agent-devtools" alt="license" /></a>
</p>

<p align="center">
  <sub>The <strong>production no-leak</strong> badge reflects the <a href="https://agent-devtools-docs.vercel.app/en/guides/security/#dev-only-guard-2-layer">2-layer dev-only guard</a> — build-time exclusion from production graphs plus a runtime <code>NODE_ENV</code> check. Every example carries a symbol scanner (<a href="./scripts/check-no-leak.mjs"><code>scripts/check-no-leak.mjs</code></a>) that the CI matrix runs against the real <code>dist/</code>, <code>.next/</code>, and <code>.output/</code> output on every push.</sub>
</p>

## Demo

![agent-devtools demo: launcher → picker → composer → live edit](./assets/demo.gif)

Pick the disabled "Add to cart" button in the widget and ask "why does this stay disabled after I pick a size?" The agent walks the React fiber chain back to the parent `ProductDetail`, follows the imports the picker shipped along (`useCart`, `selectors/inventory.ts`), reads the actual handler and selector source, then either explains the dependency it's missing or applies an `Edit` to fix it. The same flow handles "why doesn't this list refresh after a mutation?" or "this form swallows the validation error — where is it caught?" — context the picker already packaged so the agent does not have to grep first.

- User guide (en / ko): <https://agent-devtools-docs.vercel.app/>
- How it works (single-diagram walk-through): <https://agent-devtools-docs.vercel.app/en/guides/how-it-works/>
- Context and scope: [`CONTEXT.md`](./CONTEXT.md)

## Where this sits in the category

A factual placement next to the closest neighbors — these tools all do something useful, the axes are just different.

| Axis                            | agent-devtools                                                                                                       | In-page → IDE forwarder (e.g. Stagewise)        | Browser devtools extension (e.g. React DevTools) | In-app feedback widget (e.g. ProductLift, Pastel) |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------ | ------------------------------------------------- |
| Who edits the code              | The agent, inside the browser tab                                                                                    | A separate editor / IDE agent receives the ping | Nobody — read-only inspection                    | Nobody — captured as a backlog item               |
| IDE required                    | No                                                                                                                   | Yes (Cursor / VS Code / similar)                | No (browser only)                                | No                                                |
| Picked context shipped to agent | `PickedEvidence` (component chain, source path, selector, outerHTML — extending to source slice and related imports) | URL + screenshot + selected element             | N/A                                              | Screenshot + page URL                             |
| Subscription model              | BYO Claude Pro/Max (reuses CLI OAuth)                                                                                | BYO model API key                               | None                                             | Vendor subscription                               |
| Production-bundle bytes         | Zero (2-layer dev-only guard)                                                                                        | Varies                                          | Zero (extension only)                            | Embedded SDK in production                        |
| Permission boundary             | Action-typed policy (`bash`/`webFetch`/`mcpTool` default to ask)                                                     | Inherits the host editor's permission model     | Read-only                                        | N/A (no code execution)                           |

If a row reads "the agent edits inside the page, no IDE involved, no extra subscription", that is the cell agent-devtools is built to occupy. Other rows are honest neighbors, not enemies.

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
      '@agent-devtools/widget-core',
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

All `@agent-devtools/*` packages publish on a single shared version line — the npm badge above always reflects the current release.

| Package                                                   | Description                                               |
| --------------------------------------------------------- | --------------------------------------------------------- |
| [`@agent-devtools/core`](./packages/core)                 | Framework-agnostic core (server, agent engine, transport) |
| [`@agent-devtools/widget-core`](./packages/widget-core)   | Framework-agnostic widget shell (closed Shadow DOM mount) |
| [`@agent-devtools/harness-core`](./packages/harness-core) | Domain-agnostic loop strategy + LLM provider abstraction  |
| [`@agent-devtools/react`](./packages/react)               | React 19 fiber walker + DOM picker + auto context         |
| [`@agent-devtools/vue`](./packages/vue)                   | Vue 3 vnode walker + DOM picker + closed shadow widget    |
| [`@agent-devtools/vue2`](./packages/vue2)                 | Vue 2.7 component-tree walker + picker + widget           |
| [`@agent-devtools/angular`](./packages/angular)           | Angular Ivy walker + picker + widget                      |
| [`@agent-devtools/svelte`](./packages/svelte)             | Svelte 4/5 `__svelte_meta` resolver + picker + widget     |
| [`@agent-devtools/sveltekit`](./packages/sveltekit)       | SvelteKit layout mount + server `handle` binding          |
| [`@agent-devtools/next`](./packages/next)                 | Next.js 15 App Router wrapper — webpack alias + bootstrap |
| [`@agent-devtools/next-pages`](./packages/next-pages)     | Next.js Pages Router wrapper — same wrapper for `>= 12`   |
| [`@agent-devtools/nuxt`](./packages/nuxt)                 | Nuxt 3 module — dev-only plugin auto-injection            |
| [`@agent-devtools/nuxt2`](./packages/nuxt2)               | Nuxt 2 module — dev-only client plugin auto-injection     |
| [`@agent-devtools/vite`](./packages/vite)                 | Vite plugin (5–8) — auto-inject widget + dev-only guard   |

## Security defaults

- **dev-only** — every adapter's mount entry throws when `NODE_ENV === 'production'` (Layer 2 runtime guard). Build-time integrations (Vite `apply: 'serve'`, Next webpack alias + DCE, Nuxt `nuxt.options.dev` gate) keep the widget code out of the production graph (Layer 1 build guard).
- **production-leak guard** — every example carries a symbol-based scanner under `scripts/check-no-leak.mjs` that scans the real production output (`dist/`, `.next/`, `.output/`) for widget-chain identifiers (`mountAgentDevtools`, `createDefaultTransport`, `getFiberForElement`, `pumpToSse`, …) and fails the build if any leak. CI runs this matrix on every push.
- **127.0.0.1 binding** — the local agent server binds loopback only. No external network exposure. If the port is taken, falls back sequentially.
- **Pairing token** — rotated on every CLI start, memory only, never persisted to disk, never embedded in a URL. Delivered only via the `Authorization: Bearer …` header.
- **Closed Shadow DOM** — isolates the widget from host app CSS / DOM / state. A separate React 19 (or Vue 3) module instance gives a dual-tree boundary against the host.
- **Action-aware permission policy** — the runtime resolves each agent permission request by ACP `ToolKind`. With the default policy, `fileEdit` (`edit` / `delete` / `move`) auto-allows while `bash`, `webFetch`, and `mcpTool` are cancelled unless the operator explicitly switches the widget to `bypassPermissions`. See the [permission-modes guide](https://agent-devtools-docs.vercel.app/en/guides/permission-modes/) for the full mode × category matrix.
- **Workspace boundary (scope is honest)** — the `workspace` option is the canonical `cwd` of the spawned Claude Code child process and the boundary that the in-process `FileTools` (used by the picker source-slice preamble) enforces via `PathOutsideWorkspaceError`. It is **not** an OS-level sandbox: the SDK's own tool calls inherit the host user's file-system permissions, exactly like running `claude` from a terminal in that directory. See the [security model](https://agent-devtools-docs.vercel.app/en/guides/security/#workspace-boundary--what-it-does-and-does-not-enforce) for the full scope.

## Requirements

- Node.js **≥22.13** (LTS Jod) — also runs on Node 24+
- pnpm **≥11**
- (To actually run) an active Claude Pro/Max subscription (includes Agent SDK Credit from 2026-06-15)

## Development

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build:examples  # builds every adapter example and runs the no-leak smoke
```

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for the full developer guide.

## License

[MIT](./LICENSE) © Seungwoo Lee
