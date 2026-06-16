[English] · [한국어](./README.ko.md)

# @agent-devtools/example-vue-vite

End-to-end smoke for `@agent-devtools/vue`. A minimal Vite + Vue 3 app that mounts the floating widget through the framework-aware Vite plugin.

## Layout

- `src/App.vue` — root component with a single `<Counter />` child.
- `src/components/Counter.vue` — picker target. `describePickedVue` walks the Vue component instance chain to resolve the source `.vue` file.
- `vite.config.ts` — wires `agentDevtools({ framework: 'vue' })` alongside `@vitejs/plugin-vue`.

## Run

```bash
pnpm install
pnpm --filter @agent-devtools/example-vue-vite dev
```

The dev server listens on `http://127.0.0.1:3200`. Visit it once the agent server is also running on `127.0.0.1:4317` (the Vite plugin spawns it automatically by default).

## Production no-leak smoke

```bash
pnpm --filter @agent-devtools/example-vue-vite build
grep -rE 'mountAgentDevtoolsVue|describePickedVue|attachShadow\(\{mode:"closed"|AGENT_DEVTOOLS_OPEN_SHADOW' dist
```

The widget-execution grep above must return zero matches. The Vite plugin declares `apply: 'serve'` so it does not run during `vite build`; the bootstrap script tag is therefore absent from the production HTML, and the widget chain is never even resolved by the bundler.

A plain `grep -r '@agent-devtools' dist` will match the literal `<code>@agent-devtools/vue</code>` text rendered by `App.vue` — that string is user prose in the page body, not widget code.
