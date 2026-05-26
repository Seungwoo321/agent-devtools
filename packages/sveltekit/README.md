# @agent-devtools/sveltekit

SvelteKit adapter for [agent-devtools](https://github.com/Seungwoo321/agent-devtools). Wires the floating chat widget into SvelteKit hosts by reusing the Svelte 4/5 walker, picker, and closed-shadow widget from `@agent-devtools/svelte`, plus a dev-only `handle` hook for the SvelteKit server.

> Dev-only. The mount entry refuses to run when `NODE_ENV === 'production'`. The Vite plugin (`@agent-devtools/vite`) further strips imports from production builds via `apply: 'serve'` — see [`dev-only-guard`](https://github.com/Seungwoo321/agent-devtools/blob/main/.claude/rules/dev-only-guard.md).

## What this adapter provides

- **Walker reuse** — DOM → source via `element.__svelte_meta.loc.{file,line,column}` is delegated to `@agent-devtools/svelte`. No duplicate walker code lives here.
- **Layout mount** — `mountAgentDevtoolsSvelteKit()` runs inside `+layout.svelte`'s `onMount` and only when `import.meta.env.PROD` is false. Rollup eliminates the branch on `vite build`, so the widget chain never lands in the client bundle.
- **SSR seam** — `createAgentDevtoolsHandle()` (`@agent-devtools/sveltekit/hooks`) is a passthrough today; the binding point for per-request pairing-token injection and bootstrap config emission once those land.
- **Route attachment** — `$page.url.pathname` is attached to picked evidence so the agent gets the active route alongside the picked component.
- **Widget UI** — same `@agent-devtools/widget-core` shell as the rest of the adapter family.

Peer range: `@sveltejs/kit >= 2`, `svelte >= 4`.

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
