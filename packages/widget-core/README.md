[English] · [한국어](./README.ko.md)

# @agent-devtools/widget-core

> Framework-agnostic widget shell for [agent-devtools](https://github.com/Seungwoo321/agent-devtools). Mounts the floating widget into a closed Shadow DOM, renders the launcher / composer / stream / settings UI from plain DOM, and ships the default SSE transport used by every framework adapter.

[![npm](https://img.shields.io/npm/v/@agent-devtools/widget-core.svg)](https://www.npmjs.com/package/@agent-devtools/widget-core)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/Seungwoo321/agent-devtools/blob/main/LICENSE)

## What this package provides

- **DOM / Web APIs only** — no React, Vue, Angular, or Svelte runtime imports. Every framework adapter (`@agent-devtools/react`, `@agent-devtools/vue`, …) drives this shell and layers a framework-aware picker on top.
- **Closed Shadow DOM mount** — `createShadowWidgetRoot` attaches a host element with a closed shadow root so host styles, host events, and the host framework instance stay outside the widget tree. An open shadow root is opt-in (`shadowOpen: true`) for E2E debugging.
- **Composer, stream, settings, launcher** — the floating launcher, the chat composer with markdown rendering (`marked` + `dompurify`), the streamed message renderer, and the settings panel are all assembled here.
- **Picker overlay** — the DOM picker overlay (hover outline, click capture, escape-to-cancel) lives in this package; framework adapters supply the `describePicked(element)` walker that resolves component identity.
- **Default SSE transport** — `createDefaultTransport` POSTs to `/v1/agent/stream`, carries `Authorization: Bearer <pairing-token>`, persists one ACP session per browser tab via `sessionStorage`, and surfaces dead streams as `StreamSilentError`.

## Features

- **`mountAgentDevtools`** — assembles the launcher, composer, stream renderer, settings panel, and picker into a single handle. Adapters re-export this entry point and inject framework-specific walkers.
- **Production guard** — `mountAgentDevtools` throws when `NODE_ENV === 'production'` so a widget that accidentally ships in a production bundle stays dormant. Pass `{ force: true }` only for explicit staging or preview deployments.
- **Closed Shadow DOM** — `createShadowWidgetRoot` keeps host CSS, host events, and the host framework instance outside the widget tree.
- **Auto context** — the picked descriptor, the current route, and recent console / network / unhandled errors are attached to each prompt automatically (`buildPageContext`, `createErrorObserver`).
- **Continue-in-terminal handoff** — when `requestHandoff` is wired, the composer can dump the in-memory conversation and the page context into a `claude --append-system-prompt-file …` command so you can keep going in a terminal session (`createHandoffModal`).

## Install

```bash
pnpm add @agent-devtools/widget-core @agent-devtools/core
```

No peer dependencies. Runtime dependencies: `@agent-devtools/core`, `dompurify`, `marked`.

## Usage

Most projects do **not** install `@agent-devtools/widget-core` directly — the framework adapter (`@agent-devtools/react`, `@agent-devtools/vue`, …) pulls it in transitively, injects its framework-aware walker, and re-exports `mountAgentDevtools`. Reach for `widget-core` only when you are building a custom-framework host or a new adapter.

```ts
// dynamic import keeps the widget bundle out of production builds
if (import.meta.env.DEV) {
  const { mountAgentDevtools, createDefaultTransport } =
    await import('@agent-devtools/widget-core');

  const handle = mountAgentDevtools({
    transport: createDefaultTransport({
      baseUrl: 'http://127.0.0.1:4317',
      pairingToken: '<provisioned at startup>',
    }),
    // Optional: supply a framework-aware walker. Without one, the
    // DOM-only fallback fills outerHTML / selector / tagName but leaves
    // componentName / componentChain / source empty.
    // describePicked: myFrameworkWalker,
  });

  // Optional: tear down explicitly when your app unmounts.
  // handle.destroy();
}
```

`mountAgentDevtools` returns an `AgentDevtoolsHandle` exposing the widget host, the composer, the stream renderer, the settings panel, the settings store, the handoff modal, the message store, the error observer, the picker, and `destroy()`.

## API

### `mountAgentDevtools(options)`

| Option              | Type                                                                      | Default               | Description                                                                                                                                                                                          |
| ------------------- | ------------------------------------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `document`          | `Document`                                                                | `globalThis.document` | Document the widget is mounted into.                                                                                                                                                                 |
| `rootContainer`     | `Element \| null`                                                         | `null`                | The DOM container the host framework rendered into. Used by adapters for page-context collection.                                                                                                    |
| `transport`         | `AgentDevtoolsTransport`                                                  | (none)                | Transport adapter. Without one, the composer runs in a UI-only mode.                                                                                                                                 |
| `force`             | `boolean`                                                                 | `false`               | Bypass the production-build guard. For explicit staging or preview only.                                                                                                                             |
| `shadowOpen`        | `boolean`                                                                 | `false`               | Use an open shadow root for the widget host (E2E debugging only).                                                                                                                                    |
| `settingsStore`     | `SettingsStore`                                                           | (created internally)  | Reactive settings store shared with the transport so the settings panel and the transport stay in sync.                                                                                              |
| `getServerInfo`     | `() => Promise<AgentServerInfo \| null>`                                  | (none)                | Async fetcher for `/v1/agent/info`. Hydrates the workspace root and grays out unregistered providers.                                                                                                |
| `requestHandoff`    | `HandoffRequester`                                                        | (none)                | POSTs to `/v1/agent/handoff` so "Continue in terminal" returns a `claude` command.                                                                                                                   |
| `describePicked`    | `(element: Element) => PickedEvidence`                                    | DOM-only fallback     | Framework-aware element → component resolver. Adapters inject their own walker; without one, `componentName` / `componentChain` / `source` / `propsSnapshot` stay empty but the pick still proceeds. |
| `collectPageFiles`  | `(rootContainer: Element \| null) => readonly PageFileEntry[]`            | (none)                | Framework-aware source-file collector for the page-context payload.                                                                                                                                  |
| `resolveRouteFile`  | `(pathname: string) => string \| undefined`                               | (none)                | Framework-aware mapping from `pathname` to the source file that defined the route (e.g. `pages/blog/[slug].tsx`).                                                                                    |
| `enrichPageContext` | `(pageContext: PageContext, signal: AbortSignal) => Promise<PageContext>` | (none)                | Async page-context enricher. The Vite plugin uses this to merge dev-server module-graph imports into `pageContext.picked.relatedImports`.                                                            |

### `createDefaultTransport(options)`

| Option                      | Type                                  | Default              | Description                                                                                                                          |
| --------------------------- | ------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `baseUrl`                   | `string`                              | (required)           | Agent server origin, e.g. `http://127.0.0.1:4317`.                                                                                   |
| `pairingToken`              | `string`                              | (required)           | Bearer token minted by the agent server at startup.                                                                                  |
| `fetch`                     | `typeof fetch`                        | `globalThis.fetch`   | Custom fetch implementation (testing, SSR shim).                                                                                     |
| `getSettings`               | `() => SettingsSnapshot \| undefined` | (none)               | Reads the current `provider`, `model`, and `permissionMode` from a settings store.                                                   |
| `sessionIdStorage`          | `Storage \| 'memory'`                 | `sessionStorage`     | Where the per-tab ACP session id is persisted.                                                                                       |
| `sessionIdStorageKey`       | `string`                              | `agent-devtools:sid` | Storage key for the ACP session id.                                                                                                  |
| `generateSessionId`         | `() => string`                        | `crypto.randomUUID`  | Custom session id minter.                                                                                                            |
| `streamSilentMs`            | `number`                              | `60_000`             | Reader silence past this many ms aborts the stream and rejects with `StreamSilentError`. Pass `0` to disable.                        |
| `preResponseRetries`        | `number`                              | `1`                  | Extra fetch attempts when the initial request rejects with a network error before any Response. Never retries aborts or HTTP errors. |
| `preResponseRetryBackoffMs` | `number`                              | `300`                | Delay between the failed initial fetch and the retry attempt.                                                                        |

### `createShadowWidgetRoot(options)`

Attaches the widget host element to the document and returns the shadow root container. Closed mode by default; pass `openMode: true` for E2E debugging.

### `createPicker(options)` / `createOverlay(options)`

DOM picker primitives. `createPicker` orchestrates hover capture, click handling, and escape-to-cancel; `createOverlay` draws the hover outline on top of the host DOM (pointer-events disabled so host clicks pass through).

### `StreamSilentError`

Thrown by the transport when the reader receives no chunk for longer than `streamSilentMs`. `error.name === 'StreamSilentError'`; surface it as a "stream went dead, try again" message in your UI.

### Other public entries

`createComposer`, `createStreamRenderer`, `createSettingsPanel`, `createSettingsStore`, `createLauncher`, `createHandoffModal`, `createMessageStore`, `createErrorObserver`, `createConsoleErrorObserver`, `createNetworkObserver`, `createUnhandledObserver`, `buildPageContext`, `describePicked`, `extractRoute`, `buildSelector`, `createPageContextEnricher`, `createAgentInfoFetcher`, `createHandoffRequester`, `createRelatedImportsFetcher`, `createSourceSliceFetcher`. Adapters layer on top of these primitives; new adapters compose them rather than reimplementing the shell.

## Security defaults

- **Production refusal** — `mountAgentDevtools` throws if `process.env.NODE_ENV === 'production'` so a widget that accidentally ships in a production bundle stays dormant.
- **Closed Shadow DOM** — host CSS, host events, and the host framework instance stay outside the widget tree. Open mode is gated behind an explicit `shadowOpen: true` opt-in.
- **Pairing-token-only auth** — the default transport carries `Authorization: Bearer <token>` on every request. The token is never written to the URL.
- **Sanitised markdown** — assistant messages are rendered through `marked` and sanitised with `dompurify` before insertion into the shadow tree.

## Requirements

- Node.js `>= 22.13.0`
- A browser environment with `Element.attachShadow`, `fetch`, `ReadableStream`, and `sessionStorage`.

## Links

- Monorepo: <https://github.com/Seungwoo321/agent-devtools>
- Core package: [`@agent-devtools/core`](https://www.npmjs.com/package/@agent-devtools/core)
- React adapter: [`@agent-devtools/react`](https://www.npmjs.com/package/@agent-devtools/react)
- Vite plugin: [`@agent-devtools/vite`](https://www.npmjs.com/package/@agent-devtools/vite)
- User guide: <https://agent-devtools-docs.vercel.app/>
- Issue tracker: <https://github.com/Seungwoo321/agent-devtools/issues>

## License

[MIT](https://github.com/Seungwoo321/agent-devtools/blob/main/LICENSE) © Seungwoo Lee
