[English](./README.md) · [한국어]

# @agent-devtools/example-react-vite

`@agent-devtools/react` 의 종단(end-to-end) 스모크. framework-aware Vite 플러그인을 통해 floating 위젯을 마운트하는 최소 Vite + React 19 앱이다.

## 구성

- `src/App.tsx` — 루트 컴포넌트. picker 대상으로 `<OrderSummary />`, `<Counter />`, `<UserTable />`, `<ProfileCard />` 를 렌더링한다.
- `src/checkout/OrderSummary.tsx` — checkout 테이블 picker 대상. `describePicked` 가 React fiber 체인을 따라가 소스 `.tsx` 파일과 컴포넌트 이름을 해석한다.
- `vite.config.ts` — `@vitejs/plugin-react` 와 함께 `agentDevtools()` 를 연결한다. 플러그인은 호스트 플러그인으로부터 React 어댑터를 자동 감지한다.

## 실행

```bash
pnpm install
pnpm --filter @agent-devtools/example-react-vite dev
```

dev 서버는 `http://127.0.0.1:5173` 에서 수신 대기한다. agent 서버 또한 `127.0.0.1:4317` 에서 실행 중일 때 방문한다 (Vite 플러그인이 기본값으로 자동 spawn 한다).

## 프로덕션 누수 없음 스모크

```bash
pnpm --filter @agent-devtools/example-react-vite build
grep -rE 'mountAgentDevtools|describePicked|getFiberForElement|walkComponentAncestors' dist
```

위 widget-execution grep 은 반드시 0 건을 반환해야 한다. Vite 플러그인은 `apply: 'serve'` 를 선언하므로 `vite build` 중에는 실행되지 않는다. 따라서 bootstrap script 태그가 프로덕션 HTML 에 없으며, 위젯 체인은 번들러에 의해 해석조차 되지 않는다.

단순한 `grep -r '@agent-devtools' dist` 는 `App.tsx` 가 렌더링하는 리터럴 `agent-devtools` 텍스트에 매치된다 — 이 문자열은 페이지 본문의 사용자 prose 이지 위젯 코드가 아니다. `scripts/check-no-leak.mjs` 가드(`pnpm --filter @agent-devtools/example-react-vite build:check` 로 실행)는 정확한 위젯 체인 심볼에 대해 동일한 불변식을 강제한다.
