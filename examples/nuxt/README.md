[English] · [한국어](./README.ko.md)

# @agent-devtools/example-nuxt

End-to-end smoke for `@agent-devtools/nuxt`. A minimal Nuxt 3 host app that mounts the floating widget through the Nuxt module.

## Layout

- `app.vue` — root component with a single `<Counter />` child.
- `components/Counter.vue` — picker target. The Vue walker resolves the picker chip to `components/Counter.vue`.
- `nuxt.config.ts` — registers `@agent-devtools/nuxt` in `modules`; the module's setup hook injects the runtime plugin only in dev.

## Run

```bash
pnpm install
pnpm --filter @agent-devtools/example-nuxt dev
```

The dev server listens on `http://127.0.0.1:3300`. The floating launcher appears in the bottom-right corner; picker → click the `Increment` button → the picker chip resolves to `components/Counter.vue`. The agent server itself must be running on `127.0.0.1:4317`.

## Production no-leak smoke

```bash
pnpm --filter @agent-devtools/example-nuxt build
grep -RhE 'attachShadow\(\{mode:"closed"|AGENT_DEVTOOLS_OPEN_SHADOW|agent-devtools-launcher' .output/ 2>/dev/null | wc -l
# expected: 0
```

The widget mount chain (`@agent-devtools/nuxt` → `@agent-devtools/vue` → `@agent-devtools/react` widget UI) must not appear in `.output/`. Two layers protect this:

- **Layer 1 (build-time).** `packages/nuxt/src/index.ts` setup hook checks `nuxt.options.dev`. Production builds short-circuit before `addPlugin` is reached, so the runtime plugin file is never imported by the production build graph.
- **Layer 2 (runtime).** `@agent-devtools/vue`'s `mountAgentDevtoolsVue` throws when `NODE_ENV === 'production'`. Even if Layer 1 is bypassed, the runtime guard fails loud.

A bare `grep '@agent-devtools' .output/` may match call-site references through string literals that get tree-shaken; the widget-execution fingerprint grep above is the authoritative no-leak check.
