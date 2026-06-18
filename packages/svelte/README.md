[English] · [한국어](./README.ko.md)

# @agent-devtools/svelte

> Svelte 4/5 adapter for [agent-devtools](https://github.com/Seungwoo321/agent-devtools). Mounts the floating widget into a closed Shadow DOM and reads the compiler's `__svelte_meta` to resolve picked components.

[![npm](https://img.shields.io/npm/v/@agent-devtools/svelte.svg)](https://www.npmjs.com/package/@agent-devtools/svelte)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/Seungwoo321/agent-devtools/blob/main/LICENSE)

> Dev-only. The mount entry refuses to run when `NODE_ENV === 'production'`. Bundler integrations (Vite, SvelteKit) further strip imports from production builds — see [`dev-only-guard`](https://github.com/Seungwoo321/agent-devtools/blob/main/.claude/rules/dev-only-guard.md).

## Features

- **DOM → source bridge** — `readSvelteMeta` reads `element.__svelte_meta.loc.{ file, line, column }`. The Svelte compiler attaches this metadata to every DOM element in dev mode. No tree walk needed; the picked element already carries its source.
- **Component name** — `deriveComponentName`: basename of the `.svelte` file path (`src/Counter.svelte` → `Counter`), falling back to `'Unknown'`.
- **Ancestor chain** — `walkComponentAncestors` climbs the DOM `parentElement` chain leaf-first and collects distinct `__svelte_meta.loc.file` entries. Capped at depth 10.
- **Source extraction** — `resolveSourceFromMeta` comes for free with the DOM bridge; `file` is workspace-normalised (strips `/@fs/`, decodes `file://`, drops `?t=<bust>`), `line` and `column` pass through verbatim.
- **`mountAgentDevtoolsSvelte`** — mounts the launcher, composer, and settings widget into a closed Shadow DOM via the `@agent-devtools/widget-core` shell. Svelte's reactivity system is never touched.
- **Production guard** — `mountAgentDevtoolsSvelte` throws when `NODE_ENV === 'production'`.
- **Reused by** — `@agent-devtools/sveltekit` imports this walker directly.

See [picker-strategy.md](https://github.com/Seungwoo321/agent-devtools/blob/main/.claude/rules/picker-strategy.md) for the cross-adapter contract.

## Install

```bash
pnpm add -D @agent-devtools/svelte
```

Peer dependency: `svelte ^4.0.0 || ^5.0.0` (the `__svelte_meta` shape is stable across Svelte 4 and Svelte 5 dev builds).

## Usage

```ts
// In a dev-only entry, e.g. src/main.dev.ts gated by import.meta.env.DEV
import { mountAgentDevtoolsSvelte } from '@agent-devtools/svelte';
mountAgentDevtoolsSvelte();
```

The walker reads `element.__svelte_meta.loc.{file,line,column}`, the dev-only metadata that the Svelte compiler attaches to every DOM element. componentName is derived from the basename of the `.svelte` file (e.g. `Counter.svelte` → `Counter`).

For SvelteKit hosts, use `@agent-devtools/sveltekit`, which registers a dev-only handle hook.

## Status

Published as part of the fixed-mode `@agent-devtools/*` release line. Walker, picker, widget and Vite-plugin integration are in place — see `packages/svelte/src/**/*.test.ts` for the verified surface.

## License

[MIT](https://github.com/Seungwoo321/agent-devtools/blob/main/LICENSE) © Seungwoo Lee
