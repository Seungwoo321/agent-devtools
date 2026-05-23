[English] · [한국어](./README.ko.md)

# @agent-devtools/core

> Framework-agnostic core for [agent-devtools](https://github.com/Seungwoo321/agent-devtools). Ships the local agent server, pairing-token auth, the `agent-devtools` CLI, and the agent / file primitives shared by every adapter.

[![npm](https://img.shields.io/npm/v/@agent-devtools/core.svg)](https://www.npmjs.com/package/@agent-devtools/core)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/Seungwoo321/agent-devtools/blob/main/LICENSE)

## Features

- **Local agent server** — HTTP + SSE on `127.0.0.1` only, with sequential port fallback (`4317`, `4318`, … up to 20 attempts). The SSE pump emits a `: keepalive` comment line every 20s while the model is silent so intermediate proxies and tunnels do not close the connection during long thinking phases.
- **Pairing-token auth** — minted in memory at every server start, never persisted to disk, never embedded in URLs. All requests must carry `Authorization: Bearer <token>`.
- **`agent-devtools` CLI** — installed as a `bin`; bundler plugins (e.g. `@agent-devtools/vite`) auto-spawn it, but it can also be run manually.
- **ACP and SDK providers** — two interchangeable runtime providers for the agent stream endpoint: the Anthropic Agent Client Protocol provider and the Claude Agent SDK provider.
- **Workspace sandbox** — a workspace primitive that scopes the agent's file read/edit reach to a single root and rejects path escapes.
- **Handoff bundle** — `/v1/agent/handoff` packs the conversation and the page context into a markdown file, then returns the `claude --append-system-prompt-file …` command the widget surfaces.

## Install

```bash
pnpm add @agent-devtools/core
```

In most apps you do not install `core` directly. The framework adapter (`@agent-devtools/react`) and the bundler integration (`@agent-devtools/vite`) pull it in transitively.

## CLI

```bash
agent-devtools [--port <n>] [--max-attempts <n>] [--workspace <path>]
```

| Flag             | Default         | Description                                                                    |
| ---------------- | --------------- | ------------------------------------------------------------------------------ |
| `--port`         | `4317`          | Preferred port. If taken, the server tries `port + 1`, `port + 2`, … in order. |
| `--max-attempts` | `20`            | Sequential ports to try before failing.                                        |
| `--workspace`    | `process.cwd()` | Workspace root the agent may read and edit within.                             |
| `--help`, `-h`   |                 | Show this help.                                                                |

The CLI mints a fresh pairing token, starts the server bound to `127.0.0.1`, and prints the URL plus the token to stdout. The token is required on every `Authorization: Bearer …` request to the server.

## Programmatic usage

```ts
import { startAgentDevtoolsServer } from '@agent-devtools/core/server';

const handle = await startAgentDevtoolsServer({
  port: 4317,
  workspace: process.cwd(),
});

console.log(handle.url); // http://127.0.0.1:4317
console.log(handle.pairingToken); // <bearer token>

// later
await handle.close();
```

`startAgentDevtoolsServer` is what `@agent-devtools/vite` calls internally — use it when you need to manage the agent lifecycle yourself.

## HTTP surface

| Method | Path                | Description                                                                                    |
| ------ | ------------------- | ---------------------------------------------------------------------------------------------- |
| `GET`  | `/v1/agent/info`    | Returns the workspace root, the registered providers, and the default permission mode.         |
| `POST` | `/v1/agent/stream`  | SSE stream of agent events. Body picks `provider`, `model`, `permissionMode`, and the prompt.  |
| `POST` | `/v1/agent/handoff` | Returns `{ file, command }` — the markdown handoff file and the `claude` command to resume it. |

All endpoints require `Authorization: Bearer <pairing-token>`. Requests are accepted only from the loopback interface.

## Security defaults

- **Loopback only** — the server binds `127.0.0.1`. There is no flag to expose it on a LAN address.
- **Pairing token in memory** — minted via `crypto.randomBytes`, never written to disk, never put in a URL.
- **Workspace path containment** — the workspace primitive normalises every file path and rejects paths that escape the workspace root.

## Requirements

- Node.js `>= 24.0.0`
- A Claude Pro/Max session via the local `claude` CLI, **or** an `ANTHROPIC_API_KEY`.

## Links

- Monorepo: <https://github.com/Seungwoo321/agent-devtools>
- React adapter: [`@agent-devtools/react`](https://www.npmjs.com/package/@agent-devtools/react)
- Vite plugin: [`@agent-devtools/vite`](https://www.npmjs.com/package/@agent-devtools/vite)
- User guide: <https://agent-devtools-docs.vercel.app/>
- Issue tracker: <https://github.com/Seungwoo321/agent-devtools/issues>

## License

[MIT](https://github.com/Seungwoo321/agent-devtools/blob/main/LICENSE) © Seungwoo Lee
