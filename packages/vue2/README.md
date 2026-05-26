# @agent-devtools/vue2

Vue 2 adapter for [agent-devtools](https://github.com/Seungwoo321/agent-devtools). Provides the floating chat widget, DOM picker, and Vue 2.7 component-tree walker for host applications still on Vue 2.

> Dev-only. The mount entry refuses to run when `NODE_ENV === 'production'`. Bundler integrations (Vite, Nuxt 2 module) further strip imports from production builds — see [`dev-only-guard`](https://github.com/Seungwoo321/agent-devtools/blob/main/.claude/rules/dev-only-guard.md).

## What this adapter provides

- **DOM → component bridge** — `element.__vue__` (Vue 2's per-element back-reference to the owning instance). Different surface from Vue 3's `__vueParentComponent`; the walker layer here is not interchangeable with the Vue 3 one.
- **Ancestor walker** — `$parent` chain leaf-first, yields instances with a resolvable identity (`$options.name` / `$options.__file`), caps at depth 10.
- **Source extraction** — `$options.__file` from `vue-template-compiler` SFC output (`@vitejs/plugin-vue2` in dev). Workspace-normalised to a relative path.
- **Component name** — `$options.name` → basename of `$options.__file` → `'Unknown'`.
- **Widget UI** — `@agent-devtools/widget-core` shell. No Vue 2 dependency leaks into the widget bundle.
- **Reused by** — `@agent-devtools/nuxt2` imports this walker directly.

Peer range: `vue >= 2.7` (older Vue 2 lines never set `$options.__file` reliably).

## Install

```bash
pnpm add -D @agent-devtools/vue2
```

## Usage

```ts
// In a dev-only entry, e.g. main.dev.ts gated by an import.meta.env.DEV check
import { mountAgentDevtoolsVue2 } from '@agent-devtools/vue2';

mountAgentDevtoolsVue2();
```

For Nuxt 2 hosts, use `@agent-devtools/nuxt2` which registers a dev-only client plugin.

## Status

Published as part of the fixed-mode `@agent-devtools/*` release line. Walker, picker, widget and Vite-plugin integration are in place — see `packages/vue2/src/**/*.test.ts` for the verified surface.
