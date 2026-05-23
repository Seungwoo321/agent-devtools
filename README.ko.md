<p align="center">
  <img src="./assets/brand/logo.svg" width="96" height="96" alt="agent-devtools logo" />
</p>

<h1 align="center">agent-devtools</h1>

<p align="center">
  React/Vue/Next/Nuxt 용 인페이지 에이전트 개발자도구 OSS — 본인의 LLM 구독을 그대로 사용.
</p>

<p align="center">
  <a href="./README.md">English</a> · <strong>한국어</strong>
</p>

브라우저에서 개발 중인 페이지에 떠 있는 floating 채팅창. 자연어로 UI/기능 수정을 요청하면, **그 채팅창 안에서 직접** 에이전트가 코드를 읽고 수정한다. 별도 IDE 가 필요 없다.

## Demo

![agent-devtools demo: launcher → picker → composer → live edit](./assets/demo.gif)

위젯 안에서 자연어로 "Counter 제목 글씨 키우고 빨간색으로 바꿔줘" 라고 지시하면 에이전트가 `App.tsx` 와 `styles.css` 를 읽고 `Edit` 으로 수정한다. Vite HMR 이 변경된 CSS 를 즉시 반영해 같은 화면 안에서 결과까지 확인된다.

- 사용자 가이드 (en / ko): <https://agent-devtools.seungwoo321.dev>
- 컨텍스트·결정 로그·스코프: [`CONTEXT.md`](./CONTEXT.md)

## Quick Start (React + Vite)

```bash
pnpm add -D @agent-devtools/vite @agent-devtools/react
```

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { agentDevtools } from '@agent-devtools/vite';

export default defineConfig({
  plugins: [react(), agentDevtools()],
});
```

`pnpm dev` 로 띄우면:

1. Vite dev 서버와 함께 로컬 에이전트 서버가 `127.0.0.1` 의 free 포트에 자동 spawn 된다.
2. 페어링 토큰이 메모리 안에서 발급되고 dev HTML 의 `window.__AGENT_DEVTOOLS_CONFIG__` 에 주입된다 (URL 에는 절대 노출되지 않는다).
3. 페이지에 widget 의 launcher 버튼이 떠 있다. 클릭 → 채팅창 열림 → "Pick" 으로 컴포넌트 선택 → 자연어 요청.
4. `vite build` 시 플러그인은 `apply: 'serve'` 라 자동 비활성화. production 번들에는 widget 코드가 0 바이트 들어가지 않는다 (자동화된 [번들 누출 가드](./packages/vite/src/build-integration.test.ts) 가 검증).

### 플러그인을 안 쓰고 직접 mount 할 때

```tsx
// 권장 패턴 — production 번들에서 dynamic import 자체가 tree-shake 됨.
if (import.meta.env.DEV) {
  const { mountAgentDevtools, createDefaultTransport } =
    await import('@agent-devtools/react');
  mountAgentDevtools({
    transport: createDefaultTransport({
      baseUrl: 'http://127.0.0.1:4317',
      pairingToken: '<프로비저닝 메커니즘으로 전달>',
    }),
  });
}
```

수동 import 경로는 `NODE_ENV === 'production'` 일 때 `mountAgentDevtools` 가 mount 를 거부한다 (강제 override 는 `{ force: true }`). 위 dynamic-import 가드는 그 1차 방어선이 잠시 무너져도 widget 코드 자체가 번들에 없도록 하는 2차 방어선이다.

전체 통합 시나리오는 [`examples/react-vite`](./examples/react-vite) 와 [`examples/react-vite/SMOKE-TESTS.md`](./examples/react-vite/SMOKE-TESTS.md) 참고.

## Packages

| Package                                                   | Version | Description                                               |
| --------------------------------------------------------- | ------- | --------------------------------------------------------- |
| [`@agent-devtools/core`](./packages/core)                 | `0.1.0` | 프레임워크-무관 코어 (server, agent engine, widget shell) |
| [`@agent-devtools/harness-core`](./packages/harness-core) | `0.1.0` | 도메인-무관 loop 전략 + LLM provider 추상화               |
| [`@agent-devtools/react`](./packages/react)               | `0.1.0` | React 19 fiber walker + DOM picker + auto context         |
| [`@agent-devtools/vite`](./packages/vite)                 | `0.1.0` | Vite 8 plugin — auto-inject widget + dev-only guard       |

## Security defaults

- **dev-only** — `mountAgentDevtools()` 는 `NODE_ENV === 'production'` 에서 즉시 throw 한다 (override: `{ force: true }`). Vite 플러그인은 `apply: 'serve'` 라 build 단계 자체에 참여하지 않는다.
- **production-leak guard** — `apply: 'serve'` 와 사용자측 `if (import.meta.env.DEV) { … }` dynamic import 두 layer 가 빌드 출력에서 widget 식별자를 모두 제거한다. [`packages/vite/src/build-integration.test.ts`](./packages/vite/src/build-integration.test.ts) 가 실제 production 빌드를 돌려 sentinel 부재를 강제한다.
- **127.0.0.1 binding** — 로컬 에이전트 서버는 loopback only. 외부 네트워크 노출 없음. 점유 시 sequential fallback.
- **페어링 토큰** — CLI 시작마다 회전, 메모리 only, 디스크 미저장, URL embed 금지. `Authorization: Bearer …` 헤더로만 전달.
- **closed Shadow DOM** — 호스트 앱 CSS/DOM·상태 격리, React 19 별도 모듈 인스턴스로 dual-tree.

## Requirements

- Node.js **≥24** (LTS Krypton)
- pnpm **≥11**
- (사용 시) 활성 Claude Pro/Max 구독 (Agent SDK Credit 포함, 2026-06-15 시행)

## Development

```bash
pnpm install
pnpm typecheck
pnpm test
```

자세한 개발 가이드는 [`CONTRIBUTING.md`](./CONTRIBUTING.md).

## License

[MIT](./LICENSE) © Seungwoo Lee
