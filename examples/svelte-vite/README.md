[English] · [한국어](./README.ko.md)

# @agent-devtools/example-svelte-vite

End-to-end smoke for `@agent-devtools/svelte`. A minimal Vite 8 + Svelte 5 app that mounts the floating widget through the framework-aware Vite plugin.

## Layout

- `src/App.svelte` — root component with a single `<Counter />` child.
- `src/lib/Counter.svelte` — picker target. `describePickedSvelte` reads `__svelte_meta` and walks the component ancestor chain to resolve the source `.svelte` file.
- `vite.config.ts` — wires `agentDevtools({ framework: 'svelte' })` alongside `@sveltejs/vite-plugin-svelte`.

## Run

```bash
pnpm install
pnpm --filter @agent-devtools/example-svelte-vite dev
```

The dev server listens on `http://127.0.0.1:3203`. The widget appears in the bottom-right corner; the bootstrap script tag is injected by `@agent-devtools/vite` with `framework: 'svelte'`.

## Production no-leak smoke

```bash
pnpm --filter @agent-devtools/example-svelte-vite build:check
```

`build:check` runs `vite build`, then `scripts/check-no-leak.mjs`. The leak check forbids any widget-chain identifier (`mountAgentDevtools`, `mountAgentDevtoolsSvelte`, `describePickedSvelte`, `walkComponentAncestors`, etc.) from appearing in the production `dist/` bundle. The Vite plugin declares `apply: 'serve'`, so it does not run during `vite build`; the bootstrap script tag is therefore absent from the production HTML. If Layer 1 is ever bypassed, `mountAgentDevtoolsSvelte` throws when `NODE_ENV === 'production'` as the Layer 2 backstop.
