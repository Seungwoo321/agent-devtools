# @agent-devtools/svelte

Svelte adapter for [agent-devtools](https://github.com/Seungwoo321/agent-devtools). Provides the floating chat widget, DOM picker, and Svelte 4/5 source resolver for Svelte host applications.

> Dev-only. The mount entry refuses to run when `NODE_ENV === 'production'`. Bundler integrations (Vite, SvelteKit) further strip imports from production builds — see [`dev-only-guard`](https://github.com/Seungwoo321/agent-devtools/blob/main/.claude/rules/dev-only-guard.md).

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

Phase 2 adapter expansion. Walker, picker, widget and bundler integration land incrementally. See the plan tree in Clawket (`PLAN-01KSBW8EMVP50W21DQKVB3G0NG`).
