[English](./README.md) · [한국어]

# @agent-devtools/sveltekit

> [agent-devtools](https://github.com/Seungwoo321/agent-devtools) 의 SvelteKit 어댑터. `@agent-devtools/svelte` 의 Svelte 4/5 walker · picker · closed-shadow 위젯을 재사용하고, SvelteKit 서버용 dev-only `handle` hook 을 더해 위젯을 SvelteKit 호스트에 연결합니다.

[![npm](https://img.shields.io/npm/v/@agent-devtools/sveltekit.svg)](https://www.npmjs.com/package/@agent-devtools/sveltekit)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/Seungwoo321/agent-devtools/blob/main/LICENSE)

> Dev 전용. mount 엔트리는 `NODE_ENV === 'production'` 에서 실행을 거부합니다. Vite 플러그인 (`@agent-devtools/vite`) 이 `apply: 'serve'` 로 production 빌드에서 import 를 추가로 제거합니다 — [`dev-only-guard`](https://github.com/Seungwoo321/agent-devtools/blob/main/.claude/rules/dev-only-guard.md) 참고.

## 기능

- **Walker 재사용** — `element.__svelte_meta.loc.{file,line,column}` 을 통한 DOM → source 는 `@agent-devtools/svelte` 에 위임됩니다. 여기에 중복 walker 코드가 없으며, `walkComponentAncestors`, `readSvelteMeta`, `deriveComponentName`, `resolveSourceFromMeta` 를 그대로 re-export 합니다.
- **`mountAgentDevtoolsSvelteKit`** — `+layout.svelte` 의 `onMount` 안에서, `import.meta.env.PROD` 가 false 일 때만 실행됩니다. `vite build` 에서 Rollup 이 해당 분기를 제거하므로 위젯 사슬이 client 번들에 들어가지 않습니다.
- **`createAgentDevtoolsHandle`** (`@agent-devtools/sveltekit/hooks`) — 현재는 passthrough SSR `handle`. 향후 per-request pairing-token 주입과 bootstrap config 방출의 바인딩 지점입니다. `enabled` 게이트 (`NODE_ENV !== 'production'`) 로 production 에서는 no-op.
- **Production 가드** — mount 엔트리가 `NODE_ENV === 'production'` 에서 throw 합니다.
- **Widget UI** — 어댑터 패밀리의 나머지와 동일한 `@agent-devtools/widget-core` 셸.

cross-adapter 계약은 [picker-strategy.md](https://github.com/Seungwoo321/agent-devtools/blob/main/.claude/rules/picker-strategy.md) 참고.

## 설치

```bash
pnpm add -D @agent-devtools/sveltekit
```

Peer dependencies: `@sveltejs/kit ^2.0.0`, `svelte ^4.0.0 || ^5.0.0`.

## 사용법

### Layout mount (dev 전용)

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

`$app/environment` 의 `dev` 대신 `import.meta.env.PROD` (Vite 의 컴파일 시점 치환) 를 사용하세요. Vite 가 빌드 시점에 `PROD` 를 리터럴 boolean 으로 치환하므로 Rollup 이 production 빌드에서 `if`/`await import()` 분기를 정적으로 제거합니다. `$app/environment` 의 `dev` 는 Rollup 이 tree-shake 할 수 없는 런타임 export 라 — 이를 쓰면 위젯 사슬이 production client 번들로 누출됩니다.

### Server handle (선택)

```ts
// src/hooks.server.ts
import { createAgentDevtoolsHandle } from '@agent-devtools/sveltekit/hooks';

export const handle = createAgentDevtoolsHandle();
```

이 hook 은 현재 passthrough 입니다. 향후 agent → SSR 기능 (per-request pairing token 주입, 첫 SSR paint 시 bootstrap config 방출) 의 바인딩 지점으로 존재합니다.

## 상태

fixed-mode `@agent-devtools/*` 릴리스 라인의 일부로 published. walker / picker / widget 은 `@agent-devtools/svelte` 에서 재사용되며, SvelteKit 고유 scaffolding 은 layout mount + server handle 입니다 — 검증된 표면은 `packages/sveltekit/src/**/*.test.ts` 참고.

## 라이선스

[MIT](https://github.com/Seungwoo321/agent-devtools/blob/main/LICENSE) © Seungwoo Lee
