[English](./README.md) · [한국어]

# @agent-devtools/core

> [agent-devtools](https://github.com/Seungwoo321/agent-devtools) 의 프레임워크-무관 core. 로컬 에이전트 서버, pairing token 인증, `agent-devtools` CLI, 그리고 모든 어댑터가 공유하는 agent / file primitive 를 제공합니다.

[![npm](https://img.shields.io/npm/v/@agent-devtools/core.svg)](https://www.npmjs.com/package/@agent-devtools/core)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/Seungwoo321/agent-devtools/blob/main/LICENSE)

## 기능

- **로컬 에이전트 서버** — `127.0.0.1` 에만 bind 되는 HTTP + SSE 서버. 포트 점유 시 `4317`, `4318` … 순차 fallback (최대 20 회 시도).
- **Pairing token 인증** — 서버 시작 시 메모리에서 발급, 디스크 미저장, URL 미포함. 모든 요청에 `Authorization: Bearer <token>` 필수.
- **`agent-devtools` CLI** — 패키지의 `bin` 으로 설치됩니다. 번들러 플러그인 (예: `@agent-devtools/vite`) 이 자동 spawn 하지만, 수동 실행도 가능합니다.
- **ACP / SDK 프로바이더** — 에이전트 스트림 엔드포인트가 사용하는 두 가지 런타임 provider: Anthropic Agent Client Protocol 과 Claude Agent SDK.
- **Workspace 샌드박스** — 에이전트가 read/edit 할 수 있는 영역을 단일 root 로 한정하는 workspace primitive. 루트를 벗어나는 경로는 거부됩니다.
- **Handoff bundle** — `/v1/agent/handoff` 가 대화와 page context 를 markdown 파일로 묶고, 위젯이 표시할 `claude --append-system-prompt-file …` 명령을 반환합니다.

## 설치

```bash
pnpm add @agent-devtools/core
```

대부분의 앱은 `core` 를 직접 설치하지 않습니다. 프레임워크 어댑터(`@agent-devtools/react`) 와 번들러 통합(`@agent-devtools/vite`) 이 의존성으로 끌어옵니다.

## CLI

```bash
agent-devtools [--port <n>] [--max-attempts <n>] [--workspace <path>]
```

| 플래그           | 기본값          | 설명                                                         |
| ---------------- | --------------- | ------------------------------------------------------------ |
| `--port`         | `4317`          | 선호 포트. 점유 시 `port + 1`, `port + 2`, … 를 순차로 시도. |
| `--max-attempts` | `20`            | 실패 전 시도할 순차 포트 수.                                 |
| `--workspace`    | `process.cwd()` | 에이전트가 read/edit 할 workspace root.                      |
| `--help`, `-h`   |                 | 도움말 표시.                                                 |

CLI 는 fresh pairing token 을 발급하고 서버를 `127.0.0.1` 에 bind 한 뒤, URL 과 토큰을 stdout 에 출력합니다. 모든 `Authorization: Bearer …` 요청에 이 토큰이 필요합니다.

## 프로그램에서 사용

```ts
import { startAgentDevtoolsServer } from '@agent-devtools/core/server';

const handle = await startAgentDevtoolsServer({
  port: 4317,
  workspace: process.cwd(),
});

console.log(handle.url); // http://127.0.0.1:4317
console.log(handle.pairingToken); // <bearer token>

// 종료 시
await handle.close();
```

`startAgentDevtoolsServer` 는 `@agent-devtools/vite` 가 내부에서 호출하는 함수입니다. 에이전트 라이프사이클을 직접 관리하고 싶을 때 사용합니다.

## HTTP 인터페이스

| Method | Path                | 설명                                                                                            |
| ------ | ------------------- | ----------------------------------------------------------------------------------------------- |
| `GET`  | `/v1/agent/info`    | workspace root, 등록된 provider 목록, 기본 permission mode 를 반환.                             |
| `POST` | `/v1/agent/stream`  | 에이전트 이벤트의 SSE 스트림. 요청 본문에서 `provider`, `model`, `permissionMode`, prompt 지정. |
| `POST` | `/v1/agent/handoff` | `{ file, command }` 반환 — markdown handoff 파일과 그것을 이어 받을 `claude` 명령.              |

모든 엔드포인트는 `Authorization: Bearer <pairing-token>` 이 필요합니다. 루프백 인터페이스의 요청만 처리됩니다.

## 보안 기본값

- **루프백 전용** — 서버는 `127.0.0.1` 에만 bind 됩니다. LAN 주소에 노출할 수 있는 플래그가 없습니다.
- **메모리 토큰** — `crypto.randomBytes` 로 발급, 디스크 미저장, URL 미포함.
- **Workspace 경로 격리** — workspace primitive 가 모든 파일 경로를 정규화하고, workspace root 를 벗어나는 경로는 거부합니다.

## 요구 사항

- Node.js `>= 24.0.0`
- 로컬 `claude` CLI 의 Claude Pro/Max 세션, **또는** `ANTHROPIC_API_KEY`.

## 관련 링크

- 모노레포: <https://github.com/Seungwoo321/agent-devtools>
- React 어댑터: [`@agent-devtools/react`](https://www.npmjs.com/package/@agent-devtools/react)
- Vite 플러그인: [`@agent-devtools/vite`](https://www.npmjs.com/package/@agent-devtools/vite)
- 사용자 가이드: <https://agent-devtools.seungwoo321.dev>
- 이슈 트래커: <https://github.com/Seungwoo321/agent-devtools/issues>

## 라이선스

[MIT](https://github.com/Seungwoo321/agent-devtools/blob/main/LICENSE) © Seungwoo Lee
