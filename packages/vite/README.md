[English] · [한국어](./README.ko.md)

# @agent-devtools/vite

> Vite 8 plugin for [agent-devtools](https://github.com/Seungwoo321/agent-devtools). Auto-spawns the local agent server, injects the widget bootstrap into the dev HTML, and is a no-op during `vite build`.

[![npm](https://img.shields.io/npm/v/@agent-devtools/vite.svg)](https://www.npmjs.com/package/@agent-devtools/vite)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/Seungwoo321/agent-devtools/blob/main/LICENSE)

## Features

- **`apply: 'serve'`** — the plugin is not registered during `vite build`. Zero bytes of widget code reach the production bundle.
- **Server auto-spawn** — starts the local agent server (`@agent-devtools/core`) on the first free `127.0.0.1` port at or after `4317`.
- **Dev HTML injection** — `transformIndexHtml(order: 'pre')` writes `window.__AGENT_DEVTOOLS_CONFIG__` (server URL + pairing token) and the `mountAgentDevtools` bootstrap module into the dev page.
- **In-memory pairing token** — minted by the agent server, written into the page as a JS global, never persisted to disk and never embedded in URLs.
- **Proxy passthrough** — the dev server proxies `/__agent_devtools/*` to the spawned agent server so the widget can talk to it through the same origin Vite serves.
- **Graceful shutdown** — the spawned agent process is closed when Vite's HTTP server emits `close`.
- **Adapter-agnostic** — the import target for the widget is configurable via `importFrom` (defaults to `@agent-devtools/react`).

## Install

```bash
pnpm add -D @agent-devtools/vite @agent-devtools/react @agent-devtools/core
```

Peer dependency: `vite >= 8`.

## Usage

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { agentDevtools } from '@agent-devtools/vite';

export default defineConfig({
  plugins: [react(), agentDevtools()],
});
```

Run `pnpm dev` and the launcher appears in the bottom-right corner of every page served by Vite. Run `pnpm build` and the plugin is absent from the build graph, so the output stays clean:

```bash
grep -r "@agent-devtools" dist/ || echo "OK — no leak"
```

The production-leak guarantee is enforced by [`build-integration.test.ts`](https://github.com/Seungwoo321/agent-devtools/blob/main/packages/vite/src/build-integration.test.ts), which runs an actual production build inside the package's test suite.

### Env-gated rollout

```ts
agentDevtools({
  enabled: Boolean(import.meta.env.VITE_DEVTOOLS),
});
```

`enabled: false` turns both `configureServer` and `transformIndexHtml` into no-ops without removing the plugin from the config.

### External server lifecycle

```ts
agentDevtools({
  spawnServer: false,
  // Manage @agent-devtools/core yourself (e.g. via a sibling process)
  // and point the injected config at it.
});
```

## Options

| Option        | Type                                             | Default                  | Description                                                                                                                      |
| ------------- | ------------------------------------------------ | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `enabled`     | `boolean`                                        | `true`                   | Disable the plugin at runtime without removing it from `vite.config.ts`.                                                         |
| `framework`   | `'auto' \| 'react' \| 'vue' \| 'next' \| 'nuxt'` | `'auto'`                 | Adapter to mount. `'auto'` reads the host `package.json` (priority `nuxt` > `next` > `vue` > `react`) and falls back to `react`. |
| `importFrom`  | `string`                                         | derived from `framework` | Module that exports `mountAgentDevtools` and `createDefaultTransport`. Overrides the `framework`-derived default when set.       |
| `spawnServer` | `boolean`                                        | `true`                   | Set to `false` to manage the agent server externally.                                                                            |
| `workspace`   | `string`                                         | Vite `config.root`       | Workspace root the agent may read and edit. Relative paths resolve against `config.root`.                                        |
| `port`        | `number`                                         | `4317` (auto-fallback)   | Preferred port for the spawned agent server. If taken, ports up to `port + 19` are tried in order.                               |
| `shadowOpen`  | `boolean`                                        | `false`                  | Use an open shadow root for the widget (E2E debugging only). The `AGENT_DEVTOOLS_OPEN_SHADOW=1` env flips this too.              |

## Security defaults

- **Dev-only via `apply: 'serve'`** — the production build never sees this plugin. Two layers (`apply: 'serve'` plus the runtime production guard inside `@agent-devtools/react`) together keep the widget out of the production bundle.
- **Loopback binding** — the agent server binds `127.0.0.1` only.
- **Pairing-token isolation** — the token is generated in memory by the agent server, injected as a JS global (`window.__AGENT_DEVTOOLS_CONFIG__.pairingToken`), and never written to the URL or to disk. Every request must carry it via `Authorization: Bearer …`.

## Requirements

- Node.js `>= 24.0.0`
- pnpm `>= 11`
- Vite `>= 8`

## Links

- Monorepo: <https://github.com/Seungwoo321/agent-devtools>
- Core package: [`@agent-devtools/core`](https://www.npmjs.com/package/@agent-devtools/core)
- React adapter: [`@agent-devtools/react`](https://www.npmjs.com/package/@agent-devtools/react)
- User guide: <https://agent-devtools-docs.vercel.app/>
- Issue tracker: <https://github.com/Seungwoo321/agent-devtools/issues>

## License

[MIT](https://github.com/Seungwoo321/agent-devtools/blob/main/LICENSE) © Seungwoo Lee
