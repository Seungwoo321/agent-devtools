[English](./README.md) · [한국어]

# @agent-devtools/react

> [agent-devtools](https://github.com/Seungwoo321/agent-devtools) 의 React 19 어댑터. 위젯을 closed Shadow DOM 에 mount 하고, fiber 트리를 따라가 picked 컴포넌트를 식별하며, 로컬 에이전트 서버와 통신할 SSE 트랜스포트를 제공합니다.

[![npm](https://img.shields.io/npm/v/@agent-devtools/react.svg)](https://www.npmjs.com/package/@agent-devtools/react)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/Seungwoo321/agent-devtools/blob/main/LICENSE)

## 기능

- **`mountAgentDevtools`** — launcher, composer, settings 위젯을 closed Shadow DOM 안에 mount 합니다. 호스트 앱의 스타일·이벤트·React 인스턴스에서 격리됩니다.
- **Production 가드** — `NODE_ENV === 'production'` 에서 `mountAgentDevtools` 가 throw 합니다. 명시적 staging/preview 배포에만 `{ force: true }` 로 우회 가능합니다.
- **DOM picker + fiber walker** — **Pick** 모드에서 hover 한 요소의 React 컴포넌트 이름, 일부 props, 안정적인 selector 를 추출합니다. React 19 dev 빌드에서는 source 파일과 라인 번호까지 추출합니다.
- **`createDefaultTransport`** — `/v1/agent/stream` 에 POST 하는 SSE 트랜스포트. `Authorization: Bearer <pairing-token>` 헤더를 전송하고, `sessionStorage` 에 ACP 세션 ID 를 탭 단위로 영속화합니다.
- **Auto context** — picked descriptor, 현재 route, 최근 콘솔 에러를 모든 프롬프트에 자동 첨부합니다.
- **터미널 핸드오프** — `requestHandoff` 가 연결되면 composer 가 인메모리 대화와 page context 를 `claude --append-system-prompt-file …` 명령으로 dump 해 터미널 세션으로 이어 받을 수 있습니다.

## 설치

```bash
pnpm add -D @agent-devtools/react @agent-devtools/core
```

Peer dependencies: `react >= 19.0.0`, `react-dom >= 19.0.0`.

## 사용법

대부분의 프로젝트는 Vite 플러그인을 통해 사용하며 `mountAgentDevtools` 를 직접 호출하지 않습니다:

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { agentDevtools } from '@agent-devtools/vite';

export default defineConfig({
  plugins: [react(), agentDevtools()],
});
```

Vite 플러그인이 에이전트 서버를 spawn 하고, pairing token 을 발급하고, dev 시점에 동일한 부트스트랩을 주입합니다. [`@agent-devtools/vite`](https://www.npmjs.com/package/@agent-devtools/vite) 참고.

### Vite 플러그인 없이 수동 mount

```tsx
// dynamic import 로 production 번들에서 위젯이 자체 제거됩니다.
if (import.meta.env.DEV) {
  const { mountAgentDevtools, createDefaultTransport } =
    await import('@agent-devtools/react');

  const handle = mountAgentDevtools({
    transport: createDefaultTransport({
      baseUrl: 'http://127.0.0.1:4317',
      pairingToken: '<시작 시 프로비저닝됨>',
    }),
  });

  // 선택: 앱 unmount 시 명시적으로 정리.
  // handle.destroy();
}
```

`mountAgentDevtools` 는 `destroy()` 등 라이프사이클 헬퍼를 반환하는 handle 을 돌려줍니다. 같은 document 에 두 번 호출해도 안전합니다 — 첫 번째 위젯이 살아 있는 동안 두 번째 호출은 no-op 입니다.

## API

### `mountAgentDevtools(options)`

| 옵션             | 타입                                     | 기본값                | 설명                                                                                          |
| ---------------- | ---------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------- |
| `document`       | `Document`                               | `globalThis.document` | 위젯이 mount 될 document.                                                                     |
| `rootContainer`  | `Element \| null`                        | `null`                | React 가 `createRoot` 한 DOM 컨테이너. page context 수집을 위한 root fiber 탐색에 사용.       |
| `transport`      | `AgentDevtoolsTransport`                 | (없음)                | 트랜스포트 어댑터. 없으면 composer 가 UI 전용 모드로 동작.                                    |
| `force`          | `boolean`                                | `false`               | production 가드 우회. 명시적 staging/preview 용도.                                            |
| `shadowOpen`     | `boolean`                                | `false`               | 위젯 호스트에 open shadow root 사용 (E2E 디버깅 전용).                                        |
| `settingsStore`  | `SettingsStore`                          | (내부 생성)           | 설정 패널과 트랜스포트가 공유하는 reactive store.                                             |
| `getServerInfo`  | `() => Promise<AgentServerInfo \| null>` | (없음)                | `/v1/agent/info` 비동기 fetcher. workspace root hydration 과 미등록 provider 라디오 비활성화. |
| `requestHandoff` | `HandoffRequester`                       | (없음)                | `/v1/agent/handoff` POST. "Continue in terminal" 버튼이 `claude` 명령을 반환하도록 합니다.    |

### `createDefaultTransport(options)`

| 옵션                        | 타입                                  | 기본값               | 설명                                                                                                              |
| --------------------------- | ------------------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `baseUrl`                   | `string`                              | (필수)               | 에이전트 서버 origin. 예: `http://127.0.0.1:4317`.                                                                |
| `pairingToken`              | `string`                              | (필수)               | 에이전트 서버가 시작 시 발급한 Bearer 토큰.                                                                       |
| `fetch`                     | `typeof fetch`                        | `globalThis.fetch`   | 커스텀 fetch 구현 (테스트, SSR shim 등).                                                                          |
| `getSettings`               | `() => SettingsSnapshot \| undefined` | (없음)               | 설정 store 에서 `provider`, `model`, `permissionMode` 를 읽는 함수.                                               |
| `sessionIdStorage`          | `Storage \| 'memory'`                 | `sessionStorage`     | ACP 세션 ID 가 저장될 스토리지.                                                                                   |
| `sessionIdStorageKey`       | `string`                              | `agent-devtools:sid` | ACP 세션 ID 의 스토리지 키.                                                                                       |
| `generateSessionId`         | `() => string`                        | `crypto.randomUUID`  | 세션 ID 생성 함수.                                                                                                |
| `streamSilentMs`            | `number`                              | `60_000`             | 리더가 이 시간 이상 침묵하면 스트림을 abort 하고 `StreamSilentError` 로 reject. `0` 이면 비활성화.                |
| `preResponseRetries`        | `number`                              | `1`                  | 첫 fetch 가 Response 도착 전 네트워크 에러로 reject 될 때 추가 시도 횟수. AbortError 와 HTTP 에러는 재시도 안 함. |
| `preResponseRetryBackoffMs` | `number`                              | `300`                | 실패한 첫 fetch 와 재시도 사이 대기 시간.                                                                         |

트랜스포트는 브라우저 탭마다 하나의 ACP 세션을 유지하고, 새로고침 후에도 이어집니다. `sessionStorage` 가 탭 스코프라 다른 탭에서는 새 세션 ID 를 발급합니다.

에이전트 서버는 모델이 침묵 중일 때 20초마다 `: keepalive` SSE 코멘트를 보냅니다. 중간의 프록시·터널이 idle 로 판단해 연결을 끊지 않게 하기 위함입니다. 위 watchdog 는 코멘트 포함 모든 수신 chunk 에서 reset 되므로 긴 thinking 은 살아남고, 진짜로 죽은 스트림만 "thinking…" 무한 대기 대신 `StreamSilentError` 로 surface 됩니다.

### `StreamSilentError`

리더가 `streamSilentMs` 보다 오래 chunk 를 받지 못했을 때 트랜스포트가 throw 하는 에러. `error.name === 'StreamSilentError'`. UI 에서는 "스트림이 끊겼습니다. 다시 시도해 주세요" 같은 메시지로 surface 하세요.

## 보안 기본값

- **Production 거부** — `mountAgentDevtools` 가 `process.env.NODE_ENV === 'production'` 에서 throw 합니다. 위젯이 실수로 production 번들에 포함돼도 활성화되지 않습니다.
- **Closed Shadow DOM** — 호스트 CSS, 호스트 이벤트, 호스트 React 인스턴스가 위젯 트리 밖에 위치합니다.
- **Pairing token 인증** — 모든 요청에 `Authorization: Bearer <token>` 이 필요하며, 토큰은 URL 에 기록되지 않습니다.

## 요구 사항

- Node.js `>= 22.13.0`
- React `>= 19` dev 빌드 (picker 가 React 19 dev runtime 의 JSX source 정보를 읽습니다).

## 관련 링크

- 모노레포: <https://github.com/Seungwoo321/agent-devtools>
- Core 패키지: [`@agent-devtools/core`](https://www.npmjs.com/package/@agent-devtools/core)
- Vite 플러그인: [`@agent-devtools/vite`](https://www.npmjs.com/package/@agent-devtools/vite)
- 사용자 가이드: <https://agent-devtools-docs.vercel.app/>
- 이슈 트래커: <https://github.com/Seungwoo321/agent-devtools/issues>

## 라이선스

[MIT](https://github.com/Seungwoo321/agent-devtools/blob/main/LICENSE) © Seungwoo Lee
