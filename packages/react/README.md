[English] · [한국어](./README.ko.md)

# @agent-devtools/react

> React 19 adapter for [agent-devtools](https://github.com/Seungwoo321/agent-devtools). Mounts the floating widget into a closed Shadow DOM, walks the fiber tree to resolve picked components, and ships the default SSE transport for the local agent server.

[![npm](https://img.shields.io/npm/v/@agent-devtools/react.svg)](https://www.npmjs.com/package/@agent-devtools/react)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/Seungwoo321/agent-devtools/blob/main/LICENSE)

## Features

- **`mountAgentDevtools`** — mounts the launcher, composer, and settings widget into a closed Shadow DOM so host styles, events, and the host React instance stay isolated.
- **Production guard** — `mountAgentDevtools` throws when `NODE_ENV === 'production'`. Pass `{ force: true }` only for explicit staging or preview deployments.
- **DOM picker + fiber walker** — in **Pick** mode, hovering an element resolves the React component name, a subset of props, a stable semantic selector, and (in React 19 dev builds) the source file and line.
- **`createDefaultTransport`** — SSE transport that POSTs to `/v1/agent/stream`, carries `Authorization: Bearer <pairing-token>`, and persists one ACP session per browser tab via `sessionStorage`.
- **Auto context** — the picked descriptor, the current route, and recent console errors are attached to each prompt automatically.
- **Continue in terminal handoff** — when `requestHandoff` is wired, the composer can dump the in-memory conversation and the page context into a `claude --append-system-prompt-file …` command so you can keep going in a terminal session.

## Install

```bash
pnpm add -D @agent-devtools/react @agent-devtools/core
```

Peer dependencies: `react >= 19.0.0`, `react-dom >= 19.0.0`.

## Usage

Most projects use the Vite plugin and never call `mountAgentDevtools` directly:

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { agentDevtools } from '@agent-devtools/vite';

export default defineConfig({
  plugins: [react(), agentDevtools()],
});
```

The Vite plugin spawns the agent server, mints the pairing token, and injects an equivalent bootstrap during dev. See [`@agent-devtools/vite`](https://www.npmjs.com/package/@agent-devtools/vite).

### Manual mount (without the Vite plugin)

```tsx
// The dynamic import keeps the widget bundle out of production builds.
if (import.meta.env.DEV) {
  const { mountAgentDevtools, createDefaultTransport } =
    await import('@agent-devtools/react');

  const handle = mountAgentDevtools({
    transport: createDefaultTransport({
      baseUrl: 'http://127.0.0.1:4317',
      pairingToken: '<provisioned at startup>',
    }),
  });

  // Optional: tear down explicitly when your app unmounts.
  // handle.destroy();
}
```

`mountAgentDevtools` returns a handle exposing `destroy()` and lifecycle helpers. Calling it twice on the same document is safe — the second call is a no-op while the first widget lives.

## API

### `mountAgentDevtools(options)`

| Option           | Type                                     | Default               | Description                                                                                             |
| ---------------- | ---------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------- |
| `document`       | `Document`                               | `globalThis.document` | Document the widget is mounted into.                                                                    |
| `rootContainer`  | `Element \| null`                        | `null`                | The DOM container React `createRoot`-ed into. Used to find the root fiber for page-context collection.  |
| `transport`      | `AgentDevtoolsTransport`                 | (none)                | Transport adapter. Without one, the composer runs in a UI-only mode.                                    |
| `force`          | `boolean`                                | `false`               | Bypass the production-build guard. For explicit staging or preview only.                                |
| `shadowOpen`     | `boolean`                                | `false`               | Use an open shadow root for the widget host (E2E debugging only).                                       |
| `settingsStore`  | `SettingsStore`                          | (created internally)  | Reactive settings store shared with the transport so the settings panel and the transport stay in sync. |
| `getServerInfo`  | `() => Promise<AgentServerInfo \| null>` | (none)                | Async fetcher for `/v1/agent/info`. Hydrates the workspace root and grays out unregistered providers.   |
| `requestHandoff` | `HandoffRequester`                       | (none)                | POSTs to `/v1/agent/handoff` so "Continue in terminal" returns a `claude` command.                      |

### `createDefaultTransport(options)`

| Option                | Type                                  | Default              | Description                                                                        |
| --------------------- | ------------------------------------- | -------------------- | ---------------------------------------------------------------------------------- |
| `baseUrl`             | `string`                              | (required)           | Agent server origin, e.g. `http://127.0.0.1:4317`.                                 |
| `pairingToken`        | `string`                              | (required)           | Bearer token minted by the agent server at startup.                                |
| `fetch`               | `typeof fetch`                        | `globalThis.fetch`   | Custom fetch implementation (testing, SSR shim).                                   |
| `getSettings`         | `() => SettingsSnapshot \| undefined` | (none)               | Reads the current `provider`, `model`, and `permissionMode` from a settings store. |
| `sessionIdStorage`    | `Storage \| 'memory'`                 | `sessionStorage`     | Where the per-tab ACP session id is persisted.                                     |
| `sessionIdStorageKey` | `string`                              | `agent-devtools:sid` | Storage key for the ACP session id.                                                |
| `generateSessionId`   | `() => string`                        | `crypto.randomUUID`  | Custom session id minter.                                                          |

The transport keeps one ACP session per browser tab and resumes it after a reload. A second tab gets a fresh id because `sessionStorage` is tab-scoped.

## Security defaults

- **Production refusal** — `mountAgentDevtools` throws if `process.env.NODE_ENV === 'production'` so a widget that accidentally ships in a production bundle stays dormant.
- **Closed Shadow DOM** — host CSS, host events, and the host React instance stay outside the widget tree.
- **Pairing-token-only auth** — every request carries `Authorization: Bearer <token>`. The token is never written to the URL.

## Requirements

- Node.js `>= 24.0.0`
- React `>= 19` running in a dev build (the picker reads JSX source via the React 19 dev runtime).

## Links

- Monorepo: <https://github.com/Seungwoo321/agent-devtools>
- Core package: [`@agent-devtools/core`](https://www.npmjs.com/package/@agent-devtools/core)
- Vite plugin: [`@agent-devtools/vite`](https://www.npmjs.com/package/@agent-devtools/vite)
- User guide: <https://agent-devtools.seungwoo321.dev>
- Issue tracker: <https://github.com/Seungwoo321/agent-devtools/issues>

## License

[MIT](https://github.com/Seungwoo321/agent-devtools/blob/main/LICENSE) © Seungwoo Lee
