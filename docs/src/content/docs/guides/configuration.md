---
title: 구성 레퍼런스
description: Vite 플러그인 agentDevtools() 의 7 가지 옵션 레퍼런스.
---

## Vite 플러그인 옵션

> 진실의 출처: `packages/vite/src/plugin.ts` 의 `AgentDevtoolsPluginOptions`.
> 이 페이지는 해당 인터페이스의 7 개 필드를 한 절씩 풀어쓴 레퍼런스다.
> 동작이 의심되면 코드의 doc comment 가 우선한다.

`@agent-devtools/vite` 의 `agentDevtools()` 플러그인은 단 하나의
옵션 객체를 받는다. 모든 필드는 optional 이며, 비워두면 안전한
기본값으로 동작한다.

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import { agentDevtools } from '@agent-devtools/vite';

export default defineConfig({
  plugins: [
    agentDevtools({
      // 아래 7 개 옵션 중 필요한 것만
    }),
  ],
});
```

플러그인 자체에는 두 겹의 production 가드가 걸려 있다.

1. **빌드 시점 가드** — 플러그인은 `apply: 'serve'` 라서 `vite build`
   는 이 플러그인을 통째로 무시한다. 산출물에는 어떤 코드도 새지 않는다.
2. **런타임 가드** — `enabled: false` 면 dev 서버에서도 `configureServer`
   와 `transformIndexHtml` 이 no-op 이 된다. env-gated rollout 에 쓰인다.

아래 옵션은 모두 dev 모드 안에서의 세부 조정이며, production 차단을
대체하지 않는다.

### `enabled` (boolean, 기본 `true`)

플러그인을 Vite config 에서 제거하지 않고 런타임에서만 끄는 스위치.
`false` 일 때 `configureServer` 와 `transformIndexHtml` 이 모두
no-op 으로 바뀐다. production 가드와는 별개 layer 이며,
`vite build` 는 이 값과 무관하게 항상 플러그인을 무시한다.

env 변수로 토글하고 싶을 때 자주 쓰인다.

```ts
agentDevtools({
  enabled: Boolean(import.meta.env.VITE_DEVTOOLS),
});
```

### `importFrom` (string, 기본 `'@agent-devtools/react'`)

주입되는 부트스트랩 스크립트가 어떤 모듈에서 위젯 entry 를 import 할지
지정하는 문자열. 지정한 모듈은 반드시 다음 두 export 를 가져야 한다.

- `mountAgentDevtools`
- `createDefaultTransport`

React 가 아닌 어댑터를 만들거나, 회사 내부 fork 어댑터를 사용할 때
이 값을 바꾼다.

```ts
agentDevtools({ importFrom: '@agent-devtools/vue' });
```

### `spawnServer` (boolean, 기본 `true`)

Vite dev 서버 옆에 에이전트 서버를 함께 띄울지 결정한다. 기본 `true` —
호스트가 신경 쓸 일 없이 같이 켜지고 꺼진다.

`false` 로 두면 플러그인은 부트스트랩 HTML 만 주입하고 서버는 띄우지
않는다. 이 경우 위젯은 화면에는 뜨지만 transport 가 없어 동작이 불가능한
상태가 된다 — 임베더가 서버 lifecycle 을 직접 잡을 때만 쓴다.

### `workspace` (string, 기본 Vite `config.root`)

에이전트 서버가 "프로젝트" 로 취급하는 워크스페이스 루트. 이 값은
스폰되는 Claude Code 자식 프로세스의 canonical `cwd` 가 되고,
picker preamble 의 source-slice 읽기에 쓰이는 `FileTools` 가
`PathOutsideWorkspaceError` 로 강제하는 경계이기도 하다. **OS 레벨
샌드박스는 아니다** — SDK 가 자체적으로 호출하는 도구는 호스트
사용자의 파일 시스템 권한을 그대로 상속한다. 그 디렉토리에서
터미널로 `claude` 를 직접 실행한 것과 동일한 권한 표면이다.
기본값은 `configureServer` 시점에 잡힌 Vite `config.root` 다.

경로 해석 규칙:

- **절대 경로** — 그대로 사용.
- **상대 경로** — `process.cwd()` 가 아니라 Vite 프로젝트 루트
  (`config.root`) 기준으로 해석한다.

이 덕분에 모노레포에서 example 앱이 repo 루트 하위에 있을 때
`workspace: '..'` 만 적어두면, 어디서 `vite` 를 실행하든 에이전트는
상위 repo 를 바라본다.

```ts
agentDevtools({ workspace: '..' });
```

### `port` (number, 기본 코어 default 4317, sequential fallback)

에이전트 서버가 선호하는 포트. 비워두면 코어의 기본값
(`DEFAULT_PORT = 4317`) 을 쓴다. 해당 포트가 이미 사용 중이면
코어가 `PORT_FALLBACK_ATTEMPTS` (현재 20) 만큼 순차적으로
다음 포트를 시도한다.

여러 dev 서버를 동시에 띄울 때 충돌을 피하려면 명시적으로 지정한다.

```ts
agentDevtools({ port: 4400 });
```

### `startServer` (함수, 테스트 전용)

`startAgentDevtoolsServer` 를 다른 구현으로 갈아끼우는 hook.
실제 포트를 잡지 않는 stub 을 주입해 단위 테스트를 격리할 때 쓰인다.

타입은 `(options: StartAgentDevtoolsServerOptions) => Promise<AgentDevtoolsServerHandle>`.
**production 코드에서는 절대 지정하지 않는다.** 공개 API 로 분류되어
있긴 하지만 사용자 코드가 건드릴 일은 없다.

### `shadowOpen` (boolean, 기본 `false`)

위젯을 open shadow root 로 마운트할지 여부. 기본은 `false` (closed) —
호스트 페이지의 자동화 도구가 위젯 내부 DOM 을 들여다보지 못하도록
격리한다.

이 옵션을 비워두면 env 변수 `AGENT_DEVTOOLS_OPEN_SHADOW=1` 이 있을 때
런타임에서 자동으로 `true` 로 뒤집힌다. Playwright 로 위젯을 E2E
테스트할 때 production-default 의 closed 격리를 건드리지 않고도 DOM
을 피어싱할 수 있게 하는 용도다.

```ts
// 명시적으로 켜기 (드물게)
agentDevtools({ shadowOpen: true });
```

## 더 알아보기

- 보안 모델과 페어링 토큰 처리: `packages/vite/src/plugin.ts` 의 헤더
  주석과 `CONTEXT.md`.
- 어댑터 (`importFrom` 대상) 작성 규칙:
  `.claude/rules/adapter-discipline.md`.
- production-leak 방지 2-layer 계약: `.claude/rules/dev-only-guard.md`.
