[English](./README.md) · [한국어]

# @agent-devtools/nuxt

[agent-devtools](https://github.com/Seungwoo321/agent-devtools) 의 Nuxt 3 모듈. 개발 모드에서는 모든 클라이언트 렌더에 플로팅 위젯을 마운트하고, production 빌드에는 참여하지 않습니다.

> **개발 전용.** 이 모듈은 `nuxt build` / `nuxt generate` 산출물에서 절대 실행되지 않습니다. [2-layer dev-only guard](https://github.com/Seungwoo321/agent-devtools/blob/main/.claude/rules/dev-only-guard.md) 의 Nuxt 측 wiring 입니다.

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

모듈은 `nuxt.options.dev` 를 읽습니다. production 빌드에서는 `addPlugin` 이 호출되기 전에 `setup` 함수가 즉시 return 합니다 — widget chain (`@agent-devtools/vue` → `@agent-devtools/react`) 이 번들러에 의해 resolve 되지 않습니다.

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

`examples/nuxt` 는 production `.output/` 트리를 훑어서 widget chain 심볼 (`mountAgentDevtoolsVue`, `createDefaultTransport`, `StreamSilentError`, `getFiberForElement`, `pumpToSse` 등) 이 어디에도 등장하지 않음을 단언하는 `smoke:no-leak` 스크립트를 함께 갖습니다. `pnpm --filter @agent-devtools/example-nuxt build:check` 로 빌드 + 검증을 한 번에 실행합니다. 검사는 의도적으로 substring 이 아닌 symbol 기반이라 example 앱의 `<code>@agent-devtools/nuxt</code>` 같은 사용자 작성 문서 문자열은 false positive 가 되지 않습니다. (참고: `\_\_reactFiber

는 모든 React production 번들에 들어가는 React DOM 내부 심볼이므로 React 와 공존하는 어댑터의 false positive 를 피하기 위해 금지 목록에서 제외됩니다.)

[`.claude/rules/adapter-discipline.md`](https://github.com/Seungwoo321/agent-devtools/blob/main/.claude/rules/adapter-discipline.md) 의 어댑터 간 공통 shape 과 [`.claude/rules/dev-only-guard.md`](https://github.com/Seungwoo321/agent-devtools/blob/main/.claude/rules/dev-only-guard.md) 의 2-layer 계약도 함께 참조하세요.
