# @agent-devtools/next-pages

> Next.js Pages Router adapter for [agent-devtools](https://github.com/Seungwoo321/agent-devtools). Reuses the React fiber walker + widget shell from `@agent-devtools/react`, and adds dev-only bootstrap hooks for legacy `pages/_app.tsx` hosts.

[![npm](https://img.shields.io/npm/v/@agent-devtools/next-pages.svg)](https://www.npmjs.com/package/@agent-devtools/next-pages)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/Seungwoo321/agent-devtools/blob/main/LICENSE)

## What this adapter provides

- **Walker reuse** — Pages Router renders client components through the same React fiber tree the App Router does, so the React fiber walker (`__reactFiber$<nonce>`, `walkComponentAncestors`, `_debugSource` for React ≤18 + `_debugStack` for React 19) imported from `@agent-devtools/react` works without re-implementation.
- **Pages Router boundary** — `bootstrapAgentDevtools` runs inside `pages/_app.tsx`. The dev server emits an env flag the bootstrap reads; production builds drop the env flag and the webpack alias eliminates the widget chain.
- **Route file attachment** — the mount injects `resolveNextPagesRouteFile`, which reads `window.next.router.pathname` (Next's dynamic-segment form like `/blog/[slug]`) and emits `pages${pathname}` into `pageContext.route.routeFile`. The extension is deliberately omitted because Pages Router accepts `.tsx`/`.jsx`/`.ts`/`.js`/`.mdx` for the same route — the agent has the directory match and can glob for the actual file.
- **Webpack alias on production** — `withAgentDevtools` rewrites `next.config` so client-side webpack resolves `@agent-devtools/{react,core,harness-core,widget-core}` to `false`. Even if a host accidentally static-imports the widget, the production bundle ends up zero bytes for those modules.
- **React 18 + 19** — fiber `_debugSource` covers React 18; `_debugStack` covers React 19. The walker takes whichever is present.
- **Widget UI** — `@agent-devtools/widget-core` shell, same shadow root contract.

Peer range: `next >= 12`, `react >= 18`, `react-dom >= 18` (intentionally wide for Pages Router hosts that stayed on older majors).

## Features

- **`withAgentDevtools`** — wraps `next.config.{js,mjs,ts}` so the dev server propagates the pairing token + base URL via environment variables, and installs a webpack alias that strips the widget chain from production bundles (Layer 1 of the dev-only guard).
- **`bootstrapAgentDevtools`** — client-only initializer that the host project calls from `pages/_app.tsx`. Refuses to mount when `NODE_ENV === 'production'` (Layer 2) or when the env flag is absent.
- **`mountAgentDevtoolsNextPages`** — a thin wrapper around `mountAgentDevtools` with a Layer 2 runtime guard so callers who manage their own client boundary stay framework-uniform.
- **Wide version range** — Pages Router has been stable since Next 12, so this adapter sets a permissive peer range (`next >= 12`, `react >= 18`).

## Install

```bash
pnpm add -D @agent-devtools/next-pages @agent-devtools/core
```

Peer dependencies: `next >= 12.0.0`, `react >= 18.0.0`, `react-dom >= 18.0.0`.

## Usage

### 1. Wrap `next.config.{js,mjs,ts}`

```ts
import { withAgentDevtools } from '@agent-devtools/next-pages';

export default withAgentDevtools(
  {
    reactStrictMode: true,
  },
  {
    baseUrl: 'http://127.0.0.1:4317',
    pairingToken: process.env.AGENT_DEVTOOLS_PAIRING_TOKEN,
  },
);
```

### 2. Bootstrap from `pages/_app.tsx`

```tsx
import { useEffect } from 'react';
import { bootstrapAgentDevtools } from '@agent-devtools/next-pages/bootstrap';
import type { AppProps } from 'next/app';

export default function App({ Component, pageProps }: AppProps) {
  useEffect(() => {
    bootstrapAgentDevtools();
  }, []);
  return <Component {...pageProps} />;
}
```

## API

### `withAgentDevtools(nextConfig, options?)`

| Option         | Type      | Description                                                                                                 |
| -------------- | --------- | ----------------------------------------------------------------------------------------------------------- |
| `enabled`      | `boolean` | Disable injection without removing the wrapper. Defaults to `true`.                                         |
| `baseUrl`      | `string`  | Optional base URL for the agent server. Falls back to the value the bootstrap module receives at call time. |
| `pairingToken` | `string`  | Optional pairing token. Propagated through `next.config` `env` into the client bundle.                      |

The wrapper sets the following env entries (omitted in production builds):

- `AGENT_DEVTOOLS_NEXT_PAGES_ENABLED = 'true'`
- `AGENT_DEVTOOLS_NEXT_PAGES_BASE_URL` — when `options.baseUrl` is provided.
- `AGENT_DEVTOOLS_NEXT_PAGES_PAIRING_TOKEN` — when `options.pairingToken` is provided.

In production builds the wrapper also installs a webpack alias that maps `@agent-devtools/{react,core,harness-core}` to `false`, so the widget chain never enters the production graph.

### `bootstrapAgentDevtools(options?)`

Client-only mount. Reads the env variables propagated by `withAgentDevtools`. Options override them when provided:

| Option         | Type     |
| -------------- | -------- |
| `baseUrl`      | `string` |
| `pairingToken` | `string` |

Idempotent: repeat calls within the same client session are ignored.

### `mountAgentDevtoolsNextPages(options?)`

Same options as `mountAgentDevtools` from `@agent-devtools/react`. Throws when invoked with `NODE_ENV === 'production'`. Use this when you want to manage the client boundary yourself instead of going through the bootstrap helper.

## Security defaults

- **Layer 1 build-time guard** — `withAgentDevtools` installs a production webpack alias that maps the widget chain to empty modules.
- **Layer 2 runtime guard** — `mountAgentDevtoolsNextPages` throws and `bootstrapAgentDevtools` early-returns when `NODE_ENV === 'production'`.
- **Closed Shadow DOM** — host CSS, host events, and the host React tree stay outside the widget.
- **Pairing-token bearer auth** — the transport carries `Authorization: Bearer <token>` against `http://127.0.0.1:4317` loopback. The token is never written to the URL.

## Requirements

- Node.js `>= 22.13.0`
- Next.js `>= 12`, React `>= 18`

## Links

- Monorepo: <https://github.com/Seungwoo321/agent-devtools>
- App Router adapter: [`@agent-devtools/next`](https://www.npmjs.com/package/@agent-devtools/next)
- Core package: [`@agent-devtools/core`](https://www.npmjs.com/package/@agent-devtools/core)
- React adapter: [`@agent-devtools/react`](https://www.npmjs.com/package/@agent-devtools/react)
- Issue tracker: <https://github.com/Seungwoo321/agent-devtools/issues>

## License

[MIT](https://github.com/Seungwoo321/agent-devtools/blob/main/LICENSE) © Seungwoo Lee
