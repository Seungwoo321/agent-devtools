[English](./README.md) · [한국어]

# @agent-devtools/vite

> [agent-devtools](https://github.com/Seungwoo321/agent-devtools) 의 Vite 플러그인. 로컬 에이전트 서버를 자동 spawn 하고, dev HTML 에 위젯 부트스트랩을 주입하며, `vite build` 시에는 no-op 으로 동작합니다. Vite 5, 6, 7, 8 모두 지원.

[![npm](https://img.shields.io/npm/v/@agent-devtools/vite.svg)](https://www.npmjs.com/package/@agent-devtools/vite)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/Seungwoo321/agent-devtools/blob/main/LICENSE)

## 기능

- **`apply: 'serve'`** — `vite build` 단계에서는 플러그인이 등록되지 않습니다. production 번들에 위젯 코드가 0 바이트 들어가지 않습니다.
- **서버 자동 spawn** — `@agent-devtools/core` 의 로컬 에이전트 서버를 `127.0.0.1` 의 첫 번째 가용 포트 (`4317` 부터) 에 띄웁니다.
- **Dev HTML 주입** — `transformIndexHtml(order: 'pre')` 가 `window.__AGENT_DEVTOOLS_CONFIG__` (server URL + pairing token) 과 `mountAgentDevtools` 부트스트랩 모듈을 dev 페이지에 기록합니다.
- **In-memory pairing token** — 에이전트 서버가 메모리에서 발급하고, 페이지에는 JS global 로 주입되며, 디스크에 저장되지 않고 URL 에도 노출되지 않습니다.
- **프록시 패스스루** — Vite dev 서버가 `/__agent_devtools/*` 요청을 spawn 된 에이전트 서버로 프록시해 동일 출처에서 통신합니다.
- **Graceful shutdown** — Vite HTTP 서버의 `close` 이벤트가 발생하면 spawn 된 에이전트 프로세스도 함께 종료됩니다.
- **어댑터-무관** — 위젯 import 대상은 `importFrom` 옵션으로 변경할 수 있습니다 (기본값 `@agent-devtools/react`).

## 설치

```bash
pnpm add -D @agent-devtools/vite @agent-devtools/react @agent-devtools/core
```

Peer dependency: `vite >= 5` (Vite 5, 6, 7, 8 모두 검증됨 — 플러그인은 Vite 4 이후 안정적인 `apply`, `configureServer`, `transformIndexHtml({ order, handler })` 표면만 사용합니다).

## 사용법

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { agentDevtools } from '@agent-devtools/vite';

export default defineConfig({
  plugins: [react(), agentDevtools()],
});
```

`pnpm dev` 로 띄우면 Vite 가 서빙하는 모든 페이지의 우하단에 launcher 가 표시됩니다. `pnpm build` 시에는 플러그인이 빌드 그래프에서 빠져 출력물이 깨끗하게 유지됩니다:

```bash
grep -r "@agent-devtools" dist/ || echo "OK — no leak"
```

production no-leak 보장은 [`build-integration.test.ts`](https://github.com/Seungwoo321/agent-devtools/blob/main/packages/vite/src/build-integration.test.ts) 가 실제 production 빌드를 돌려 강제합니다.

### 환경변수 기반 롤아웃

```ts
agentDevtools({
  enabled: Boolean(import.meta.env.VITE_DEVTOOLS),
});
```

`enabled: false` 면 `configureServer` 와 `transformIndexHtml` 모두 no-op 이 됩니다. 플러그인을 config 에서 제거할 필요가 없습니다.

### 외부에서 서버를 관리

```ts
agentDevtools({
  spawnServer: false,
  // @agent-devtools/core 를 별도 프로세스로 직접 띄우고
  // 그 위치를 주입된 config 가 가리키도록 구성.
});
```

## 옵션

| 옵션             | 타입                                             | 기본값                 | 설명                                                                                                                                                                                                                                                               |
| ---------------- | ------------------------------------------------ | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `enabled`        | `boolean`                                        | `true`                 | `vite.config.ts` 에서 제거하지 않고 런타임에 끄기.                                                                                                                                                                                                                 |
| `framework`      | `'auto' \| 'react' \| 'vue' \| 'next' \| 'nuxt'` | `'auto'`               | mount 할 어댑터. `'auto'` 는 호스트 `package.json` 을 읽어 우선순위 (`nuxt` > `next` > `vue` > `react`) 로 결정하고, 매칭이 없으면 `react` 로 fallback.                                                                                                            |
| `importFrom`     | `string`                                         | `framework` 기반       | `mountAgentDevtools` 와 `createDefaultTransport` 를 export 하는 모듈. 명시되면 `framework` 기본값을 덮어씁니다.                                                                                                                                                    |
| `spawnServer`    | `boolean`                                        | `true`                 | 에이전트 서버를 외부에서 관리할 때 `false`.                                                                                                                                                                                                                        |
| `workspace`      | `string`                                         | Vite `config.root`     | 에이전트가 read/edit 가능한 workspace 루트. 상대 경로는 `config.root` 기준으로 해석.                                                                                                                                                                               |
| `port`           | `number`                                         | `4317` (auto-fallback) | spawn 할 에이전트 서버의 선호 포트. 점유 시 `port + 19` 까지 순차 fallback.                                                                                                                                                                                        |
| `shadowOpen`     | `boolean`                                        | `false`                | open shadow root 사용 (E2E 디버깅 전용). `AGENT_DEVTOOLS_OPEN_SHADOW=1` 환경 변수도 같은 효과.                                                                                                                                                                     |
| `defaultVisible` | `boolean`                                        | `true`                 | `false` 로 두면 첫 페이지 로드 시 floating 위젯이 숨겨진 상태로 시작. 개발자는 `Ctrl/Cmd + Shift + ;` 단축키로 토글해 다시 띄울 수 있습니다. 비-프론트엔드 운영자가 페이지에 접근하는 dev 환경에서 floating 버튼이 기본으로 노출되지 않게 하고 싶을 때 사용합니다. |

## 보안 기본값

- **`apply: 'serve'` 기반 dev-only** — production 빌드는 플러그인을 보지 못합니다. `apply: 'serve'` 와 `@agent-devtools/react` 의 런타임 production 가드 두 layer 가 위젯 코드를 production 번들에서 제거합니다.
- **루프백 바인딩** — 에이전트 서버는 `127.0.0.1` 에만 bind 됩니다.
- **Pairing token 격리** — 토큰은 에이전트 서버가 메모리에서 발급, JS global (`window.__AGENT_DEVTOOLS_CONFIG__.pairingToken`) 로만 주입되고 URL 이나 디스크에 기록되지 않습니다. 모든 요청은 `Authorization: Bearer …` 헤더로 토큰을 전달해야 합니다.

## 요구 사항

- Node.js `>= 22.13.0`
- pnpm `>= 11`
- Vite `>= 5`

## 관련 링크

- 모노레포: <https://github.com/Seungwoo321/agent-devtools>
- Core 패키지: [`@agent-devtools/core`](https://www.npmjs.com/package/@agent-devtools/core)
- React 어댑터: [`@agent-devtools/react`](https://www.npmjs.com/package/@agent-devtools/react)
- 사용자 가이드: <https://agent-devtools-docs.vercel.app/>
- 이슈 트래커: <https://github.com/Seungwoo321/agent-devtools/issues>

## 라이선스

[MIT](https://github.com/Seungwoo321/agent-devtools/blob/main/LICENSE) © Seungwoo Lee
