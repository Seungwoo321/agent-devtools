---
title: 보안 모델
description: agent-devtools 의 보안 경계 — pairing token, dev-only guard 2 layer, 127.0.0.1 loopback, closed shadow DOM.
---

## 한 줄 요약

agent-devtools 는 **로컬 개발 서버 전용** 도구다. production 번들에는 widget 코드가 0 바이트 들어가지 않으며, 외부 네트워크로 노출되는 표면도 없다. 본 문서는 그 경계를 보장하는 layer 들과, workspace 설정이 실제로 어디까지 강제되는지를 솔직하게 정리한다.

## Pairing Token

에이전트 서버는 모든 요청에 대해 `Authorization: Bearer <token>` 헤더를 요구한다. 토큰 규약은 다음과 같다 (구현: [`packages/core/src/server/auth.ts`](https://github.com/Seungwoo321/agent-devtools/blob/main/packages/core/src/server/auth.ts)).

- **회전 정책** — 32 byte 난수 (`crypto.randomBytes(32)` → base64url) 를 **CLI 프로세스 시작 시점에 1 회** 발급. 프로세스가 죽으면 토큰도 같이 사라진다. 재시작하면 새 토큰.
- **메모리 only / 디스크 미저장** — 토큰은 어떤 파일에도 기록되지 않는다. dotenv, lock file, cache 어느 곳에도 새지 않는다.
- **URL 미노출** — 브라우저 히스토리·외부 reverse-proxy 로그·error reporter 의 URL 캡처를 통해 누출되지 않도록, 토큰은 **쿼리스트링/path 에 절대 들어가지 않는다**. dev HTML 의 `<head>` 안 inline script 가 `window.__AGENT_DEVTOOLS_CONFIG__` 로만 노출한다 (소스 코드에는 박히지 않고, Vite 의 `transformIndexHtml` 응답에만 존재 — [`packages/vite/src/plugin.ts`](https://github.com/Seungwoo321/agent-devtools/blob/main/packages/vite/src/plugin.ts) 헤더 주석 참조).
- **헤더 전달** — fetch/SSE 요청은 `Authorization: Bearer …` 로만 토큰을 보낸다.
- **상수 시간 비교** — 서버는 `timingSafeEqual` 로 검증해 길이/내용 추측 공격을 차단한다 (`packages/core/src/server/auth.ts:26`).

## Dev-Only Guard (2-layer)

production 사용자에게 widget 코드가 도달하는 사고를 막기 위해, 모든 번들러 통합은 **2 layer 가드** 를 동일하게 준수한다. 상세 계약: [`.claude/rules/dev-only-guard.md`](https://github.com/Seungwoo321/agent-devtools/blob/main/.claude/rules/dev-only-guard.md).

### Layer 1: 빌드 시점 차단

production build 시 agent-devtools 의 코드 경로가 모듈 그래프에 **진입조차 하지 않는다**. tree-shaking 에 의존하지 않는다.

- **Vite** — `agentDevtools()` 플러그인은 `apply: 'serve'` 로 선언되어 (`packages/vite/src/plugin.ts:109`) `vite build` 시 Vite 가 플러그인을 통째로 무시한다. `transformIndexHtml` 자체가 호출되지 않으므로 widget bootstrap 도, pairing-token inline script 도 production HTML 에 절대 끼지 않는다.
- **사용자측 동적 import 가드** — 플러그인 없이 수동 mount 하는 경우엔 호출부에 `if (import.meta.env.DEV) { await import('@agent-devtools/react') }` 를 두는 것이 권장 패턴 (README 의 "플러그인을 안 쓰고 직접 mount 할 때" 섹션). production 번들에서 dynamic import 자체가 tree-shake 된다.
- **Next.js / Nuxt / Webpack** — 동일 정신으로, plugin/module 진입 함수가 `NODE_ENV !== 'production'` (또는 `nuxt.options.dev`) 검사 후에만 import/entry 를 추가한다. 신규 어댑터는 이 계약을 그대로 상속해야 한다.

### Layer 2: 런타임 NODE_ENV gate

Layer 1 이 우회되더라도 런타임에서 코드가 자기 자신을 차단한다. **fail-loud (throw) 가 디폴트** — silent no-op 보다 잘못된 배포를 즉시 드러낸다.

- `mountAgentDevtools()` 는 `process.env.NODE_ENV === 'production'` 일 때 throw 한다 ([`packages/react/src/orchestrator/mount.ts:464`](https://github.com/Seungwoo321/agent-devtools/blob/main/packages/react/src/orchestrator/mount.ts) 의 `isProductionBuild`). 명시 override `{ force: true }` 만 허용 (정당화가 필요한 운영 디버깅 용도).
- `startAgentDevtoolsServer` 도 동일 검사를 수행 — production 환경에서는 절대 `listen` 하지 않는다.
- `enabled: false` 같은 dev 안 opt-out 옵션은 Layer 2 와 **별개 layer** 다. opt-out 은 production 차단을 대체하지 않는다.

## 127.0.0.1 Loopback

로컬 에이전트 서버는 **루프백 인터페이스에만 bind** 한다 — 외부 네트워크 노출은 없다.

- `LOOPBACK_HOST = '127.0.0.1'` 상수가 강제 (`packages/core/src/server/server.ts:9`). `host` 옵션 타입 자체가 `typeof LOOPBACK_HOST` 로 제한되어 다른 인터페이스로 binding 할 수 없다.
- 기본 포트가 점유 중이면 **sequential fallback** 으로 다음 포트를 순차 시도하고, `[desiredPort, desiredPort + maxAttempts - 1]` 범위에서 못 찾으면 명시 에러로 실패한다.
- 브라우저는 `http://127.0.0.1:<port>` 로 직접 가지 않고, Vite dev 서버의 **same-origin proxy mount (`/__agent_devtools`)** 를 거친다 (`packages/vite/src/plugin.ts`). CORS preflight 표면이 사라지고, 루프백 binding 은 순수 서버측 unwrapping 으로만 유지된다.

## Closed Shadow DOM

widget UI 는 호스트 페이지의 DOM 위에 **closed shadow root** 로 마운트된다.

- 호스트 앱의 글로벌 CSS variable·전역 스타일·이벤트 흐름과 분리. widget 의 어떤 CSS 도 호스트로 새지 않는다.
- React 19 인스턴스는 **별개 모듈 인스턴스** — 호스트 앱의 React Provider·Context·Pinia/Redux store 에 의존하지 않는다 (dual-tree). 호스트 앱의 React 버전 충돌도 발생하지 않는다.
- `AGENT_DEVTOOLS_OPEN_SHADOW=1` 환경 변수는 **Playwright E2E 전용**. 자동화가 widget 내부 DOM 을 snapshot 해야 할 때만 open shadow 로 전환되며, production-default closed isolation 은 절대 바뀌지 않는다 (`packages/vite/src/plugin.ts:103`).

자세한 어댑터 격리 계약: [`.claude/rules/adapter-discipline.md`](https://github.com/Seungwoo321/agent-devtools/blob/main/.claude/rules/adapter-discipline.md) "격리" 섹션.

## Workspace boundary — 실제로 강제되는 범위

`workspace` 옵션 (참조: [`configuration`](/guides/configuration/)) 은 스폰되는 Claude Code 자식 프로세스의 canonical `cwd` **이자** picker preamble 의 source-slice 읽기에 사용되는 in-process `FileTools` 가 강제하는 경계다. **OS 레벨 샌드박스는 아니다.**

강제되는 것:

- [`packages/core/src/files/workspace.ts`](https://github.com/Seungwoo321/agent-devtools/blob/main/packages/core/src/files/workspace.ts) 의 `Workspace.resolveForRead` / `resolveForWrite` 가 `realpathSync` 로 canonicalize 한 뒤 canonical root 와 비교한다. `..` escape, 또는 root 밖을 가리키는 symlink 는 FS 호출 전에 `PathOutsideWorkspaceError` 로 throw 된다. 이 강제는 **picker preamble 읽기에만** 적용된다 — 위젯이 picked element 의 source slice 를 메시지에 첨부해, 에이전트가 grep 없이 바로 파일을 보도록 packaging 하는 경로다 ([`packages/core/src/providers/context-preamble.ts`](https://github.com/Seungwoo321/agent-devtools/blob/main/packages/core/src/providers/context-preamble.ts)).
- Claude Code 자식 프로세스는 워크스페이스 루트를 `cwd` 로 상속받는다 ([`packages/core/src/providers/sdk.ts`](https://github.com/Seungwoo321/agent-devtools/blob/main/packages/core/src/providers/sdk.ts), [`packages/core/src/providers/acp.ts`](https://github.com/Seungwoo321/agent-devtools/blob/main/packages/core/src/providers/acp.ts)). cwd 를 존중하는 도구 (상대 경로 해석, 작업 디렉토리 기준 검색) 는 자동으로 이 범위를 따른다.

agent-devtools 가 **강제하지 않는 것**:

- SDK 가 자체적으로 호출하는 도구 (`Read`, `Edit`, `Bash`, …) 는 자식 프로세스 안에서 호스트 사용자의 OS 파일 시스템 권한 그대로 실행된다. 그 cwd 에서 터미널로 열 수 있는 파일은 모두 도달 가능하다. agent-devtools 는 그 위에 FS 샌드박스·jail·컨테이너·AppArmor 프로파일 등을 layer 하지 않는다.
- Claude Code 자체의 workspace-trust 프롬프트와 `--allowedTools` 플래그는 그대로 적용된다 — 그것들은 SDK 측 통제이지 agent-devtools 가 추가한 layer 가 아니다.
- [action-aware 권한 정책](/guides/permission-modes/) 이 에이전트가 _무엇을 할 수 있는지_ 를 좁히는 올바른 knob 이다. 기본값으로 `bash`, `webFetch`, `mcpTool` 을 cancel 시켜 무인 브라우저 탭이 외부 부수효과를 일으키지 않게 막는다. 단, SDK 가 이미 노출하는 FS 표면을 더 좁히지는 않는다.

더 엄격한 FS 경계가 필요하면 (read-only 모드, 컨테이너 cwd 등) dev 서버를 컨테이너 안에서 돌리거나 프로젝트 디렉토리만 접근 가능한 OS 사용자로 실행한다.

## 자동 회귀 가드

위 4 layer 가 실수로 깨지지 않도록 두 가지 자동 검증이 항상 돈다.

1. **dev 주입 확인** — example 의 `pnpm dev` 가 띄운 HTML 에 widget bootstrap `<script>` tag 가 존재하는지 검사.
2. **production no-leak 확인** — example 의 `pnpm build` 산출물 전체 텍스트 파일을 grep 했을 때 `@agent-devtools` 문자열이 **0 회** 등장해야 한다. 이 검증은 [`packages/vite/src/build-integration.test.ts`](https://github.com/Seungwoo321/agent-devtools/blob/main/packages/vite/src/build-integration.test.ts) 가 실제 production 빌드를 돌려 강제한다.

CI 매트릭스가 이 두 검증을 빨갛게 보고하면 release 는 자동 차단된다. 회귀 가드를 우회/비활성화하는 변경은 PR 본문에 명시적 정당화 없이는 reject 된다.

## 관련 문서

- 설치·플러그인 구성: [`installation`](/guides/installation/), [`configuration`](/guides/configuration/)
- 권한 모델: [`permission-modes`](/guides/permission-modes/)
- 첫 실행 가이드: [`first-run`](/guides/first-run/)
- 자기 provider 가져오기 — 모든 LLM 백엔드가 거쳐가는 서버측 seam: [`byo-provider`](/guides/byo-provider/)
