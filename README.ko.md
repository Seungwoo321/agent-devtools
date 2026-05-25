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

- 사용자 가이드 (en / ko): <https://agent-devtools-docs.vercel.app/>
- 컨텍스트·결정 로그·스코프: [`CONTEXT.md`](./CONTEXT.md)

## Quick Start

자기 스택에 맞는 행을 고른다. 각 어댑터는 [`examples/`](./examples) 에 실행 가능한 예제와 `pnpm --filter <example> run smoke:no-leak` 로 돌릴 수 있는 production-leak 가드를 갖는다 — production 번들에 widget 코드가 0 바이트 들어가는 것을 검증한다.

| Stack            | 설치                                                           | 예제                                               |
| ---------------- | -------------------------------------------------------------- | -------------------------------------------------- |
| React + Vite     | `pnpm add -D @agent-devtools/vite @agent-devtools/react`       | [`examples/react-vite`](./examples/react-vite)     |
| Vue 3 + Vite     | `pnpm add -D @agent-devtools/vite @agent-devtools/vue`         | [`examples/vue-vite`](./examples/vue-vite)         |
| Vue 2 + Vite     | `pnpm add -D @agent-devtools/vite @agent-devtools/vue2`        | [`examples/vue2-vite`](./examples/vue2-vite)       |
| Angular + Vite   | `pnpm add -D @agent-devtools/vite @agent-devtools/angular`     | [`examples/angular-vite`](./examples/angular-vite) |
| Svelte + Vite    | `pnpm add -D @agent-devtools/vite @agent-devtools/svelte`      | [`examples/svelte-vite`](./examples/svelte-vite)   |
| SvelteKit        | `pnpm add -D @agent-devtools/vite @agent-devtools/sveltekit`   | [`examples/sveltekit`](./examples/sveltekit)       |
| Next.js 15 (App) | `pnpm add -D @agent-devtools/next @agent-devtools/react`       | [`examples/next`](./examples/next)                 |
| Next.js (Pages)  | `pnpm add -D @agent-devtools/next-pages @agent-devtools/react` | [`examples/next-pages`](./examples/next-pages)     |
| Nuxt 3           | `pnpm add -D @agent-devtools/nuxt @agent-devtools/vue`         | [`examples/nuxt`](./examples/nuxt)                 |
| Nuxt 2           | `pnpm add -D @agent-devtools/nuxt2 @agent-devtools/vue2`       | [`examples/nuxt2`](./examples/nuxt2)               |

### React + Vite

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { agentDevtools } from '@agent-devtools/vite';

export default defineConfig({
  plugins: [react(), agentDevtools()],
});
```

### Vue 3 + Vite

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { agentDevtools } from '@agent-devtools/vite';

export default defineConfig({
  plugins: [vue(), agentDevtools({ framework: 'vue' })],
});
```

### Next.js 15 (App 또는 Pages Router)

```ts
// next.config.ts
import type { NextConfig } from 'next';
import { withAgentDevtools } from '@agent-devtools/next';

const config: NextConfig = { reactStrictMode: true };
export default withAgentDevtools(config);
```

```tsx
// app/agent-devtools.tsx (App Router) — 또는 _app.tsx 에서 호출 (Pages Router)
'use client';
import { useEffect } from 'react';
import { bootstrapAgentDevtools } from '@agent-devtools/next/bootstrap';

export function AgentDevtools(): null {
  useEffect(() => {
    bootstrapAgentDevtools();
  }, []);
  return null;
}
```

### Nuxt 3

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@agent-devtools/nuxt'],
});
```

### Vue 2 + Vite

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import vue2 from '@vitejs/plugin-vue2';
import { agentDevtools } from '@agent-devtools/vite';

export default defineConfig({
  plugins: [vue2(), agentDevtools({ framework: 'vue2' })],
});
```

### Nuxt 2

```js
// nuxt.config.js
export default {
  modules: ['@agent-devtools/nuxt2'],
  build: {
    // Nuxt 2 는 webpack 4 + babel-loader 를 사용하고 node_modules 는 기본적으로
    // transpile 대상에서 제외된다. widget chain 이 끌어오는 marked 가 webpack 4
    // 가 파싱 못 하는 최신 문법을 포함하므로 transpile 에 명시한다.
    transpile: [
      '@agent-devtools/nuxt2',
      '@agent-devtools/vue2',
      '@agent-devtools/react',
      '@agent-devtools/core',
      'marked',
    ],
  },
};
```

### Angular + Vite

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import angular from '@analogjs/vite-plugin-angular';
import { agentDevtools } from '@agent-devtools/vite';

export default defineConfig({
  plugins: [angular(), agentDevtools({ framework: 'angular' })],
});
```

### Svelte + Vite

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { agentDevtools } from '@agent-devtools/vite';

export default defineConfig({
  plugins: [svelte(), agentDevtools({ framework: 'svelte' })],
});
```

### SvelteKit

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';

  let { children } = $props();

  onMount(async () => {
    if (import.meta.env.PROD) return;
    const { mountAgentDevtoolsSvelteKit } = await import('@agent-devtools/sveltekit');
    mountAgentDevtoolsSvelteKit();
  });
</script>

{@render children()}
```

`import.meta.env.PROD` 는 Vite 의 compile-time 치환이므로 `vite build` 시 Rollup 이 `if` / `await import()` 분기를 통째로 제거한다.

### Next.js (Pages Router)

```ts
// next.config.ts
import { withAgentDevtools } from '@agent-devtools/next-pages';

