# @agent-devtools/example-sveltekit

End-to-end smoke example for the SvelteKit adapter (`@agent-devtools/sveltekit`) running on Vite 8 with the Node adapter.

## Run

```bash
pnpm install
pnpm --filter @agent-devtools/example-sveltekit dev
```

Open http://127.0.0.1:3204. The widget appears in the bottom-right corner; the bootstrap script tag is injected by `@agent-devtools/vite` with `framework: 'sveltekit'`, which auto-detects the `@sveltejs/kit` dependency.

## Dev-only guard

Two layers cooperate:

1. **Layer 1 (build-time)** — `+layout.svelte` gates the dynamic `import('@agent-devtools/sveltekit')` behind `if (!dev) return`. SvelteKit tree-shakes the call site out of the production client bundle. The Vite plugin (`@agent-devtools/vite`) additionally uses `apply: 'serve'`, so its middleware never runs during `vite build`.
2. **Layer 2 (runtime)** — `mountAgentDevtoolsSvelteKit` throws when `NODE_ENV === 'production'`, defending the contract if Layer 1 is bypassed.

`pnpm --filter @agent-devtools/example-sveltekit build:check` builds for production and runs `scripts/check-no-leak.mjs`, which greps every text file in `build/` and `.svelte-kit/output/` for any widget-chain symbol. CI fails the example if anything leaks.

## Server handle

`src/hooks.server.ts` wires `createAgentDevtoolsHandle()` as a passthrough. It exists as the binding point for future server-side features (per-request pairing token injection, SSR bootstrap config emission).
