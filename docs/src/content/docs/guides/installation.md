---
title: 설치
description: React, Vue, Angular, Svelte, Next, Nuxt 프로젝트에 agent-devtools 를 5분 안에 붙이는 방법.
---

agent-devtools 는 아래 10 개 호스트 스택 각각에 어댑터를 제공한다. 자기 스택에 맞는 섹션만 골라서 따라가면 된다 — 나머지 문서는 어느 어댑터든 동일하게 적용된다.

## 0. 전제 조건

다음 두 가지가 이미 준비되어 있어야 한다.

1. **Claude Code CLI 설치 + 로그인.**
   ```bash
   # 한 번도 안 깔았다면
   curl -fsSL https://claude.ai/install.sh | bash
   # 로그인 (Claude Pro / Max 계정)
   claude /login
   ```
   `~/.claude/` 아래에 OAuth 세션 파일이 생기면 준비 완료다.
2. **Node.js 24 LTS 이상.**
   `node --version` 으로 확인.

> agent-devtools 는 Anthropic API 키를 요구하지 않는다. CLI 의 OAuth 세션을
> 그대로 빌려 쓴다.

## 1. 스택 고르기

각 어댑터는 [`examples/`](https://github.com/Seungwoo321/agent-devtools/tree/main/examples) 에 실행 가능한 예제와 `smoke:no-leak` 스크립트를 함께 제공한다 — production 번들에 widget 코드가 0 바이트 들어가는 것을 검증한다.

| Stack            | 설치                                                           |
| ---------------- | -------------------------------------------------------------- |
| React + Vite     | `pnpm add -D @agent-devtools/vite @agent-devtools/react`       |
| Vue 3 + Vite     | `pnpm add -D @agent-devtools/vite @agent-devtools/vue`         |
| Vue 2 + Vite     | `pnpm add -D @agent-devtools/vite @agent-devtools/vue2`        |
| Angular + Vite   | `pnpm add -D @agent-devtools/vite @agent-devtools/angular`     |
| Svelte + Vite    | `pnpm add -D @agent-devtools/vite @agent-devtools/svelte`      |
| SvelteKit        | `pnpm add -D @agent-devtools/vite @agent-devtools/sveltekit`   |
| Next.js 15 (App) | `pnpm add -D @agent-devtools/next @agent-devtools/react`       |
| Next.js (Pages)  | `pnpm add -D @agent-devtools/next-pages @agent-devtools/react` |
| Nuxt 3           | `pnpm add -D @agent-devtools/nuxt @agent-devtools/vue`         |
| Nuxt 2           | `pnpm add -D @agent-devtools/nuxt2 @agent-devtools/vue2`       |

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

```tsx
// src/main.tsx — dev 모드에서만 위젯 mount
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

Vite 플러그인이 dev 서버에서 자동으로 Vue 위젯을 mount 한다 — 앱 진입점에서 `mountAgentDevtoolsVue()` 를 수동 호출할 필요 없다.

### Next.js 15 (App 또는 Pages Router)

```ts
// next.config.ts
import type { NextConfig } from 'next';
import { withAgentDevtools } from '@agent-devtools/next';

const config: NextConfig = { reactStrictMode: true };
export default withAgentDevtools(config);
```

```tsx
// app/agent-devtools.tsx (App Router) — 또는 _app.tsx 에서 사용 (Pages Router)
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

```tsx
// app/layout.tsx
import { AgentDevtools } from './agent-devtools';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html>
      <body>
        {children}
        <AgentDevtools />
      </body>
    </html>
  );
}
```

`withAgentDevtools` 가 production 빌드에서 widget chain 에 대한 webpack alias 를 설치하고, bootstrap shim 은 `NODE_ENV === 'production'` 일 때 즉시 early-return 하므로 DCE 가 호출 사이트 자체를 no-op 으로 제거한다.

### Nuxt 3

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@agent-devtools/nuxt'],
});
```

모듈은 `nuxt.options.dev` 를 읽는다. `nuxt build` / `nuxt generate` 시 `setup` 이 `addPlugin` 호출 전에 return 하므로 widget chain 이 번들 그래프에 진입조차 하지 않는다.

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

Vite 플러그인이 dev 서버에서 Vue 2 위젯을 자동 mount 한다. Peer 범위: `vue >= 2.7`.

### Nuxt 2

```js
// nuxt.config.js
export default {
  modules: ['@agent-devtools/nuxt2'],
  build: {
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

Nuxt 2 의 webpack 4 는 `node_modules` 를 babel-loader 대상에서 제외하므로 widget chain 을 `build.transpile` 에 명시한다. `nuxt build` / `nuxt generate` 시 Layer 1 이 `addPlugin` 호출 전에 short-circuit 한다. Peer 범위: `nuxt >= 2.15`, `vue >= 2.7`.

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

Walker 는 Ivy 의 `window.ng.getOwningComponent` / `getComponent` 디버그 API 를 쓰며, `enableProdMode()` 호출 전에만 사용 가능하다. Peer 범위: `@angular/core >= 17`.

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

Walker 는 Svelte 컴파일러가 모든 DOM 요소에 붙이는 dev-only 메타데이터 `element.__svelte_meta.loc.{file,line,column}` 을 읽는다. Peer 범위: `svelte >= 4`.

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

`$app/environment` 의 `dev` 대신 `import.meta.env.PROD` (Vite 의 compile-time 치환) 를 쓴다. `vite build` 시 Rollup 이 `if` / `await import()` 분기를 정적으로 제거하므로 widget chain 이 production client 번들에 들어가지 않는다. Peer 범위: `@sveltejs/kit >= 2`.

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

`withAgentDevtools` 는 App Router wrapper 와 동일한 production webpack alias 를 설치한다. Peer 범위: `next >= 12`, `react >= 18`.

## 2. dev 서버 실행

```bash
pnpm dev
```

브라우저 우측 하단에 보라색 동그란 플로팅 아이콘이 보이면 설치 완료다.

처음 클릭하면 페어링 토큰 안내가 잠깐 뜨고, dev 서버 콘솔에 다음과 같은 로그가
찍힌다.

```
[agent-devtools] pairing token (memory-only, rotates per CLI start)
[agent-devtools] provider: acp (default) — connecting to local Claude Code
```

## 3. 다음 단계

- [첫 실행](/guides/first-run/) — 위젯에 첫 프롬프트 보내고 실제 코드 수정이
  일어나는지 확인
- [권한 모드](/guides/permission-modes/) — 매번 승인 묻지 않도록 설정
- [Provider 가이드](/guides/providers/) — SDK 모드로 바꾸기

## 설치가 잘 안 될 때

- **위젯 아이콘이 안 보임** → [문제 해결: 위젯이 안 뜸](/guides/troubleshooting/#위젯-아이콘이-안-보임)
- **`501 agent stream not configured`** → [문제 해결: provider 미설정](/guides/troubleshooting/#501-agent-stream-not-configured)
- **`claude` CLI 가 없다고 나옴** → Step 0 의 CLI 설치를 다시 확인
