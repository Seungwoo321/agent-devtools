# @agent-devtools/nuxt2

> Nuxt 2 module for [agent-devtools](https://github.com/Seungwoo321/agent-devtools). Registers a dev-only client plugin that calls `mountAgentDevtoolsVue2` from `@agent-devtools/vue2`, so legacy Nuxt 2 hosts get the floating chat widget without any manual entry-point wiring.

[![npm](https://img.shields.io/npm/v/@agent-devtools/nuxt2.svg)](https://www.npmjs.com/package/@agent-devtools/nuxt2)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/Seungwoo321/agent-devtools/blob/main/LICENSE)

## Features

- **Module form** — implements the Nuxt 2 module signature (`function (moduleOptions) { this.addPlugin(...) }`), so adding it is a one-line entry in `modules: ['@agent-devtools/nuxt2']`.
- **Layer 1 build-time guard** — the module's setup function short-circuits when `this.options.dev === false`. `addPlugin` is never reached during `nuxt build` / `nuxt generate`, so the runtime plugin file never enters the production graph.
- **Layer 2 runtime guard** — the auto-registered client plugin imports `mountAgentDevtoolsVue2`, which throws when `NODE_ENV === 'production'`. Even if Layer 1 is bypassed, the widget refuses to mount.
- **No SSR requirement** — the plugin is registered with `mode: 'client'`, so the widget chain is never evaluated on the server bundle.

## Install

```bash
pnpm add -D @agent-devtools/nuxt2 @agent-devtools/vue2
```

Peer dependencies: `nuxt >= 2.15.0`, `vue >= 2.7.0`.

## Usage

```js
// nuxt.config.js
export default {
  modules: ['@agent-devtools/nuxt2'],
};
```

That is the entire integration. Run `nuxt dev` and the floating launcher appears in the bottom-right.

### Production builds

`nuxt build` and `nuxt generate` skip the widget entirely thanks to the Layer 1 guard. The example smoke (`examples/nuxt2/scripts/check-no-leak.mjs`) scans both `.nuxt/dist/client` and `.nuxt/dist/server` and asserts zero widget-chain symbols leaked.

### Webpack 4 transpile note

Nuxt 2 ships webpack 4 + babel-loader and excludes `node_modules` from transpilation by default. The widget chain pulls in `marked`, which uses modern syntax (nullish coalescing, optional chaining, class fields) that webpack 4 cannot parse natively. List the adapters in `build.transpile`:

```js
// nuxt.config.js
export default {
  modules: ['@agent-devtools/nuxt2'],
  build: {
    transpile: [
      '@agent-devtools/nuxt2',
      '@agent-devtools/vue2',
      '@agent-devtools/react',
      '@agent-devtools/core',
      'marked',
    ],
  },
};
```

## Security defaults

- **Layer 1 build-time guard** — `nuxt build` / `nuxt generate` short-circuit before `addPlugin` is called.
- **Layer 2 runtime guard** — `mountAgentDevtoolsVue2` throws when `NODE_ENV === 'production'`.
- **Client-only plugin** — the runtime plugin is registered with `mode: 'client'`, so the widget chain never reaches `vue-server-renderer`.
- **Closed Shadow DOM** — host CSS, host events, and the host Vue 2 tree stay outside the widget.
- **Pairing-token bearer auth** — the transport carries `Authorization: Bearer <token>` against `http://127.0.0.1:4317` loopback. The token is never written to the URL.

## Requirements

- Node.js `>= 24.0.0`
- Nuxt `>= 2.15.0`, Vue `>= 2.7.0`

## Links

- Monorepo: <https://github.com/Seungwoo321/agent-devtools>
- Vue 2 adapter: [`@agent-devtools/vue2`](https://www.npmjs.com/package/@agent-devtools/vue2)
- Core package: [`@agent-devtools/core`](https://www.npmjs.com/package/@agent-devtools/core)
- Issue tracker: <https://github.com/Seungwoo321/agent-devtools/issues>

## License

[MIT](https://github.com/Seungwoo321/agent-devtools/blob/main/LICENSE) © Seungwoo Lee
