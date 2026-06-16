[English](./README.md) · [한국어]

# @agent-devtools/nuxt

> [agent-devtools](https://github.com/Seungwoo321/agent-devtools) 의 Nuxt 3 모듈. 개발 모드에서는 모든 클라이언트 렌더에 플로팅 위젯을 마운트하고, production 빌드에는 참여하지 않습니다.

[![npm](https://img.shields.io/npm/v/@agent-devtools/nuxt.svg)](https://www.npmjs.com/package/@agent-devtools/nuxt)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/Seungwoo321/agent-devtools/blob/main/LICENSE)

**개발 전용.** 이 모듈은 `nuxt build` / `nuxt generate` 산출물에서 절대 실행되지 않습니다. [2-layer dev-only guard](https://github.com/Seungwoo321/agent-devtools/blob/main/.claude/rules/dev-only-guard.md) 의 Nuxt 측 wiring 입니다.

## 이 어댑터가 제공하는 것

- **Walker 재사용** — `__vueParentComponent` 를 통한 DOM → component, `.parent` walk, `__file` source 추출은 `@agent-devtools/vue` 에 위임합니다. 중복 walker 코드는 여기에 없습니다.
- **Module setup** — `defineNuxtModule` 의 `setup` 이 `nuxt.options.dev` 를 읽습니다. `nuxt build` / `nuxt generate` 에서는 `addPlugin` 이 호출되기 전에 return 하므로 widget chain 이 번들 그래프에 아예 들어오지 않습니다 (Layer 1).
- **Client plugin** — `addPlugin({ src, mode: 'client' })` 로 등록됩니다. 첫 클라이언트 렌더에서 plugin 이 `mountAgentDevtoolsVue` 를 정확히 한 번 호출합니다. Vue 어댑터는 `NODE_ENV === 'production'` 이면 throw 합니다 (Layer 2).
- **Route attachment** — client plugin 이 `$router.currentRoute.value.matched` 의 leaf record 를 읽어 그 `components.default.__file` (@vitejs/plugin-vue 가 SFC 에 stamp 한 `pages/**/*.vue` 경로) 을 `pageContext.route.routeFile` 로 전달합니다. 덕분에 에이전트가 `pages/` 를 grep 하지 않고도 현재 화면을 정의한 정확한 파일을 알 수 있습니다.
- **No transpile workaround** — Nuxt 3 의 Vite 기반 빌드는 widget chain ESM 을 네이티브로 resolve 합니다. chain 을 `build.transpile` 에 추가해야 하는 `@agent-devtools/nuxt2` 와 비교됩니다.
- **Widget UI** — `@agent-devtools/widget-core` shell.

Peer 범위: `nuxt >= 3`, `vue >= 3`.

## 설치

```bash
pnpm add -D @agent-devtools/nuxt @agent-devtools/vue
```

## 설정

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@agent-devtools/nuxt'],
});
```

모듈은 `nuxt.options.dev` 를 읽습니다. production 빌드에서는 `addPlugin` 이 호출되기 전에 `setup` 함수가 즉시 return 합니다 — widget chain (`@agent-devtools/vue` → `@agent-devtools/widget-core` → `@agent-devtools/core`) 이 번들러에 의해 resolve 되지 않습니다.

## 옵션

```ts
export default defineNuxtConfig({
  modules: ['@agent-devtools/nuxt'],
  agentDevtools: {
    enabled: true,
  },
});
```

| 키        | 타입      | 기본값 | 설명                                                                       |
| --------- | --------- | ------ | -------------------------------------------------------------------------- |
| `enabled` | `boolean` | `true` | 모듈을 제거하지 않고 dev 모드 주입만 비활성화. production 은 그대로 no-op. |

## 동작 방식

1. **빌드 시점** — `defineNuxtModule` setup 이 `nuxt.options.dev` 를 검사합니다. dev 전용 client plugin 은 `addPlugin({ src, mode: 'client' })` 로 등록됩니다. production 은 `addPlugin` 에 도달하지 않습니다.
2. **런타임** — 등록된 plugin 이 `mountAgentDevtoolsVue` 를 import 해서 첫 클라이언트 렌더에 한 번 호출합니다. Vue 어댑터는 `NODE_ENV === 'production'` 이면 throw 합니다 (Layer 2 fail-loud guard).

## 회귀 가드

`examples/nuxt` 는 production `.output/` 트리를 훑어서 widget chain 심볼 (예: `mountAgentDevtoolsVue`, `createDefaultTransport`, `StreamSilentError`, `getFiberForElement`, `pumpToSse`) 이 어디에도 등장하지 않음을 단언하는 `smoke:no-leak` 스크립트를 함께 갖습니다. `pnpm --filter @agent-devtools/example-nuxt build:check` 로 빌드 + 검증을 한 번에 실행합니다. 검사는 의도적으로 substring 이 아닌 symbol 기반이라 example 앱의 `<code>@agent-devtools/nuxt</code>` 같은 사용자 작성 문서 문자열은 false positive 가 되지 않습니다. (참고: `__reactFiber$` 는 모든 React production 번들에 들어가는 React DOM 내부 심볼이므로, React 와 공존하는 어댑터에서 false positive 를 피하기 위해 금지 목록에서 제외됩니다.)

[`.claude/rules/adapter-discipline.md`](https://github.com/Seungwoo321/agent-devtools/blob/main/.claude/rules/adapter-discipline.md) 의 어댑터 간 공통 shape 과 [`.claude/rules/dev-only-guard.md`](https://github.com/Seungwoo321/agent-devtools/blob/main/.claude/rules/dev-only-guard.md) 의 2-layer 계약도 함께 참조하세요.
