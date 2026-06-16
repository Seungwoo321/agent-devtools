[English] · [한국어](./README.ko.md)

# @agent-devtools/example-nuxt2

End-to-end smoke for `@agent-devtools/nuxt2`. A minimal Nuxt 2.7 host app that loads the floating widget through the Nuxt 2 module (which mounts the Vue 2 adapter on the first client render). It runs in SPA mode (`ssr: false`, `target: 'static'`) because Nuxt 2's SSR pipeline relies on a flat `node_modules` layout that pre-dates pnpm's isolated installs; the widget injection path under test runs on the client only, so SPA mode exercises exactly the surface we care about.

## Layout

- `pages/index.vue` — root page with a single `<Counter />` child.
- `components/Counter.vue` — picker target. The picker should resolve to `components/Counter.vue`.
- `nuxt.config.js` — registers `@agent-devtools/nuxt2` in `modules`, sets SPA mode (`ssr: false`, `target: 'static'`) and the dev port `3301`, and lists the widget chain in `build.transpile` so Nuxt 2's webpack 4 + babel-loader transforms its modern syntax.

## Run

```bash
pnpm --filter @agent-devtools/example-nuxt2 dev
```

Open `http://localhost:3301`. The floating launcher should appear in the bottom-right corner. Picker → click the `Increment` button → the picker chip should resolve to `components/Counter.vue`.

## Production no-leak smoke

```bash
pnpm --filter @agent-devtools/example-nuxt2 build
node examples/nuxt2/scripts/check-no-leak.mjs
# expected: OK: scanned N text file(s) across 2 bundle dir(s), no widget-chain symbols leaked.
```

`check-no-leak.mjs` greps every text file in `.nuxt/dist/client` and `.nuxt/dist/server` for any widget-chain identifier (`mountAgentDevtools`, `mountAgentDevtoolsVue2`, `describePickedVue2`, `walkComponentAncestors`, etc.). Layer 1 (build-time): the Nuxt 2 module's setup early-returns when `this.options.dev === false`, so `addPlugin` is never called and the runtime plugin file never enters the production build graph. Layer 2 (runtime): `@agent-devtools/vue2`'s `mountAgentDevtoolsVue2` throws when `NODE_ENV === 'production'`, so even a bypassed Layer 1 fails loud.

A bare `grep '@agent-devtools' .nuxt/dist/` may match call-site references through string literals that get tree-shaken; the symbol-fingerprint scan is the authoritative no-leak check.
