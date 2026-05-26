---
title: 어떻게 동작하나
description: agent-devtools 가 브라우저 위젯, 루프백 dev 서버, 로컬 Claude Code 세션을 어떻게 한 루프로 묶는지 한 장의 다이어그램으로.
---

## 전체 모양

agent-devtools 는 이미 당신 머신에 있는 네 가지 — **개발 중인 페이지**, **이미 띄워둔 dev 서버**, **로컬 Claude Code Agent SDK**, **워크스페이스 파일** — 를 한 루프로 묶는다. 별도 서버나 별도 계정이 추가되지 않는다.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ 브라우저 탭 (개발 중인 페이지)                                                │
│                                                                              │
│   ┌────────────────────────────────────────────────────────────────────────┐ │
│   │ 호스트 앱 DOM (React / Vue / Next / Nuxt / Angular / Svelte / SvelteKit)│ │
│   │                                                                        │ │
│   │   ┌──────────────────────────────────────────────────────────────────┐ │ │
│   │   │ agent-devtools 위젯                                              │ │ │
│   │   │   - closed shadow root (스타일·이벤트 누수 없음)                 │ │ │
│   │   │   - 픽커 overlay → PickedEvidence                                │ │ │
│   │   │   - 채팅 composer + 메시지 스트림                                │ │ │
│   │   └──────────────────────────────────────────────────────────────────┘ │ │
│   └────────────────────────────────────────────────────────────────────────┘ │
│                                  │                                           │
│         Authorization: Bearer <pairing token>  (헤더 전용, URL 미포함)        │
│                                  ▼                                           │
└──────────────────────────────────────────────────────────────────────────────┘
                                   │
                              127.0.0.1
                                   │
┌──────────────────────────────────────────────────────────────────────────────┐
│ 로컬 dev 서버 (같은 머신, 루프백 전용)                                        │
│                                                                              │
│   @agent-devtools/core                                                       │
│     - HTTP 라우터 + SSE 이벤트 스트림                                         │
│     - constant-time 토큰 검증                                                 │
│     - workspace-relative 경로 resolver                                        │
│                                  │                                           │
│                                  ▼                                           │
│   @agent-devtools/harness-core                                               │
│     - provider 추상화 (ACP / SDK)                                             │
│     - action 별 권한 정책 매트릭스                                            │
│                                  │                                           │
│                                  ▼                                           │
│   Claude Code Agent SDK   ◄────  ~/.claude OAuth 세션 재사용                  │
│     - 툴: Read / Edit / Write / Bash / Glob / Grep                            │
└──────────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
                       디스크 위의 당신 프로젝트 파일
                       (HMR 이 변경을 즉시 반영)
```

## 각 계층이 하는 일

### 위젯 (브라우저)

- 프레임워크 어댑터 (`@agent-devtools/react`, `@agent-devtools/vue` 등) 가 **dev 서버 환경에서만** 마운트한다. production 번들에는 그래프 진입조차 하지 않는다 — 자세한 차단 계약은 [보안 모델](./security/) 참조.
- closed shadow root 안에서 동작. 호스트 앱으로 CSS 변수 / focus 이벤트 / scroll 컨테이너가 새지 않는다.
- 픽커는 프레임워크별 컴포넌트 트리 (fiber / vnode / Ivy 디버그 / Svelte meta) 를 walk 해서 클릭된 DOM 노드를 `PickedEvidence` 로 환원한다 — `{ componentName, source: { fileName, lineNumber }, componentChain, outerHTML, selector }`.
- 프롬프트는 `fetch` + SSE 스트림으로 dev 서버에 보낸다. 페어링 토큰은 `Authorization` 헤더로만 전달되며 URL 에 절대 들어가지 않는다.

### 루프백 dev 서버 (`@agent-devtools/core`)

- `127.0.0.1` 에만 bind 한다. 외부 포트도, reverse-proxy 친화 모드도 없다.
- 모든 요청을 in-memory 페어링 토큰과 `timingSafeEqual` 로 비교한다. 새 프로세스 = 새 토큰.
- 에이전트가 만지는 모든 파일 경로를 프로젝트 워크스페이스 기준으로 해소하고, 그 밖은 거부한다. 자세한 범위는 [보안 모델 → 워크스페이스 스코프](./security/) 참조.

### 하니스 (`@agent-devtools/harness-core`)

- provider 를 선택한다 — ACP (기본, 로컬 `claude` CLI 를 spawn) 또는 SDK (Anthropic Agent SDK).
- action 별 권한 정책을 적용한다. `fileEdit` 은 기본 `auto`, `bash` / `webFetch` / `mcpTool` 은 `ask` — [권한 모드](./permission-modes/) 참조.

### Claude Code Agent SDK

- `~/.claude/` 아래의 OAuth 세션을 재사용한다. agent-devtools 는 API 키를 요구하지 않는다.
- 에이전트는 CLI 와 같은 툴 (`Read`, `Edit`, `Write`, `Bash`, `Glob`, `Grep`) 을 쓴다. `Edit` 이 일어나면 Vite / webpack / Vinxi 의 일반 HMR 파이프라인이 변경을 받는다 — 채팅하던 브라우저 탭 안에서 결과까지 확인된다.

## 안전성을 떠받치는 세 경계

마케팅 문구가 아니라 서로 독립된 세 개의 경계가 모델을 정직하게 유지한다.

1. **dev-only 2-layer guard** — 빌드 시점에 위젯 chain 을 production 그래프에서 배제하고, 런타임에 `NODE_ENV` 를 한 번 더 검사. 자세히는 [보안 모델 → dev-only guard](./security/) 참조.
2. **루프백 전용 bind + 페어링 토큰** — 외부 접근 가능한 표면 없음, URL 미포함, constant-time 비교. 자세히는 [보안 모델 → 페어링 토큰](./security/) 참조.
3. **action 별 권한 정책** — 파괴적 툴 (`bash`, `webFetch`, `mcpTool`) 은 permissive 모드에서도 기본 `ask`. 자세히는 [권한 모드](./permission-modes/) 참조.

## 다음 단계

- [설치](./installation/) — 자기 스택을 5 분 안에 연결.
- [Provider — ACP vs SDK](./providers/) — Claude Code 전송 방식 선택.
- [보안 모델](./security/) — 경계의 전체 버전.