export default withAgentDevtools({ reactStrictMode: true });
```

```tsx
// pages/_app.tsx
import { useEffect } from 'react';
import { bootstrapAgentDevtools } from '@agent-devtools/next-pages/bootstrap';
import type { AppProps } from 'next/app';

export default function App({ Component, pageProps }: AppProps) {
  useEffect(() => {
    bootstrapAgentDevtools();
  }, []);
  return <Component {...pageProps} />;
}
```

어느 스택이든 `pnpm dev` 를 실행하면:

1. 로컬 에이전트 서버가 `127.0.0.1` 의 free 포트에 자동 spawn 된다 (4317 이 점유면 순차 fallback).
2. 페어링 토큰이 메모리 안에서 발급되고 dev HTML 의 `window.__AGENT_DEVTOOLS_CONFIG__` 에 주입된다 — URL 에는 절대 노출되지 않는다.
3. 페이지에 widget 의 launcher 버튼이 떠 있다. 클릭 → 채팅창 열림 → "Pick" 으로 컴포넌트 선택 → 자연어 요청.
4. `pnpm build` 시 어댑터는 종단간 비활성화. production 번들에는 widget 코드가 0 바이트 들어가지 않는다 ([Security defaults](#security-defaults) 참조).

## Packages

| Package                                                   | Version | Description                                               |
| --------------------------------------------------------- | ------- | --------------------------------------------------------- |
| [`@agent-devtools/core`](./packages/core)                 | `0.1.0` | 프레임워크-무관 코어 (server, agent engine, widget shell) |
| [`@agent-devtools/harness-core`](./packages/harness-core) | `0.1.0` | 도메인-무관 loop 전략 + LLM provider 추상화               |
| [`@agent-devtools/react`](./packages/react)               | `0.1.0` | React 19 fiber walker + DOM picker + auto context         |
| [`@agent-devtools/vue`](./packages/vue)                   | `0.1.0` | Vue 3 vnode walker + DOM picker + closed shadow widget    |
| [`@agent-devtools/vue2`](./packages/vue2)                 | `0.1.0` | Vue 2.7 컴포넌트 트리 walker + picker + widget            |
| [`@agent-devtools/angular`](./packages/angular)           | `0.1.0` | Angular Ivy walker + picker + widget                      |
| [`@agent-devtools/svelte`](./packages/svelte)             | `0.1.0` | Svelte 4/5 `__svelte_meta` resolver + picker + widget     |
| [`@agent-devtools/sveltekit`](./packages/sveltekit)       | `0.1.0` | SvelteKit layout mount + server `handle` 바인딩           |
| [`@agent-devtools/next`](./packages/next)                 | `0.1.0` | Next.js 15 App Router wrapper — webpack alias + bootstrap |
| [`@agent-devtools/next-pages`](./packages/next-pages)     | `0.1.0` | Next.js Pages Router wrapper — `>= 12` 호환 동일 패턴     |
| [`@agent-devtools/nuxt`](./packages/nuxt)                 | `0.1.0` | Nuxt 3 module — dev-only plugin 자동 주입                 |
| [`@agent-devtools/nuxt2`](./packages/nuxt2)               | `0.1.0` | Nuxt 2 module — dev-only client plugin 자동 주입          |
| [`@agent-devtools/vite`](./packages/vite)                 | `0.1.0` | Vite 8 plugin — auto-inject widget + dev-only guard       |

## Security defaults

- **dev-only** — 모든 어댑터의 mount entry 는 `NODE_ENV === 'production'` 일 때 즉시 throw 한다 (Layer 2 런타임 가드). 빌드 시 통합 (Vite `apply: 'serve'`, Next webpack alias + DCE, Nuxt `nuxt.options.dev` 게이트) 은 widget 코드 경로가 production 그래프에 진입조차 못 하도록 차단한다 (Layer 1 빌드 가드).
- **production-leak guard** — 각 예제는 `scripts/check-no-leak.mjs` 심볼 기반 스캐너를 갖는다. 실제 production 산출물 (`dist/`, `.next/`, `.output/`) 에서 widget-chain 식별자 (`mountAgentDevtools`, `createDefaultTransport`, `getFiberForElement`, `pumpToSse`, …) 가 한 번이라도 등장하면 build 가 실패한다. CI 가 매 푸시마다 이 매트릭스를 돌린다.
- **127.0.0.1 binding** — 로컬 에이전트 서버는 loopback only. 외부 네트워크 노출 없음. 점유 시 sequential fallback.
- **페어링 토큰** — CLI 시작마다 회전, 메모리 only, 디스크 미저장, URL embed 금지. `Authorization: Bearer …` 헤더로만 전달.
- **closed Shadow DOM** — 호스트 앱 CSS/DOM·상태 격리. React 19 (또는 Vue 3) 별도 모듈 인스턴스로 호스트와의 dual-tree 경계를 둔다.

## Requirements

- Node.js **≥24** (LTS Krypton)
- pnpm **≥11**
- (사용 시) 활성 Claude Pro/Max 구독 (Agent SDK Credit 포함, 2026-06-15 시행)

## Development

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build:examples  # 4 개 예제 모두 build + no-leak smoke 까지 돌린다
```

자세한 개발 가이드는 [`CONTRIBUTING.md`](./CONTRIBUTING.md).

## License

[MIT](./LICENSE) © Seungwoo Lee
