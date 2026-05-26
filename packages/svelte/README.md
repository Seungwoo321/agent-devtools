# @agent-devtools/svelte

Svelte adapter for [agent-devtools](https://github.com/Seungwoo321/agent-devtools). Provides the floating chat widget, DOM picker, and Svelte 4/5 source resolver for Svelte host applications.

> Dev-only. The mount entry refuses to run when `NODE_ENV === 'production'`. Bundler integrations (Vite, SvelteKit) further strip imports from production builds — see [`dev-only-guard`](https://github.com/Seungwoo321/agent-devtools/blob/main/.claude/rules/dev-only-guard.md).

## What this adapter provides

- **DOM → source bridge** — `element.__svelte_meta.loc.{ file, line, column }`. The Svelte compiler attaches this metadata to every DOM element in dev mode. No tree walk needed; the picked element already carries its source.
- **Component name** — basename of the `.svelte` file path (`src/Counter.svelte` → `Counter`).
- **Ancestor chain** — climbs the DOM `parentElement` chain leaf-first and collects distinct `__svelte_meta.loc.file` entries. Capped at depth 10.
- **Source extraction** — comes for free with the DOM bridge; `file` is workspace-normalised, `line` and `column` are passed through verbatim.
- **Widget UI** — `@agent-devtools/widget-core` shell. Svelte's reactivity system is never touched.
- **Reused by** — `@agent-devtools/sveltekit` imports this walker directly.

Peer range: `svelte >= 4` (the `__svelte_meta` shape is stable across Svelte 4 and Svelte 5 dev builds).

## Install

```bash
pnpm add -D @agent-devtools/svelte
```

## Usage

```ts
// In a dev-only entry, e.g. src/main.dev.ts gated by import.meta.env.DEV
import { mountAgentDevtoolsSvelte } from '@agent-devtools/svelte';
mountAgentDevtoolsSvelte();
```

The walker reads `element.__svelte_meta.loc.{file,line,column}`, the dev-only metadata that the Svelte compiler attaches to every DOM element. componentName is derived from the basename of the `.svelte` file (e.g. `Counter.svelte` → `Counter`).

For SvelteKit hosts, use `@agent-devtools/sveltekit` which registers a dev-only handle hook.

## Status

Published as part of the fixed-mode `@agent-devtools/*` release line. Walker, picker, widget and Vite-plugin integration are in place — see `packages/svelte/src/**/*.test.ts` for the verified surface.
