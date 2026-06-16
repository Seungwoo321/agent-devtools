[English](./README.md) · [한국어]

# @agent-devtools/next-pages

> [agent-devtools](https://github.com/Seungwoo321/agent-devtools) 의 Next.js Pages Router 어댑터. `@agent-devtools/react` 의 React fiber walker 와 `@agent-devtools/widget-core` 의 framework-agnostic widget shell 을 그대로 재사용하고, 레거시 `pages/_app.tsx` 호스트를 위한 dev 전용 부트스트랩 훅을 제공합니다.

[![npm](https://img.shields.io/npm/v/@agent-devtools/next-pages.svg)](https://www.npmjs.com/package/@agent-devtools/next-pages)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/Seungwoo321/agent-devtools/blob/main/LICENSE)

## 이 어댑터가 제공하는 것

- **Walker 재사용** — Pages Router 는 App Router 와 동일한 React fiber tree 를 통해 클라이언트 컴포넌트를 렌더링하므로, `@agent-devtools/react` 에서 import 한 React fiber walker (`__reactFiber$<nonce>`, `walkComponentAncestors`, React ≤18 용 `_debugSource` + React 19 용 `_debugStack`) 가 재구현 없이 동작합니다.
- **Pages Router 경계** — `bootstrapAgentDevtools` 가 `pages/_app.tsx` 안에서 실행됩니다. dev 서버가 부트스트랩이 읽는 env 플래그를 내보내고, production 빌드에서는 env 플래그가 제거되며 webpack alias 가 widget chain 을 제거합니다.
- **Route 파일 첨부** — mount 가 `resolveNextPagesRouteFile` 을 주입합니다. 이 함수는 `window.next.router.pathname` (Next 의 동적 세그먼트 형태 `/blog/[slug]`) 을 읽어 `pages${pathname}` 를 `pageContext.route.routeFile` 로 내보냅니다. 확장자는 의도적으로 생략됩니다 — Pages Router 는 같은 라우트에 `.tsx`/`.jsx`/`.ts`/`.js`/`.mdx`/`.md` 를 모두 허용하므로, 에이전트는 디렉터리 매칭을 확보한 뒤 실제 파일을 glob 으로 찾을 수 있습니다.
- **Production webpack alias** — `withAgentDevtools` 가 `next.config` 를 다시 써서 클라이언트 측 webpack 이 `@agent-devtools/{react,core,harness-core,widget-core}` 를 `false` 로 resolve 하게 합니다. 호스트가 실수로 widget 을 static import 해도 production 번들에서는 해당 모듈들이 zero byte 가 됩니다.
- **React 18 + 19** — fiber `_debugSource` 는 React 18 을 커버하고 `_debugStack` 는 React 19 를 커버합니다. walker 는 존재하는 쪽을 사용합니다.
- **Widget UI** — `@agent-devtools/widget-core` shell, 동일한 shadow root 계약.

peer 범위: `next >= 12`, `react >= 18`, `react-dom >= 18` (구버전 major 에 머문 Pages Router 호스트를 위해 의도적으로 넓게 설정).

## 기능

- **`withAgentDevtools`** — `next.config.{js,mjs,ts}` 를 래핑해 dev 서버가 페어링 토큰과 base URL 을 환경 변수로 전달하고, production 번들에서 widget chain 을 제거하는 webpack alias 를 설치합니다 (dev-only guard Layer 1).
- **`bootstrapAgentDevtools`** — 호스트 프로젝트가 `pages/_app.tsx` 에서 호출하는 클라이언트 전용 부트스트랩. `NODE_ENV === 'production'` (Layer 2) 또는 env 플래그 부재 시 마운트를 거부합니다.
- **`mountAgentDevtoolsNextPages`** — 직접 클라이언트 경계를 관리하는 사용자가 framework-uniform 을 유지하도록 Layer 2 런타임 가드를 갖춘 `mountAgentDevtools` 얇은 래퍼.
- **넓은 버전 범위** — Pages Router 는 Next 12 부터 안정적이므로 이 어댑터는 관대한 peer 범위 (`next >= 12`, `react >= 18`) 를 설정합니다.

## 설치

```bash
pnpm add -D @agent-devtools/next-pages @agent-devtools/core
```

Peer dependencies: `next >= 12.0.0`, `react >= 18.0.0`, `react-dom >= 18.0.0`.

## 사용법

### 1. `next.config.{js,mjs,ts}` 래핑

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

### 2. `pages/_app.tsx` 에서 부트스트랩

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

| 옵션           | 타입      | 설명                                                                                               |
| -------------- | --------- | -------------------------------------------------------------------------------------------------- |
| `enabled`      | `boolean` | 래퍼를 제거하지 않고 주입만 비활성화. 기본값 `true`.                                               |
| `baseUrl`      | `string`  | 에이전트 서버의 base URL. 부트스트랩 호출 시점에 같은 값을 직접 넘기는 옵션이 있다면 그 쪽이 우선. |
| `pairingToken` | `string`  | 페어링 토큰. `next.config` 의 `env` 를 통해 클라이언트 번들로 전달됩니다.                          |

래퍼는 다음 env 항목을 설정합니다 (production 빌드에서는 생략):

- `AGENT_DEVTOOLS_NEXT_PAGES_ENABLED = 'true'`
- `AGENT_DEVTOOLS_NEXT_PAGES_BASE_URL` — `options.baseUrl` 이 주어진 경우.
- `AGENT_DEVTOOLS_NEXT_PAGES_PAIRING_TOKEN` — `options.pairingToken` 이 주어진 경우.

production 빌드에서는 래퍼가 `@agent-devtools/{react,widget-core,core,harness-core}` 를 `false` 로 매핑하는 webpack alias 도 설치하므로, widget chain 이 production 그래프에 진입하지 않습니다.

### `bootstrapAgentDevtools(options?)`

클라이언트 전용 mount. `withAgentDevtools` 가 주입한 환경 변수를 읽고, 옵션이 주어지면 옵션이 우선합니다:

| 옵션           | 타입     |
| -------------- | -------- |
| `baseUrl`      | `string` |
| `pairingToken` | `string` |

멱등 (idempotent): 같은 클라이언트 세션 내 반복 호출은 무시됩니다.

### `mountAgentDevtoolsNextPages(options?)`

`@agent-devtools/react` 의 `mountAgentDevtools` 와 동일한 옵션. `NODE_ENV === 'production'` 에서 호출되면 throw 합니다. 부트스트랩 헬퍼 대신 직접 클라이언트 경계를 관리할 때 사용합니다.

## 보안 기본값

- **Layer 1 빌드타임 가드** — `withAgentDevtools` 가 widget chain 을 빈 모듈로 매핑하는 production webpack alias 를 설치합니다.
- **Layer 2 런타임 가드** — `NODE_ENV === 'production'` 에서 `mountAgentDevtoolsNextPages` 는 throw 하고 `bootstrapAgentDevtools` 는 early-return 합니다.
- **Closed Shadow DOM** — 호스트 CSS, 호스트 이벤트, 호스트 React 트리가 widget 과 분리됩니다.
- **페어링 토큰 bearer 인증** — transport 는 `http://127.0.0.1:4317` 루프백에 `Authorization: Bearer <token>` 헤더를 실어 보냅니다. 토큰은 URL 에 박히지 않습니다.

## 요구 사항

- Node.js `>= 22.13.0`
- Next.js `>= 12`, React `>= 18`

## 링크

- 모노레포: <https://github.com/Seungwoo321/agent-devtools>
- App Router 어댑터: [`@agent-devtools/next`](https://www.npmjs.com/package/@agent-devtools/next)
- Core 패키지: [`@agent-devtools/core`](https://www.npmjs.com/package/@agent-devtools/core)
- React 어댑터: [`@agent-devtools/react`](https://www.npmjs.com/package/@agent-devtools/react)
- 이슈 트래커: <https://github.com/Seungwoo321/agent-devtools/issues>

## 라이선스

[MIT](https://github.com/Seungwoo321/agent-devtools/blob/main/LICENSE) © Seungwoo Lee
