# @agent-devtools/example-svelte-vite

End-to-end smoke example for the Svelte adapter (`@agent-devtools/svelte`) running on a Vite 8 host.

## Run

```bash
pnpm install
pnpm --filter @agent-devtools/example-svelte-vite dev
```

Open http://127.0.0.1:3203. The widget appears in the bottom-right corner; the bootstrap script tag is injected by `@agent-devtools/vite` with `framework: 'svelte'`.

## Dev-only guard

The example pairs both layers of the dev-only guard contract:

1. **Layer 1 (build-time)** — `agentDevtools` plugin uses `apply: 'serve'` so it never runs during `vite build`. The injected bootstrap is dev-only.
2. **Layer 2 (runtime)** — `mountAgentDevtoolsSvelte` throws when `NODE_ENV === 'production'`.

`pnpm --filter @agent-devtools/example-svelte-vite build:check` builds for production and then runs `scripts/check-no-leak.mjs`, which greps every text file in `dist/` for any widget-chain symbol. CI fails the example if anything leaks.
