[English] · [한국어](./README.ko.md)

# @agent-devtools/vite

> Vite 8 plugin for [agent-devtools](https://github.com/Seungwoo321/agent-devtools) — auto-spawns the local agent server, injects the widget bootstrap into dev HTML, and is a no-op during `vite build`.

**Status:** `0.1.0` — early alpha. The API may change before `1.0`.

## What it does

- **`apply: 'serve'`** — the plugin is not registered during production builds at all. Zero bytes of widget code reach `dist/`.
- **Local agent server spawn** — auto-spawns on a free `127.0.0.1` port; the pairing token is generated in memory.
- **Dev HTML injection** — `transformIndexHtml(order: 'pre')` injects `window.__AGENT_DEVTOOLS_CONFIG__` (baseUrl + pairingToken) plus the `mountAgentDevtools` bootstrap module. Tokens are **not** written into URLs.
- **Graceful shutdown** — the spawned agent process is terminated when Vite's dev server closes.

## Install

```bash
pnpm add -D @agent-devtools/vite @agent-devtools/react @agent-devtools/core
```

Peer dependency: `vite >= 8`.

## Quick usage

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { agentDevtools } from '@agent-devtools/vite';

export default defineConfig({
  plugins: [react(), agentDevtools()],
});
```

Run `pnpm dev` and the launcher appears in the bottom-right corner of every page. Run `pnpm build` and grep the output:

```bash
grep -r "@agent-devtools" dist/ || echo "OK — no leak"
```

The production-leak guarantee is enforced by [`build-integration.test.ts`](https://github.com/Seungwoo321/agent-devtools/blob/main/packages/vite/src/build-integration.test.ts) which runs an actual production build inside the package's test suite.

## Options

| Option        | Type      | Default                 | Notes                                                                                         |
| ------------- | --------- | ----------------------- | --------------------------------------------------------------------------------------------- |
| `enabled`     | `boolean` | `true`                  | Disable at runtime without removing the plugin from config.                                   |
| `importFrom`  | `string`  | `@agent-devtools/react` | Adapter module that exports `mountAgentDevtools` + `createDefaultTransport`.                  |
| `spawnServer` | `boolean` | `true`                  | Set to `false` to manage the agent server externally.                                         |
| `workspace`   | `string`  | Vite `config.root`      | Workspace root the agent may read/edit. Relative paths resolve against `config.root`.         |
| `port`        | `number`  | (auto)                  | Preferred port for the spawned agent server.                                                  |
| `shadowOpen`  | `boolean` | `false`                 | Use an open shadow root (E2E debugging only). `AGENT_DEVTOOLS_OPEN_SHADOW=1` also flips this. |

## Requirements

- Node.js `>= 24.0.0`
- Vite `>= 8`

## Links

- Monorepo: <https://github.com/Seungwoo321/agent-devtools>
- Core package: [`@agent-devtools/core`](https://www.npmjs.com/package/@agent-devtools/core)
- React adapter: [`@agent-devtools/react`](https://www.npmjs.com/package/@agent-devtools/react)

## License

[MIT](https://github.com/Seungwoo321/agent-devtools/blob/main/LICENSE) © Seungwoo Lee
