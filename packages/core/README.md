[English] · [한국어](./README.ko.md)

# @agent-devtools/core

> Framework-agnostic core for [agent-devtools](https://github.com/Seungwoo321/agent-devtools) — local agent server, pairing-token auth, CLI binary, and the shared widget shell consumed by every adapter.

**Status:** `0.1.0` — early alpha. The API may change before `1.0`. Phase 0 covers React + Vite + Claude Pro/Max.

## What's in here

- **Local agent server** — binds to `127.0.0.1` only (no LAN exposure), sequential-port fallback, SSE streaming on `/v1/agent/stream`.
- **Pairing token** — generated in memory at every CLI start, never persisted, never embedded in URLs. Required on every request via `Authorization: Bearer <token>`.
- **`agent-devtools` CLI** — `bin/agent-devtools.mjs`. Bundler plugins (e.g. `@agent-devtools/vite`) auto-spawn it; you can also run it manually.
- **Production guard** — `mountAgentDevtools` throws when `NODE_ENV === 'production'` (override with `{ force: true }` for explicit research use only).

## Install

```bash
pnpm add -D @agent-devtools/core
```

In most projects you do **not** install `core` directly — the framework adapter (`@agent-devtools/react`) and bundler integration (`@agent-devtools/vite`) pull it in transitively.

## Requirements

- Node.js `>= 24.0.0`
- Claude Pro/Max session via the local `claude` CLI **or** `ANTHROPIC_API_KEY`

## Links

- Monorepo: <https://github.com/Seungwoo321/agent-devtools>
- React adapter: [`@agent-devtools/react`](https://www.npmjs.com/package/@agent-devtools/react)
- Vite plugin: [`@agent-devtools/vite`](https://www.npmjs.com/package/@agent-devtools/vite)
- Issue tracker: <https://github.com/Seungwoo321/agent-devtools/issues>

## License

[MIT](https://github.com/Seungwoo321/agent-devtools/blob/main/LICENSE) © Seungwoo Lee
