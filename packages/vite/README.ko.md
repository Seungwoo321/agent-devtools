[English](./README.md) · [한국어]

# @agent-devtools/vite

> [agent-devtools](https://github.com/Seungwoo321/agent-devtools) 의 Vite 8 플러그인 — 로컬 에이전트 서버 자동 spawn, dev HTML 에 위젯 부트스트랩 주입, `vite build` 시 no-op.

**상태:** `0.1.0` — 초기 알파. `1.0` 이전에 API 가 변경될 수 있습니다.

## 동작

- **`apply: 'serve'`** — production 빌드 시점에는 플러그인이 아예 등록되지 않습니다. `dist/` 에 위젯 코드가 0 바이트 들어가지 않습니다.
- **로컬 에이전트 서버 spawn** — `127.0.0.1` 의 free 포트에 자동 spawn. pairing token 은 메모리에서 발급.
- **Dev HTML 주입** — `transformIndexHtml(order: 'pre')` 가 `window.__AGENT_DEVTOOLS_CONFIG__` (baseUrl + pairingToken) 와 `mountAgentDevtools` 부트스트랩 모듈을 주입. 토큰은 **URL 에 노출되지 않습니다.**
- **Graceful shutdown** — Vite dev 서버 종료 시 spawn 된 에이전트 프로세스가 함께 정리됩니다.

## 설치

```bash
pnpm add -D @agent-devtools/vite @agent-devtools/react @agent-devtools/core
```

Peer dependency: `vite >= 8`.

## 빠른 사용

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { agentDevtools } from '@agent-devtools/vite';

export default defineConfig({
  plugins: [react(), agentDevtools()],
});
```

`pnpm dev` 로 띄우면 위젯 launcher 가 페이지 우하단에 떠 있습니다. `pnpm build` 후 다음을 확인:

```bash
grep -r "@agent-devtools" dist/ || echo "OK — no leak"
```

production no-leak 은 [`build-integration.test.ts`](https://github.com/Seungwoo321/agent-devtools/blob/main/packages/vite/src/build-integration.test.ts) 가 실제 production 빌드를 돌려 강제합니다.

## 옵션

| 옵션          | 타입      | 기본값                  | 설명                                                                                 |
| ------------- | --------- | ----------------------- | ------------------------------------------------------------------------------------ |
| `enabled`     | `boolean` | `true`                  | config 에서 제거하지 않고 런타임에 끄기.                                             |
| `importFrom`  | `string`  | `@agent-devtools/react` | `mountAgentDevtools` + `createDefaultTransport` 를 export 하는 어댑터 모듈.          |
| `spawnServer` | `boolean` | `true`                  | 에이전트 서버를 외부에서 관리하려면 `false`.                                         |
| `workspace`   | `string`  | Vite `config.root`      | 에이전트가 read/edit 가능한 workspace root. 상대 경로는 `config.root` 기준.          |
| `port`        | `number`  | (auto)                  | spawn 할 에이전트 서버의 선호 포트.                                                  |
| `shadowOpen`  | `boolean` | `false`                 | open shadow root 사용 (E2E 디버깅 전용). `AGENT_DEVTOOLS_OPEN_SHADOW=1` 로도 활성화. |

## 요구 사항

- Node.js `>= 24.0.0`
- Vite `>= 8`

## 관련 링크

- 모노레포: <https://github.com/Seungwoo321/agent-devtools>
- Core 패키지: [`@agent-devtools/core`](https://www.npmjs.com/package/@agent-devtools/core)
- React 어댑터: [`@agent-devtools/react`](https://www.npmjs.com/package/@agent-devtools/react)

## 라이선스

[MIT](https://github.com/Seungwoo321/agent-devtools/blob/main/LICENSE) © Seungwoo Lee
