# @agent-devtools/example-nuxt

Minimal Nuxt 3 host app for end-to-end smoke verification of `@agent-devtools/nuxt`.

## Dev injection smoke

```bash
pnpm --filter @agent-devtools/example-nuxt dev
```

Open `http://localhost:3300`. The floating launcher should appear in the bottom-right corner. Picker → click the `Increment` button → the picker chip should resolve to `components/Counter.vue`.

## Production no-leak smoke

```bash
pnpm --filter @agent-devtools/example-nuxt build
grep -RhE 'attachShadow\(\{mode:"closed"|AGENT_DEVTOOLS_OPEN_SHADOW|agent-devtools-launcher' .output/ 2>/dev/null | wc -l
# expected: 0
```

The widget mount chain (`@agent-devtools/nuxt` → `@agent-devtools/vue` → `@agent-devtools/react` widget UI) must not appear in `.output/`. The Nuxt module's setup early-returns when `nuxt.options.dev === false`, so `addPlugin` is never called and the runtime plugin file is never imported by the production build graph.

A bare `grep '@agent-devtools' .output/` may match call-site references through string literals that get tree-shaken; the widget-execution fingerprint grep is the authoritative no-leak check.

## How the 2-layer dev-only guard maps to Nuxt

- **Layer 1 (build-time)** — `packages/nuxt/src/index.ts` setup hook checks `nuxt.options.dev`. Production builds short-circuit before `addPlugin` is reached.
- **Layer 2 (runtime)** — `@agent-devtools/vue`'s `mountAgentDevtoolsVue` throws when `NODE_ENV === 'production'`. Even if Layer 1 is bypassed, the runtime guard fails loud.
