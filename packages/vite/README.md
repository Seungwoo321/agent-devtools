# @agent-devtools/vite

> Vite 8 plugin for [agent-devtools](https://github.com/Seungwoo321/agent-devtools) — auto-spawn local agent server, inject widget bootstrap into dev HTML, no-op on `vite build`.

🚧 **Pre-alpha** — Phase 0 (React + Vite + Claude Pro) 종단 검증 단계.

## What it does

- **`apply: 'serve'`** — production 빌드 단계엔 일절 참여하지 않는다 (production-leak 0).
- **Local agent server spawn** — `127.0.0.1` 의 free 포트에 자동 spawn, 페어링 토큰을 메모리에서 발급.
- **Dev HTML injection** — `transformIndexHtml(order: 'pre')` 로 `window.__AGENT_DEVTOOLS_CONFIG__` (baseUrl + pairingToken) 와 `mountAgentDevtools` 부트스트랩 모듈을 주입. URL 에는 토큰이 노출되지 않는다.
- **Graceful shutdown** — Vite dev 서버 종료 시 spawn 한 agent 프로세스를 정리.

## Install

```bash
pnpm add -D @agent-devtools/vite @agent-devtools/react @agent-devtools/core
```

Peer dep: `vite ≥8`.

## Quick usage

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { agentDevtools } from '@agent-devtools/vite';

export default defineConfig({
  plugins: [react(), agentDevtools()],
});
```

`pnpm dev` 로 띄우면 widget launcher 가 페이지 우하단에 떠 있다. `vite build` 출력에는 widget 코드가 0 바이트 들어가지 않는다 — 이 보장은 패키지 안의 [`build-integration.test.ts`](https://github.com/Seungwoo321/agent-devtools/blob/main/packages/vite/src/build-integration.test.ts) 가 실제 production 빌드를 돌려 sentinel 부재를 강제한다.

## Status & roadmap

전체 컨텍스트는 모노레포 루트 [`README.md`](https://github.com/Seungwoo321/agent-devtools#readme) 참고.

## License

[MIT](https://github.com/Seungwoo321/agent-devtools/blob/main/LICENSE) © Seungwoo Lee
