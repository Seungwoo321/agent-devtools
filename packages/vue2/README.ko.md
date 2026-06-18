[English](./README.md) · [한국어]

# @agent-devtools/vue2

> [agent-devtools](https://github.com/Seungwoo321/agent-devtools) 의 Vue 2 어댑터. 아직 Vue 2 를 쓰는 호스트 앱을 위해 플로팅 채팅 위젯, DOM picker, Vue 2.7 컴포넌트 트리 walker 를 제공합니다.

[![npm](https://img.shields.io/npm/v/@agent-devtools/vue2.svg)](https://www.npmjs.com/package/@agent-devtools/vue2)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/Seungwoo321/agent-devtools/blob/main/LICENSE)

**개발 전용.** mount 진입점은 `NODE_ENV === 'production'` 일 때 실행을 거부합니다. 번들러 통합 (Vite, Nuxt 2 모듈) 은 production 빌드에서 import 를 추가로 제거합니다 — [`dev-only-guard`](https://github.com/Seungwoo321/agent-devtools/blob/main/.claude/rules/dev-only-guard.md) 참조.

## 이 어댑터가 제공하는 것

- **DOM → component 브리지** — `element.__vue__` (Vue 2 가 element 마다 소유 인스턴스로 거는 back-reference). Vue 3 의 `__vueParentComponent` 와 다른 표면이라, 이 walker 레이어는 Vue 3 것과 호환되지 않습니다.
- **Ancestor walker** — `$parent` 체인을 leaf-first 로 따라가며 정체성 (`$options.name` / `$options.__file`) 이 잡히는 인스턴스만 yield 하고, depth 10 에서 cap 합니다.
- **Source 추출** — `vue-template-compiler` SFC 출력의 `$options.__file` (dev 모드에서 `@vitejs/plugin-vue2`). workspace 기준 상대 경로로 정규화됩니다.
- **Component name** — `$options.name` → `$options.__file` 의 basename → `'Unknown'`.
- **Widget UI** — `@agent-devtools/widget-core` shell. Vue 2 의존성은 widget 번들로 새지 않습니다.
- **재사용처** — `@agent-devtools/nuxt2` 가 이 walker 를 직접 import 합니다.

Peer 범위: `vue >= 2.7` (이전 Vue 2 라인은 `$options.__file` 을 안정적으로 설정하지 않았습니다).

## 설치

```bash
pnpm add -D @agent-devtools/vue2
```

## 사용

```ts
// import.meta.env.DEV 로 게이트된 dev 전용 진입점 (예: main.dev.ts) 에서
import { mountAgentDevtoolsVue2 } from '@agent-devtools/vue2';

mountAgentDevtoolsVue2();
```

Nuxt 2 호스트에서는 dev 전용 client plugin 을 등록하는 `@agent-devtools/nuxt2` 를 사용하세요.

## 상태

고정 모드 `@agent-devtools/*` 릴리스 라인의 일부로 published. walker, picker, widget, Vite 플러그인 통합이 모두 갖춰져 있습니다 — 검증된 표면은 `packages/vue2/src/**/*.test.ts` 를 참조하세요.
