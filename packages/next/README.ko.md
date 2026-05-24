[English](./README.md) · [한국어]

# @agent-devtools/next

> [agent-devtools](https://github.com/Seungwoo321/agent-devtools) 의 Next.js 15 어댑터. `@agent-devtools/react` 의 React fiber walker 와 widget shell 을 그대로 재사용하고, App Router 와 Pages Router 양쪽을 위한 dev 전용 부트스트랩 훅을 제공합니다.

[![npm](https://img.shields.io/npm/v/@agent-devtools/next.svg)](https://www.npmjs.com/package/@agent-devtools/next)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/Seungwoo321/agent-devtools/blob/main/LICENSE)

## 특징

- **`withAgentDevtools`** — `next.config.{js,mjs,ts}` 를 래핑해 dev 서버가 페어링 토큰과 base URL 을 환경 변수로 전달합니다. production 빌드에서는 no-op (dev-only guard Layer 1).
- **`bootstrapAgentDevtools`** — 호스트 프로젝트가 `"use client"` 경계 (App Router) 또는 `_app.tsx` (Pages Router) 에서 import 하는 클라이언트 전용 부트스트랩. `NODE_ENV === 'production'` (Layer 2) 또는 env 플래그 부재 시 마운트를 거부합니다.
- **`mountAgentDevtoolsNext`** — 직접 클라이언트 경계를 관리하는 사용자를 위한 `mountAgentDevtools` 얇은 re-export.
- **React 19 + RSC 안전** — Next 의 클라이언트 컴포넌트는 React 어댑터가 walk 하는 동일한 fiber tree 를 사용하므로 picker / source 해상 / 컴포넌트 breadcrumb 가 재구현 없이 동작합니다.

## 설치

```bash
pnpm add -D @agent-devtools/next @agent-devtools/core
```

peerDependency: `next >= 15.0.0`, `react >= 19.0.0`, `react-dom >= 19.0.0`.

## 사용법

### App Router (Next 15)

1. `next.config.{js,mjs,ts}` 를 래핑합니다:

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

2. 클라이언트 컴포넌트를 추가해 첫 클라이언트 렌더에서 widget 을 부트스트랩합니다:

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

3. 루트 레이아웃에서 경계를 import 합니다:

   ```tsx
   // app/layout.tsx
   import { AgentDevtools } from './agent-devtools';

   export default function RootLayout({
     children,
   }: {
     children: React.ReactNode;
   }) {
     return (
       <html lang="ko">
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

| 옵션           | 타입      | 설명                                                                                               |
| -------------- | --------- | -------------------------------------------------------------------------------------------------- |
| `enabled`      | `boolean` | 래퍼를 제거하지 않고 주입만 비활성화. 기본값 `true`.                                               |
| `baseUrl`      | `string`  | 에이전트 서버의 base URL. 부트스트랩 호출 시점에 같은 값을 직접 넘기는 옵션이 있다면 그 쪽이 우선. |
| `pairingToken` | `string`  | 페어링 토큰. `next.config` 의 `env` 를 통해 클라이언트 번들로 전달됩니다.                          |

래퍼는 다음을 설정합니다:

- `AGENT_DEVTOOLS_NEXT_ENABLED = 'true'` — production 빌드에서는 자동으로 비활성.
- `AGENT_DEVTOOLS_NEXT_BASE_URL` — `options.baseUrl` 이 주어진 경우.
- `AGENT_DEVTOOLS_NEXT_PAIRING_TOKEN` — `options.pairingToken` 이 주어진 경우.

### `bootstrapAgentDevtools(options?)`

클라이언트 전용 mount. `withAgentDevtools` 가 주입한 환경 변수를 읽고, 옵션이 주어지면 옵션이 우선합니다:

| 옵션           | 타입     |
| -------------- | -------- |
| `baseUrl`      | `string` |
| `pairingToken` | `string` |

멱등 (idempotent): 같은 클라이언트 세션 내 반복 호출은 무시됩니다.

### `mountAgentDevtoolsNext(options?)`

`@agent-devtools/react` 의 `mountAgentDevtools` 와 동일한 옵션. 부트스트랩 헬퍼 대신 직접 클라이언트 경계를 관리할 때 사용합니다.

## 보안 디폴트

- **Layer 1 빌드타임 가드** — `withAgentDevtools` 는 `NODE_ENV === 'production'` 일 때 원본 config 를 그대로 반환합니다. widget 코드 경로가 production 번들에 진입하지 않습니다.
- **Layer 2 런타임 가드** — `bootstrapAgentDevtools` 는 `NODE_ENV === 'production'` 에서 마운트를 거부합니다. React 어댑터의 mount 도 production 번들에서 도달 시 throw 합니다.
- **Closed Shadow DOM** — 호스트 CSS, 호스트 이벤트, 호스트 React 트리가 widget 과 분리됩니다.
- **페어링 토큰 bearer 인증** — transport 는 `http://127.0.0.1:4317` 루프백에 `Authorization: Bearer <token>` 헤더를 실어 보냅니다. 토큰은 URL 에 박히지 않습니다.

## 요구 사항

- Node.js `>= 24.0.0`
- Next.js `>= 15`, React `>= 19`

## 링크

- 모노레포: <https://github.com/Seungwoo321/agent-devtools>
- Core 패키지: [`@agent-devtools/core`](https://www.npmjs.com/package/@agent-devtools/core)
- React 어댑터: [`@agent-devtools/react`](https://www.npmjs.com/package/@agent-devtools/react)
- Vite 플러그인: [`@agent-devtools/vite`](https://www.npmjs.com/package/@agent-devtools/vite)
- 사용자 가이드: <https://agent-devtools-docs.vercel.app/>
- 이슈 트래커: <https://github.com/Seungwoo321/agent-devtools/issues>

## 라이선스

[MIT](https://github.com/Seungwoo321/agent-devtools/blob/main/LICENSE) © Seungwoo Lee
