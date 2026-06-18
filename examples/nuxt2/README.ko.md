[English](./README.md) · [한국어]

# @agent-devtools/example-nuxt2

`@agent-devtools/nuxt2` 의 종단(end-to-end) 스모크. Nuxt 2 모듈을 통해 floating 위젯을 로드하는 최소 Nuxt 2.7 호스트 앱이다 (모듈이 첫 클라이언트 렌더 시 Vue 2 어댑터를 마운트한다). SPA 모드 (`ssr: false`, `target: 'static'`) 로 동작하는데, Nuxt 2 의 SSR 파이프라인이 pnpm 의 isolated install 이전 시대의 평탄한 `node_modules` 레이아웃에 의존하기 때문이다. 검증 대상인 위젯 주입 경로는 클라이언트에서만 동작하므로, SPA 모드가 우리가 신경 쓰는 표면을 정확히 실행한다.

## 구성

- `pages/index.vue` — `<Counter />` 자식 하나만 두는 루트 페이지.
- `components/Counter.vue` — picker 대상. picker 는 `components/Counter.vue` 로 해석되어야 한다.
- `nuxt.config.js` — `modules` 에 `@agent-devtools/nuxt2` 를 등록하고, SPA 모드 (`ssr: false`, `target: 'static'`) 와 dev 포트 `3301` 을 설정하며, `build.transpile` 에 위젯 체인을 나열하여 Nuxt 2 의 webpack 4 + babel-loader 가 그 모던 문법을 변환하도록 한다.

## 실행

```bash
pnpm --filter @agent-devtools/example-nuxt2 dev
```

`http://localhost:3301` 을 연다. floating 런처가 오른쪽 아래 모서리에 나타나야 한다. Picker → `Increment` 버튼 클릭 → picker chip 이 `components/Counter.vue` 로 해석되어야 한다.

## 프로덕션 누수 없음 스모크

```bash
pnpm --filter @agent-devtools/example-nuxt2 build
node examples/nuxt2/scripts/check-no-leak.mjs
# expected: OK: scanned N text file(s) across 2 bundle dir(s), no widget-chain symbols leaked.
```

`check-no-leak.mjs` 는 `.nuxt/dist/client` 와 `.nuxt/dist/server` 의 모든 텍스트 파일을 grep 하여 어떤 위젯 체인 식별자 (`mountAgentDevtools`, `mountAgentDevtoolsVue2`, `describePickedVue2`, `walkComponentAncestors` 등) 도 찾는다. Layer 1 (빌드 시점): Nuxt 2 모듈의 setup 은 `this.options.dev === false` 일 때 early-return 하므로 `addPlugin` 이 호출되지 않고 런타임 플러그인 파일이 프로덕션 빌드 그래프에 진입하지 않는다. Layer 2 (런타임): `@agent-devtools/vue2` 의 `mountAgentDevtoolsVue2` 가 `NODE_ENV === 'production'` 일 때 throw 하므로, Layer 1 이 우회되어도 fail loud 한다.

단순한 `grep '@agent-devtools' .nuxt/dist/` 는 tree-shake 되는 문자열 리터럴을 통한 호출 지점 참조에 매치될 수 있다. 심볼 지문(fingerprint) 스캔이 권위 있는 누수 없음 검사다.
