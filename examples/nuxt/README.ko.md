[English](./README.md) · [한국어]

# @agent-devtools/example-nuxt

`@agent-devtools/nuxt` 의 종단(end-to-end) 스모크. Nuxt 모듈을 통해 floating 위젯을 마운트하는 최소 Nuxt 3 호스트 앱이다.

## 구성

- `app.vue` — `<Counter />` 자식 하나를 가진 루트 컴포넌트.
- `components/Counter.vue` — picker 대상. Vue walker 가 picker chip 을 `components/Counter.vue` 로 해석한다.
- `nuxt.config.ts` — `modules` 에 `@agent-devtools/nuxt` 를 등록한다. 모듈의 setup hook 은 dev 에서만 런타임 플러그인을 주입한다.

## 실행

```bash
pnpm install
pnpm --filter @agent-devtools/example-nuxt dev
```

dev 서버는 `http://127.0.0.1:3300` 에서 수신 대기한다. floating launcher 가 우하단 모서리에 나타난다. picker → `Increment` 버튼 클릭 → picker chip 이 `components/Counter.vue` 로 해석된다. agent 서버 자체는 `127.0.0.1:4317` 에서 실행 중이어야 한다.

## 프로덕션 누수 없음 스모크

```bash
pnpm --filter @agent-devtools/example-nuxt build
grep -RhE 'attachShadow\(\{mode:"closed"|AGENT_DEVTOOLS_OPEN_SHADOW|agent-devtools-launcher' .output/ 2>/dev/null | wc -l
# expected: 0
```

위젯 마운트 체인(`@agent-devtools/nuxt` → `@agent-devtools/vue` → `@agent-devtools/react` 위젯 UI)은 `.output/` 에 등장해서는 안 된다. 두 layer 가 이를 보호한다:

- **Layer 1 (build-time).** `packages/nuxt/src/index.ts` setup hook 이 `nuxt.options.dev` 를 검사한다. 프로덕션 빌드는 `addPlugin` 에 도달하기 전에 단락(short-circuit)되므로, 런타임 플러그인 파일은 프로덕션 빌드 그래프에 의해 import 되지 않는다.
- **Layer 2 (runtime).** `@agent-devtools/vue` 의 `mountAgentDevtoolsVue` 는 `NODE_ENV === 'production'` 일 때 throw 한다. Layer 1 이 우회되더라도 런타임 가드가 fail loud 한다.

단순한 `grep '@agent-devtools' .output/` 은 tree-shake 되는 문자열 리터럴을 통한 call-site 참조에 매치될 수 있다. 위 widget-execution fingerprint grep 이 권위 있는 no-leak 검사다.
