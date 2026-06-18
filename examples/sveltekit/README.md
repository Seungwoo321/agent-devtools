[English] · [한국어](./README.ko.md)

# @agent-devtools/example-sveltekit

End-to-end smoke for `@agent-devtools/sveltekit`. A minimal SvelteKit app on Vite 8 with the Node adapter that mounts the floating widget through a dev-only `onMount` call.

## Layout

- `src/routes/+page.svelte` — root route with a single `<Counter />` child.
- `src/lib/Counter.svelte` — picker target. `describePickedSvelteKit` reads `__svelte_meta` and walks the component ancestor chain to resolve the source `.svelte` file.
- `src/routes/+layout.svelte` — gates `import('@agent-devtools/sveltekit')` + `mountAgentDevtoolsSvelteKit()` behind `if (import.meta.env.PROD) return`, so the call site is tree-shaken out of the production client bundle.
- `src/hooks.server.ts` — wires `createAgentDevtoolsHandle()` as a passthrough, the binding point for future server-side features (per-request pairing token injection, SSR bootstrap config emission).
- `vite.config.ts` — wires `agentDevtools({ framework: 'sveltekit' })` alongside `@sveltejs/kit/vite`, which auto-detects the `@sveltejs/kit` dependency.

## Run

```bash
pnpm install
pnpm --filter @agent-devtools/example-sveltekit dev
```

The dev server listens on `http://127.0.0.1:3204`. The widget appears in the bottom-right corner; the bootstrap is mounted by `@agent-devtools/sveltekit` from the dev-only `onMount` in `+layout.svelte`.

## Production no-leak smoke

```bash
pnpm --filter @agent-devtools/example-sveltekit build:check
```

`build:check` runs `vite build`, then `scripts/check-no-leak.mjs`, which greps every text file in `build/` and `.svelte-kit/output/` for any widget-chain identifier (`mountAgentDevtools`, `mountAgentDevtoolsSvelte`, `mountAgentDevtoolsSvelteKit`, `describePickedSvelte`, `describePickedSvelteKit`, `walkComponentAncestors`, etc.). Layer 1 (`if (import.meta.env.PROD) return` + the plugin's `apply: 'serve'`) keeps the mount chain out of the production bundle; if it is ever bypassed, `mountAgentDevtoolsSvelteKit` throws when `NODE_ENV === 'production'` as the Layer 2 backstop. CI fails the example if anything leaks.
