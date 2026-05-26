[English] · [한국어](./README.ko.md)

# @agent-devtools/next

> Next.js 15 adapter for [agent-devtools](https://github.com/Seungwoo321/agent-devtools). Reuses the React fiber walker from `@agent-devtools/react` and the framework-agnostic widget shell from `@agent-devtools/widget-core`, and adds dev-only bootstrap hooks for the App Router and Pages Router.

[![npm](https://img.shields.io/npm/v/@agent-devtools/next.svg)](https://www.npmjs.com/package/@agent-devtools/next)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/Seungwoo321/agent-devtools/blob/main/LICENSE)

## What this adapter provides

- **Walker reuse** — DOM → fiber → source goes through `@agent-devtools/react`. The walker (`__reactFiber$<nonce>`, `walkComponentAncestors`, React 19 `_debugStack` parse) is imported directly, not duplicated.
- **App Router boundary** — `bootstrapAgentDevtools` runs inside a `"use client"` component imported from `app/layout.tsx`. The dev server emits an env flag the bootstrap reads; production builds drop the env flag entirely.
- **Pages Router boundary** — same `bootstrapAgentDevtools` invoked from `_app.tsx`. The Pages Router never has the App Router's RSC payload but the client fiber tree is identical.
- **Webpack alias on production** — `withAgentDevtools` rewrites `next.config` so the production client build aliases the widget chain (`@agent-devtools/{react,core,harness-core,widget-core}`) to `false`. Any accidental static import becomes a zero-byte module after webpack resolves the alias.
- **Server components** — RSC components live on the server and never enter the client fiber tree. The widget shows the nearest client-component ancestor in their place rather than guessing a server identity.
- **Widget UI** — `@agent-devtools/widget-core` shell, the same shadow root the React adapter uses.

Peer range: `next >= 15`, `react >= 19`, `react-dom >= 19`.

## Features

- **`withAgentDevtools`** — wraps `next.config.{js,mjs,ts}` so the dev server propagates the pairing token + base URL via environment variables. The wrapper is a no-op in production builds (Layer 1 of the dev-only guard).
- **`bootstrapAgentDevtools`** — client-only initializer that the host project imports from a `"use client"` boundary (App Router) or `_app.tsx` (Pages Router). Refuses to mount when `NODE_ENV === 'production'` (Layer 2) or when the env flag is absent.
- **`mountAgentDevtoolsNext`** — a thin re-export of `mountAgentDevtools` so callers who already manage their own client boundary stay framework-uniform.
- **React 19 + RSC safe** — Next renders client components with the same React fiber tree the React adapter walks, so picker / source-resolution / component breadcrumb all work without re-implementation.

## Install

```bash
pnpm add -D @agent-devtools/next @agent-devtools/core
```

Peer dependencies: `next >= 15.0.0`, `react >= 19.0.0`, `react-dom >= 19.0.0`.

## Usage

### App Router (Next 15)

1. Wrap your `next.config.{js,mjs,ts}`:

   ```ts
   // next.config.ts
   import { withAgentDevtools } from '@agent-devtools/next';

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

2. Add a client component that bootstraps the widget on the first client render:

   ```tsx
   // app/agent-devtools.tsx
   'use client';
   import { useEffect } from 'react';
   import { bootstrapAgentDevtools } from '@agent-devtools/next/bootstrap';

   export function AgentDevtools() {
     useEffect(() => {
       bootstrapAgentDevtools();
     }, []);
     return null;
   }
   ```

3. Import the boundary from your root layout:

   ```tsx
   // app/layout.tsx
   import { AgentDevtools } from './agent-devtools';

   export default function RootLayout({
     children,
   }: {
     children: React.ReactNode;
   }) {
     return (
       <html lang="en">
         <body>
           {children}
           <AgentDevtools />
         </body>
       </html>
     );
   }
   ```

### Pages Router

```tsx
// pages/_app.tsx
import { useEffect } from 'react';
import { bootstrapAgentDevtools } from '@agent-devtools/next/bootstrap';

export default function App({ Component, pageProps }) {
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

The wrapper sets:

- `AGENT_DEVTOOLS_NEXT_ENABLED = 'true'` — toggled off automatically in production.
- `AGENT_DEVTOOLS_NEXT_BASE_URL` — when `options.baseUrl` is provided.
- `AGENT_DEVTOOLS_NEXT_PAIRING_TOKEN` — when `options.pairingToken` is provided.

### `bootstrapAgentDevtools(options?)`

Client-only mount. Reads the env variables propagated by `withAgentDevtools`. Options override them when provided:

| Option         | Type     |
| -------------- | -------- |
| `baseUrl`      | `string` |
| `pairingToken` | `string` |

Idempotent: repeat calls within the same client session are ignored.

### `mountAgentDevtoolsNext(options?)`

Same options as `mountAgentDevtools` from `@agent-devtools/react`. Use this when you want to manage the client boundary yourself instead of going through the bootstrap helper.

## Security defaults

- **Layer 1 build-time guard** — `withAgentDevtools` returns the original config unchanged when `NODE_ENV === 'production'`. The widget never reaches the production bundle through the wrapper.
- **Layer 2 runtime guard** — `bootstrapAgentDevtools` refuses to mount when `NODE_ENV === 'production'`. The React adapter additionally throws if its mount is reached in a production build.
- **Closed Shadow DOM** — host CSS, host events, and the host React tree stay outside the widget.
- **Pairing-token bearer auth** — the transport carries `Authorization: Bearer <token>` against `http://127.0.0.1:4317` loopback. The token is never written to the URL.

## Requirements

- Node.js `>= 22.13.0`
- Next.js `>= 15`, React `>= 19`

## Links

- Monorepo: <https://github.com/Seungwoo321/agent-devtools>
- Core package: [`@agent-devtools/core`](https://www.npmjs.com/package/@agent-devtools/core)
- React adapter: [`@agent-devtools/react`](https://www.npmjs.com/package/@agent-devtools/react)
- Vite plugin: [`@agent-devtools/vite`](https://www.npmjs.com/package/@agent-devtools/vite)
- User guide: <https://agent-devtools-docs.vercel.app/>
- Issue tracker: <https://github.com/Seungwoo321/agent-devtools/issues>

## License

[MIT](https://github.com/Seungwoo321/agent-devtools/blob/main/LICENSE) © Seungwoo Lee
