# @agent-devtools/example-nuxt2

Minimal Nuxt 2 host app for end-to-end smoke verification of `@agent-devtools/nuxt2`.

The example runs in SPA mode (`ssr: false`, `target: 'static'`). Nuxt 2's SSR pipeline relies on a flat `node_modules` layout that pre-dates pnpm's isolated installs (vue-server-renderer walks up the dir tree to `require('ufo')`, `require('node-fetch-native')`, etc.), so reproducing it inside the workspace would require `shamefully-hoist` — the wrong tradeoff for an example whose job is to smoke-test the client-side widget injection.

## Dev injection smoke

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

The widget mount chain (`@agent-devtools/nuxt2` → `@agent-devtools/vue2` → widget UI) must not appear in `.nuxt/dist/client` or `.nuxt/dist/server`. The Nuxt 2 module's setup early-returns when `this.options.dev === false`, so `addPlugin` is never called and the runtime plugin file is never imported by the production build graph.

A bare `grep '@agent-devtools' .nuxt/dist/` may match call-site references through string literals that get tree-shaken; the symbol-fingerprint scan is the authoritative no-leak check.

## How the 2-layer dev-only guard maps to Nuxt 2

- **Layer 1 (build-time)** — `packages/nuxt2/src/index.ts` setup hook checks `this.options.dev`. Production builds short-circuit before `addPlugin` is reached, keeping `runtime/plugin.js` out of the dependency graph entirely.
- **Layer 2 (runtime)** — `@agent-devtools/vue2`'s `mountAgentDevtoolsVue2` throws when `NODE_ENV === 'production'`. Even if Layer 1 is bypassed, the runtime guard fails loud.
