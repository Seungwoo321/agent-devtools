[English](./README.md) · [한국어]

# @agent-devtools/core

> [agent-devtools](https://github.com/Seungwoo321/agent-devtools) 의 프레임워크 무관 core — 로컬 에이전트 서버, pairing token 인증, CLI 바이너리, 그리고 모든 어댑터가 공유하는 위젯 shell.

**상태:** `0.1.0` — 초기 알파. `1.0` 이전에 API 가 변경될 수 있습니다. Phase 0 는 React + Vite + Claude Pro/Max 를 다룹니다.

## 무엇이 들어 있나

- **로컬 에이전트 서버** — `127.0.0.1` 에만 bind (LAN 노출 없음), 포트 순차 fallback, `/v1/agent/stream` SSE 스트리밍.
- **Pairing token** — CLI 시작마다 메모리에서 생성, 디스크 미저장, URL 미포함. 모든 요청에 `Authorization: Bearer <token>` 필수.
- **`agent-devtools` CLI** — `bin/agent-devtools.mjs`. 번들러 플러그인(예: `@agent-devtools/vite`) 이 자동 spawn 하지만 수동 실행도 가능.
- **Production guard** — `NODE_ENV === 'production'` 에서 `mountAgentDevtools` 가 throw. (명시적 연구 용도로만 `{ force: true }` 로 override 가능.)

## 설치

```bash
pnpm add -D @agent-devtools/core
```

대부분의 프로젝트는 `core` 를 **직접 설치하지 않습니다** — 프레임워크 어댑터(`@agent-devtools/react`) 와 번들러 통합(`@agent-devtools/vite`) 이 의존성으로 끌어옵니다.

## 요구 사항

- Node.js `>= 24.0.0`
- 로컬 `claude` CLI 의 Claude Pro/Max 세션 **또는** `ANTHROPIC_API_KEY`

## 관련 링크

- 모노레포: <https://github.com/Seungwoo321/agent-devtools>
- React 어댑터: [`@agent-devtools/react`](https://www.npmjs.com/package/@agent-devtools/react)
- Vite 플러그인: [`@agent-devtools/vite`](https://www.npmjs.com/package/@agent-devtools/vite)
- 이슈 트래커: <https://github.com/Seungwoo321/agent-devtools/issues>

## 라이선스

[MIT](https://github.com/Seungwoo321/agent-devtools/blob/main/LICENSE) © Seungwoo Lee
