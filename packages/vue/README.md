[English] · [한국어](./README.ko.md)

# @agent-devtools/vue

> Vue 3 adapter for [agent-devtools](https://github.com/Seungwoo321/agent-devtools). Resolves the picked DOM element to its Vue ComponentInternalInstance, walks the parent chain to build the component identity payload, and delegates the widget UI to the framework-agnostic shell shared with the React adapter.

[![npm](https://img.shields.io/npm/v/@agent-devtools/vue.svg)](https://www.npmjs.com/package/@agent-devtools/vue)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/Seungwoo321/agent-devtools/blob/main/LICENSE)

## Features

- **`mountAgentDevtoolsVue`** — mounts the floating widget into a closed Shadow DOM and wires the picker to a Vue 3 vnode walker.
- **Vue 3 component identity** — `describePickedVue` reads `element.__vueParentComponent`, resolves the component name from `name` / `__name` / `__file` (injected by `@vitejs/plugin-vue`), and walks the `.parent` chain leaf-first to build the component breadcrumb.
- **SFC source mapping** — `__file` (set by `@vitejs/plugin-vue` in dev) is normalised against the workspace root so the agent can grep against the workspace root.
- **Shared widget UI** — the launcher, composer, settings panel, and transport are reused verbatim from `@agent-devtools/react`. They are implemented as plain DOM factories inside a closed Shadow DOM, so the Vue adapter does not pull React or any host framework into your bundle.
- **Production guard** — `mountAgentDevtoolsVue` refuses to mount when `NODE_ENV === 'production'`.

## Install

```bash
pnpm add -D @agent-devtools/vue @agent-devtools/core
```

Peer dependency: `vue >= 3.4.0`.

## Usage

Most projects let the Vite plugin handle the wiring:

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { agentDevtools } from '@agent-devtools/vite';

export default defineConfig({
  plugins: [vue(), agentDevtools()],
});
```

The Vite plugin auto-detects `vue` in `package.json` and uses `@agent-devtools/vue` as the import target. Set `framework: 'vue'` explicitly when the auto-detect priority (`nuxt > next > vue > react`) selects a different adapter than you want.

### Manual mount (without the Vite plugin)

```ts
// Keep the widget bundle out of production builds.
if (import.meta.env.DEV) {
  const { mountAgentDevtoolsVue } = await import('@agent-devtools/vue');
  const { createDefaultTransport } = await import('@agent-devtools/react');

  const handle = mountAgentDevtoolsVue({
    transport: createDefaultTransport({
      baseUrl: 'http://127.0.0.1:4317',
      pairingToken: '<provisioned at startup>',
    }),
  });

  // Optional: tear down explicitly when your app unmounts.
  // handle.destroy();
}
```

## API

### `mountAgentDevtoolsVue(options)`

Same options as `mountAgentDevtools` from `@agent-devtools/react`, except `describePicked` defaults to the Vue 3 vnode walker. Pass your own resolver to override.

### `describePickedVue(element, options?)`

Build a `PickedEvidence` for a DOM element rendered by Vue 3. Returns the same shape the React adapter emits — the widget UI consumes a single interface.

### `getComponentInstanceForElement(element)`

Read `__vueParentComponent` from a DOM element and return the owning Vue component instance, or `null` if the element was not rendered by Vue.

### `walkComponentAncestors(instance, options?)`

Walk the `.parent` chain leaf-first, yielding instances with a resolvable identity (named option, `__name`, `displayName`, or `__file`). Caps emission at `maxDepth` (default 10) and skips cycles.

## Security defaults

- **Production refusal** — `mountAgentDevtoolsVue` throws if `process.env.NODE_ENV === 'production'`.
- **Closed Shadow DOM** — host CSS, host events, and the host Vue app instance stay outside the widget tree.
- **Pairing-token-only auth** — the transport carries `Authorization: Bearer <token>`. The token is never written to the URL.

## Requirements

- Node.js `>= 24.0.0`
- Vue `>= 3.4` running in a dev build with `@vitejs/plugin-vue` (the walker reads `__file` injected by the plugin).

## Links

- Monorepo: <https://github.com/Seungwoo321/agent-devtools>
- Core package: [`@agent-devtools/core`](https://www.npmjs.com/package/@agent-devtools/core)
- React adapter: [`@agent-devtools/react`](https://www.npmjs.com/package/@agent-devtools/react)
- Vite plugin: [`@agent-devtools/vite`](https://www.npmjs.com/package/@agent-devtools/vite)
- User guide: <https://agent-devtools-docs.vercel.app/>
- Issue tracker: <https://github.com/Seungwoo321/agent-devtools/issues>

## License

[MIT](https://github.com/Seungwoo321/agent-devtools/blob/main/LICENSE) © Seungwoo Lee
