[English](./README.md) · [한국어]

# @agent-devtools/nuxt2

> [agent-devtools](https://github.com/Seungwoo321/agent-devtools) 의 Nuxt 2 모듈. `@agent-devtools/vue2` 의 `mountAgentDevtoolsVue2` 를 호출하는 dev 전용 client plugin 을 등록하여, 레거시 Nuxt 2 호스트가 별도의 진입점 wiring 없이 플로팅 채팅 위젯을 갖게 합니다.

[![npm](https://img.shields.io/npm/v/@agent-devtools/nuxt2.svg)](https://www.npmjs.com/package/@agent-devtools/nuxt2)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/Seungwoo321/agent-devtools/blob/main/LICENSE)

## 이 어댑터가 제공하는 것

- **Walker 재사용** — `__vue__` 를 통한 DOM → component, `$parent` walk, `$options.__file` source 추출은 `@agent-devtools/vue2` 에 위임합니다. 중복 walker 코드는 여기에 없습니다.
- **Module signature** — Nuxt 2 모듈 형태 (`function (moduleOptions) { this.addPlugin(...) }`). `modules` 에 한 줄 entry.
- **Build-time guard (Layer 1)** — `setup` 이 `this.options.dev === false` 일 때 short-circuit 합니다. `nuxt build` / `nuxt generate` 동안 `addPlugin` 에 도달하지 않습니다.
- **Runtime guard (Layer 2)** — 자동 등록되는 client plugin 이 `mountAgentDevtoolsVue2` 를 import 하고, 이는 `NODE_ENV === 'production'` 에서 throw 합니다.
- **Client-only registration** — `mode: 'client'` 라 widget chain 이 SSR 번들에서 평가되지 않습니다.
- **Webpack 4 transpile** — Nuxt 2 는 `node_modules` 가 babel-loader 에서 제외된 webpack 4 를 씁니다. 호스트는 widget chain 을 `build.transpile` 에 나열해야 합니다 (아래 예시 참조). 더 새로운 Nuxt 메이저는 필요 없습니다 — Nuxt 2 만 해당.
- **Widget UI** — `@agent-devtools/widget-core` shell.

Peer 범위: `nuxt >= 2.15`, `vue >= 2.7`.

## 기능

- **Module form** — Nuxt 2 모듈 시그니처 (`function (moduleOptions) { this.addPlugin(...) }`) 를 구현하므로, 추가는 `modules: ['@agent-devtools/nuxt2']` 한 줄 entry 입니다.
- **Layer 1 build-time guard** — 모듈의 setup 함수가 `this.options.dev === false` 일 때 short-circuit 합니다. `nuxt build` / `nuxt generate` 동안 `addPlugin` 에 도달하지 않으므로 runtime plugin 파일이 production 그래프에 들어가지 않습니다.
- **Layer 2 runtime guard** — 자동 등록되는 client plugin 이 `mountAgentDevtoolsVue2` 를 import 하고, 이는 `NODE_ENV === 'production'` 에서 throw 합니다. Layer 1 이 우회되어도 widget 은 mount 를 거부합니다.
- **No SSR requirement** — plugin 이 `mode: 'client'` 로 등록되므로 widget chain 이 서버 번들에서 평가되지 않습니다.

## 설치

```bash
pnpm add -D @agent-devtools/nuxt2 @agent-devtools/vue2
```

Peer dependencies: `nuxt >= 2.15.0`, `vue >= 2.7.0`.

## 사용

```js
// nuxt.config.js
export default {
  modules: ['@agent-devtools/nuxt2'],
};
```

이게 통합의 전부입니다. `nuxt dev` 를 실행하면 우하단에 플로팅 launcher 가 나타납니다.

### Production 빌드

`nuxt build` 와 `nuxt generate` 는 Layer 1 guard 덕분에 widget 을 통째로 건너뜁니다. example smoke (`examples/nuxt2/scripts/check-no-leak.mjs`) 는 `.nuxt/dist/client` 와 `.nuxt/dist/server` 를 모두 스캔해 widget chain 심볼이 0 개 새지 않았음을 단언합니다.

### Webpack 4 transpile 노트

Nuxt 2 는 webpack 4 + babel-loader 를 쓰며 기본적으로 `node_modules` 를 transpile 에서 제외합니다. widget chain 은 `marked` 를 끌어들이는데, 이는 webpack 4 가 네이티브로 파싱하지 못하는 최신 문법 (nullish coalescing, optional chaining, class fields) 을 씁니다. 어댑터들을 `build.transpile` 에 나열하세요:

```js
// nuxt.config.js
export default {
  modules: ['@agent-devtools/nuxt2'],
  build: {
    transpile: [
      '@agent-devtools/nuxt2',
      '@agent-devtools/vue2',
      '@agent-devtools/widget-core',
      '@agent-devtools/core',
      'marked',
    ],
  },
};
```

## 보안 기본값

- **Layer 1 build-time guard** — `nuxt build` / `nuxt generate` 는 `addPlugin` 이 호출되기 전에 short-circuit 합니다.
- **Layer 2 runtime guard** — `mountAgentDevtoolsVue2` 는 `NODE_ENV === 'production'` 에서 throw 합니다.
- **Client-only plugin** — runtime plugin 이 `mode: 'client'` 로 등록되므로 widget chain 이 `vue-server-renderer` 에 도달하지 않습니다.
- **Closed Shadow DOM** — host CSS, host event, host Vue 2 트리가 widget 밖에 머무릅니다.
- **Pairing-token bearer 인증** — transport 가 `http://127.0.0.1:4317` 루프백에 대해 `Authorization: Bearer <token>` 을 동봉합니다. 토큰은 URL 에 기록되지 않습니다.

## 요구 사항

- Node.js `>= 22.13.0`
- Nuxt `>= 2.15.0`, Vue `>= 2.7.0`

## 관련 링크

- 모노레포: <https://github.com/Seungwoo321/agent-devtools>
- Vue 2 어댑터: [`@agent-devtools/vue2`](https://www.npmjs.com/package/@agent-devtools/vue2)
- Core 패키지: [`@agent-devtools/core`](https://www.npmjs.com/package/@agent-devtools/core)
- 이슈 트래커: <https://github.com/Seungwoo321/agent-devtools/issues>

## 라이선스

[MIT](https://github.com/Seungwoo321/agent-devtools/blob/main/LICENSE) © Seungwoo Lee
