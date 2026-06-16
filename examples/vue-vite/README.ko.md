[English](./README.md) · [한국어]

# @agent-devtools/example-vue-vite

`@agent-devtools/vue` 의 종단(end-to-end) 스모크. 프레임워크 인지형 Vite 플러그인을 통해 floating 위젯을 마운트하는 최소 Vite + Vue 3 앱이다.

## 구성

- `src/App.vue` — `<Counter />` 자식 하나만 두는 루트 컴포넌트.
- `src/components/Counter.vue` — picker 대상. `describePickedVue` 가 Vue 컴포넌트 인스턴스 체인을 거슬러 올라가 소스 `.vue` 파일을 해석한다.
- `vite.config.ts` — `@vitejs/plugin-vue` 와 나란히 `agentDevtools({ framework: 'vue' })` 를 연결한다.

## 실행

```bash
pnpm install
pnpm --filter @agent-devtools/example-vue-vite dev
```

dev 서버는 `http://127.0.0.1:3200` 에서 수신한다. 에이전트 서버도 `127.0.0.1:4317` 에서 함께 떠 있을 때 접속한다 (기본값으로 Vite 플러그인이 자동으로 spawn 한다).

## 프로덕션 누수 없음 스모크

```bash
pnpm --filter @agent-devtools/example-vue-vite build
grep -rE 'mountAgentDevtoolsVue|describePickedVue|attachShadow\(\{mode:"closed"|AGENT_DEVTOOLS_OPEN_SHADOW' dist
```

위 위젯 실행 코드 grep 은 반드시 0 건이어야 한다. Vite 플러그인은 `apply: 'serve'` 를 선언하므로 `vite build` 동안 실행되지 않는다. 따라서 bootstrap script 태그가 프로덕션 HTML 에서 빠지고, 위젯 체인은 번들러에 의해 해석조차 되지 않는다.

단순한 `grep -r '@agent-devtools' dist` 는 `App.vue` 가 렌더한 리터럴 `<code>@agent-devtools/vue</code>` 텍스트에 매치된다 — 이 문자열은 페이지 본문의 사용자 산문이지 위젯 코드가 아니다.
