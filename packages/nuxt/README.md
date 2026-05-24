[English] · [한국어](./README.ko.md)

# @agent-devtools/nuxt

Nuxt 3 module for [agent-devtools](https://github.com/Seungwoo321/agent-devtools). Mounts the floating widget on every client render in development and refuses to participate in production builds.

> **Dev-only.** This module never runs in `nuxt build` / `nuxt generate` output. It is the Nuxt-side wiring of the [2-layer dev-only guard](https://github.com/Seungwoo321/agent-devtools/blob/main/.claude/rules/dev-only-guard.md).

## Install

```bash
pnpm add -D @agent-devtools/nuxt @agent-devtools/vue
```

## Configure

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@agent-devtools/nuxt'],
});
```

The module reads `nuxt.options.dev`. In production builds the `setup` function returns immediately, before `addPlugin` is ever called — the widget chain (`@agent-devtools/vue` → `@agent-devtools/react`) is therefore never resolved by the bundler.

## Options

```ts
export default defineNuxtConfig({
  modules: ['@agent-devtools/nuxt'],
  agentDevtools: {
    enabled: true,
  },
});
```

| Key       | Type      | Default | Description                                                                          |
| --------- | --------- | ------- | ------------------------------------------------------------------------------------ |
| `enabled` | `boolean` | `true`  | Turn the dev-mode injection off without removing the module. Production stays no-op. |

## How it works

1. **Build time** — `defineNuxtModule` setup checks `nuxt.options.dev`. Dev-only client plugin is registered through `addPlugin({ src, mode: 'client' })`. Production never reaches `addPlugin`.
2. **Runtime** — the registered plugin imports `mountAgentDevtoolsVue` and calls it once on the first client render. The Vue adapter throws if `NODE_ENV === 'production'` (Layer 2 fail-loud guard).

## Regression guard

`examples/nuxt` ships a `smoke:no-leak` script that walks the production `.output/` tree and asserts that no widget-chain symbol (e.g. `mountAgentDevtoolsVue`, `createDefaultTransport`, `StreamSilentError`, `getFiberForElement`, `pumpToSse`) appears anywhere in the build. Run `pnpm --filter @agent-devtools/example-nuxt build:check` to build + verify in one step. The check is intentionally symbol-based, not substring-based, so user-authored documentation strings such as the example app's `<code>@agent-devtools/nuxt</code>` markup are not false positives. (Note: `__reactFiber$` is a React DOM internal that ships in every React production bundle and is therefore excluded from the forbidden list to avoid false positives in adapters that coexist with React.)

See also [`.claude/rules/adapter-discipline.md`](https://github.com/Seungwoo321/agent-devtools/blob/main/.claude/rules/adapter-discipline.md) for the cross-adapter shape and [`.claude/rules/dev-only-guard.md`](https://github.com/Seungwoo321/agent-devtools/blob/main/.claude/rules/dev-only-guard.md) for the full 2-layer contract.
