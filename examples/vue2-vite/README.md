[English] · [한국어](./README.ko.md)

# @agent-devtools/example-vue2-vite

End-to-end smoke for `@agent-devtools/vue2`. A minimal Vite + Vue 2.7 app that mounts the floating widget through the framework-aware Vite plugin.

## Layout

- `src/App.vue` — root component with a single `<Counter />` child.
- `src/components/Counter.vue` — picker target. `describePickedVue2` walks the Vue 2 component instance chain (via `__vue__` + `$parent`) to resolve the source `.vue` file.
- `vite.config.ts` — wires `agentDevtools({ framework: 'vue2' })` alongside `@vitejs/plugin-vue2`.

## Run

```bash
pnpm install
pnpm --filter @agent-devtools/example-vue2-vite dev
```

The dev server listens on `http://127.0.0.1:3201`. Visit it once the agent server is also running on `127.0.0.1:4317` (the Vite plugin spawns it automatically by default).

## Production no-leak smoke

```bash
pnpm --filter @agent-devtools/example-vue2-vite build:check
```

`build:check` runs `vue-tsc --noEmit`, then `vite build`, then `scripts/check-no-leak.mjs`. The leak check forbids any widget-chain identifier (`mountAgentDevtools`, `describePickedVue2`, `walkComponentAncestors`, etc.) from appearing in the production `dist/` bundle. The Vite plugin declares `apply: 'serve'`, so it does not run during `vite build`; the bootstrap script tag is therefore absent from the production HTML, and the widget chain is never resolved by the bundler.

A plain `grep -r '@agent-devtools' dist` will match the literal `<code>@agent-devtools/vue2</code>` text rendered by `App.vue` — that string is user prose in the page body, not widget code.
