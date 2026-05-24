# @agent-devtools/sveltekit

SvelteKit adapter for [agent-devtools](https://github.com/Seungwoo321/agent-devtools). Wires the floating chat widget into SvelteKit hosts by reusing the Svelte 4/5 walker, picker, and closed-shadow widget from `@agent-devtools/svelte`, plus a dev-only `handle` hook for the SvelteKit server.

> Dev-only. The mount entry refuses to run when `NODE_ENV === 'production'`. The Vite plugin (`@agent-devtools/vite`) further strips imports from production builds via `apply: 'serve'` — see [`dev-only-guard`](https://github.com/Seungwoo321/agent-devtools/blob/main/.claude/rules/dev-only-guard.md).

## Install

```bash
pnpm add -D @agent-devtools/sveltekit
```

## Usage

### Layout mount (dev-only)

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

Use `import.meta.env.PROD` (Vite's compile-time replacement) rather than `dev` from `$app/environment`. Vite substitutes `PROD` with the literal boolean at build time, so Rollup statically eliminates the `if`/`await import()` branch in production builds. `$app/environment`'s `dev` is a runtime export that Rollup cannot tree-shake — using it leaks the widget chain into the production client bundle.

### Server handle (optional)

```ts
// src/hooks.server.ts
import { createAgentDevtoolsHandle } from '@agent-devtools/sveltekit/hooks';

export const handle = createAgentDevtoolsHandle();
```

The hook is a passthrough today; it exists as the binding point for future agent → SSR features (per-request pairing token injection, bootstrap config emission on first SSR paint).

## Status

Phase 2 adapter expansion. Walker / picker / widget reused from `@agent-devtools/svelte`; SvelteKit-specific scaffolding is the layout mount + server handle. See the plan tree in Clawket (`PLAN-01KSBW8EMVP50W21DQKVB3G0NG`).
