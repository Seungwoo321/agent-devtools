[English](./README.md) · [한국어]

# @agent-devtools/widget-core

> [agent-devtools](https://github.com/Seungwoo321/agent-devtools) 의 framework-agnostic 위젯 shell. 위젯을 closed Shadow DOM 에 mount 하고, launcher / composer / stream / settings UI 를 순수 DOM 으로 렌더링하며, 모든 framework 어댑터가 공유하는 기본 SSE 트랜스포트를 제공합니다.

[![npm](https://img.shields.io/npm/v/@agent-devtools/widget-core.svg)](https://www.npmjs.com/package/@agent-devtools/widget-core)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/Seungwoo321/agent-devtools/blob/main/LICENSE)

## 이 패키지가 제공하는 것

- **DOM / Web API 만 사용** — React, Vue, Angular, Svelte 등 framework 런타임을 import 하지 않습니다. 모든 framework 어댑터 (`@agent-devtools/react`, `@agent-devtools/vue`, ...) 가 이 shell 을 구동하고 framework 별 picker walker 를 그 위에 layer 합니다.
- **Closed Shadow DOM mount** — `createShadowWidgetRoot` 가 closed shadow root 를 가진 host element 를 부착해서 호스트의 스타일·이벤트·framework 인스턴스가 위젯 트리 밖에 머무릅니다. E2E 디버깅이 필요할 때만 `shadowOpen: true` 로 open shadow 를 opt-in 합니다.
- **Composer, stream, settings, launcher** — floating launcher, 마크다운 렌더링 (`marked` + `dompurify`) 이 포함된 채팅 composer, 스트리밍 메시지 렌더러, 설정 패널이 모두 여기서 조립됩니다.
- **Picker overlay** — DOM picker overlay (hover outline, click capture, Escape 취소) 가 이 패키지에 들어 있고, framework 어댑터가 컴포넌트 정체성을 환원하는 `describePicked(element)` walker 를 주입합니다.
- **기본 SSE 트랜스포트** — `createDefaultTransport` 가 `/v1/agent/stream` 에 POST 하고, `Authorization: Bearer <pairing-token>` 헤더를 전송하며, `sessionStorage` 에 ACP 세션 ID 를 탭 단위로 영속화하고, 죽은 스트림을 `StreamSilentError` 로 surface 합니다.

## 기능

- **`mountAgentDevtools`** — launcher, composer, stream renderer, settings panel, picker 를 하나의 handle 로 조립합니다. 어댑터는 이 진입점을 re-export 하고 framework 별 walker 를 주입합니다.
- **Production 가드** — `NODE_ENV === 'production'` 에서 `mountAgentDevtools` 가 throw 합니다. 실수로 production 번들에 위젯이 포함돼도 활성화되지 않습니다. 명시적 staging/preview 에만 `{ force: true }` 로 우회 가능합니다.
- **Closed Shadow DOM** — `createShadowWidgetRoot` 가 호스트 CSS, 호스트 이벤트, 호스트 framework 인스턴스를 위젯 트리 밖에 둡니다.
- **Auto context** — picked descriptor, 현재 route, 최근 console / network / unhandled 에러를 모든 프롬프트에 자동 첨부합니다 (`buildPageContext`, `createErrorObserver`).
- **터미널 핸드오프** — `requestHandoff` 가 연결되면 composer 가 인메모리 대화와 page context 를 `claude --append-system-prompt-file …` 명령으로 dump 해 터미널 세션으로 이어 받을 수 있습니다 (`createHandoffModal`).

## 설치

```bash
pnpm add @agent-devtools/widget-core @agent-devtools/core
```

Peer dependency 없음. 런타임 의존성: `@agent-devtools/core`, `dompurify`, `marked`.

## 사용법

대부분의 프로젝트는 `@agent-devtools/widget-core` 를 **직접 설치하지 않습니다** — framework 어댑터 (`@agent-devtools/react`, `@agent-devtools/vue`, ...) 가 의존성으로 끌어와 framework 별 walker 를 주입한 뒤 `mountAgentDevtools` 를 re-export 합니다. 커스텀 framework 호스트를 만들거나 새 어댑터를 작성할 때만 `widget-core` 를 직접 사용합니다.

```ts
// dynamic import 로 production 번들에서 위젯이 자체 제거됩니다.
if (import.meta.env.DEV) {
  const { mountAgentDevtools, createDefaultTransport } =
    await import('@agent-devtools/widget-core');

  const handle = mountAgentDevtools({
    transport: createDefaultTransport({
      baseUrl: 'http://127.0.0.1:4317',
      pairingToken: '<시작 시 프로비저닝됨>',
    }),
    // 선택: framework-aware walker 주입. 없으면 DOM-only fallback 이
    // outerHTML / selector / tagName 만 채우고 componentName /
    // componentChain / source 는 비웁니다.
    // describePicked: myFrameworkWalker,
  });

  // 선택: 앱 unmount 시 명시적으로 정리.
  // handle.destroy();
}
```

`mountAgentDevtools` 는 widget host, composer, stream renderer, settings panel, settings store, handoff modal, message store, error observer, picker, 그리고 `destroy()` 를 노출하는 `AgentDevtoolsHandle` 을 반환합니다.

## API

### `mountAgentDevtools(options)`

| 옵션                | 타입                                                                      | 기본값                | 설명                                                                                                                                                                                                     |
| ------------------- | ------------------------------------------------------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `document`          | `Document`                                                                | `globalThis.document` | 위젯이 mount 될 document.                                                                                                                                                                                |
| `rootContainer`     | `Element \| null`                                                         | `null`                | 호스트 framework 가 렌더링한 DOM 컨테이너. 어댑터의 page-context 수집에 사용.                                                                                                                            |
| `transport`         | `AgentDevtoolsTransport`                                                  | (없음)                | 트랜스포트 어댑터. 없으면 composer 가 UI 전용 모드로 동작.                                                                                                                                               |
| `force`             | `boolean`                                                                 | `false`               | production 가드 우회. 명시적 staging/preview 용도.                                                                                                                                                       |
| `shadowOpen`        | `boolean`                                                                 | `false`               | 위젯 호스트에 open shadow root 사용 (E2E 디버깅 전용).                                                                                                                                                   |
| `settingsStore`     | `SettingsStore`                                                           | (내부 생성)           | 설정 패널과 트랜스포트가 공유하는 reactive store.                                                                                                                                                        |
| `getServerInfo`     | `() => Promise<AgentServerInfo \| null>`                                  | (없음)                | `/v1/agent/info` 비동기 fetcher. workspace root hydration 과 미등록 provider 라디오 비활성화.                                                                                                            |
| `requestHandoff`    | `HandoffRequester`                                                        | (없음)                | `/v1/agent/handoff` POST. "Continue in terminal" 버튼이 `claude` 명령을 반환하도록 합니다.                                                                                                               |
| `describePicked`    | `(element: Element) => PickedEvidence`                                    | DOM-only fallback     | framework-aware element → 컴포넌트 resolver. 어댑터가 자체 walker 를 주입합니다. 없으면 `componentName` / `componentChain` / `source` / `propsSnapshot` 이 비어 있는 채로 pick 자체는 그대로 진행됩니다. |
| `collectPageFiles`  | `(rootContainer: Element \| null) => readonly PageFileEntry[]`            | (없음)                | page-context 페이로드용 framework-aware 소스파일 수집기.                                                                                                                                                 |
| `resolveRouteFile`  | `(pathname: string) => string \| undefined`                               | (없음)                | `pathname` 을 라우트 정의 소스파일 (예: `pages/blog/[slug].tsx`) 로 매핑하는 framework-aware 함수.                                                                                                       |
| `enrichPageContext` | `(pageContext: PageContext, signal: AbortSignal) => Promise<PageContext>` | (없음)                | 비동기 page-context enricher. Vite 플러그인이 dev 서버 모듈 그래프 imports 를 `pageContext.picked.relatedImports` 에 머지하는 데 사용.                                                                   |

### `createDefaultTransport(options)`

| 옵션                           | 타입                                  | 기본값               | 설명                                                                                                                                                                                                                    |
| ------------------------------ | ------------------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `baseUrl`                      | `string`                              | (필수)               | 에이전트 서버 origin. 예: `http://127.0.0.1:4317`.                                                                                                                                                                      |
| `pairingToken`                 | `string`                              | (필수)               | 에이전트 서버가 시작 시 발급한 Bearer 토큰.                                                                                                                                                                             |
| `fetch`                        | `typeof fetch`                        | `globalThis.fetch`   | 커스텀 fetch 구현 (테스트, SSR shim 등).                                                                                                                                                                                |
| `getSettings`                  | `() => SettingsSnapshot \| undefined` | (없음)               | 설정 store 에서 `provider`, `model`, `permissionMode` 를 읽는 함수.                                                                                                                                                     |
| `sessionIdStorage`             | `Storage \| 'memory'`                 | `sessionStorage`     | ACP 세션 ID 가 저장될 스토리지.                                                                                                                                                                                         |
| `sessionIdStorageKey`          | `string`                              | `agent-devtools:sid` | ACP 세션 ID 의 스토리지 키.                                                                                                                                                                                             |
| `generateSessionId`            | `() => string`                        | `crypto.randomUUID`  | 세션 ID 생성 함수.                                                                                                                                                                                                      |
| `streamSilentMs`               | `number`                              | `60_000`             | 리더가 이 시간 이상 침묵하면 스트림을 abort 하고 `StreamSilentError` 로 reject. `0` 이면 비활성화.                                                                                                                      |
| `preResponseRetries`           | `number`                              | `4`                  | agent 에 도달하지 못한 실패의 재시도 횟수 — Response 도착 전 `fetch` reject, 또는 dev 서버 proxy 의 `503` "agent not ready"(hot reload 직후 respawn 창). AbortError, 끊긴 `2xx` 스트림, 그 외 HTTP 에러는 재시도 안 함. |
| `preResponseRetryBackoffMs`    | `number`                              | `300`                | 재시도 사이 기본 backoff. 지수적으로 증가(`base · 2^(n-1)`)하며 `preResponseRetryMaxBackoffMs` 로 상한.                                                                                                                 |
| `preResponseRetryMaxBackoffMs` | `number`                              | `2000`               | 단일 backoff 대기의 상한. 전체 재시도 창을 제한(기본 4회 재시도 기준 ~4.1s).                                                                                                                                            |

### `createShadowWidgetRoot(options)`

위젯 host element 를 document 에 부착하고 shadow root 컨테이너를 반환합니다. 기본 closed 모드. E2E 디버깅에는 `openMode: true` 를 넘깁니다.

### `createPicker(options)` / `createOverlay(options)`

DOM picker primitives. `createPicker` 는 hover capture, click 처리, Escape 취소를 orchestrate 하고, `createOverlay` 는 호스트 DOM 위에 hover outline 을 그립니다 (pointer-events 비활성화 — 호스트 click 흐름을 막지 않습니다).

### `StreamSilentError`

리더가 `streamSilentMs` 보다 오래 chunk 를 받지 못했을 때 트랜스포트가 throw 하는 에러. `error.name === 'StreamSilentError'`. UI 에서는 "스트림이 끊겼습니다. 다시 시도해 주세요" 같은 메시지로 surface 하세요.

### 그 외 공개 entry

`createComposer`, `createStreamRenderer`, `createSettingsPanel`, `createSettingsStore`, `createLauncher`, `createHandoffModal`, `createMessageStore`, `createErrorObserver`, `createConsoleErrorObserver`, `createNetworkObserver`, `createUnhandledObserver`, `buildPageContext`, `describePicked`, `extractRoute`, `buildSelector`, `createPageContextEnricher`, `createAgentInfoFetcher`, `createHandoffRequester`, `createRelatedImportsFetcher`, `createSourceSliceFetcher`. 어댑터는 이 primitives 위에 layer 합니다 — 새 어댑터는 shell 을 재구현하지 않고 이들을 조합하기만 하면 됩니다.

## 보안 기본값

- **Production 거부** — `mountAgentDevtools` 가 `process.env.NODE_ENV === 'production'` 에서 throw 합니다. 위젯이 실수로 production 번들에 포함돼도 활성화되지 않습니다.
- **Closed Shadow DOM** — 호스트 CSS, 호스트 이벤트, 호스트 framework 인스턴스가 위젯 트리 밖에 위치합니다. open 모드는 명시적 `shadowOpen: true` opt-in 에만 허용됩니다.
- **Pairing token 인증** — 기본 트랜스포트가 모든 요청에 `Authorization: Bearer <token>` 을 실어 보냅니다. 토큰은 URL 에 기록되지 않습니다.
- **Sanitised 마크다운** — assistant 메시지는 `marked` 로 렌더링하고 `dompurify` 로 sanitise 한 뒤 shadow tree 에 삽입됩니다.

## 요구 사항

- Node.js `>= 22.13.0`
- `Element.attachShadow`, `fetch`, `ReadableStream`, `sessionStorage` 가 지원되는 브라우저 환경.

## 관련 링크

- 모노레포: <https://github.com/Seungwoo321/agent-devtools>
- Core 패키지: [`@agent-devtools/core`](https://www.npmjs.com/package/@agent-devtools/core)
- React 어댑터: [`@agent-devtools/react`](https://www.npmjs.com/package/@agent-devtools/react)
- Vite 플러그인: [`@agent-devtools/vite`](https://www.npmjs.com/package/@agent-devtools/vite)
- 사용자 가이드: <https://agent-devtools-docs.vercel.app/>
- 이슈 트래커: <https://github.com/Seungwoo321/agent-devtools/issues>

## 라이선스

[MIT](https://github.com/Seungwoo321/agent-devtools/blob/main/LICENSE) © Seungwoo Lee
