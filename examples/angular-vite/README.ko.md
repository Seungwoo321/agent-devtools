[English](./README.md) · [한국어]

# @agent-devtools/example-angular-vite

`@agent-devtools/angular` 의 종단(end-to-end) 스모크. `@analogjs/vite-plugin-angular` 를 통해 Vite 가 서빙하는 최소 standalone Angular 20 앱이다. framework-aware vite 플러그인이 `package.json` 으로부터 Angular 를 자동 감지하고 floating 위젯을 마운트한다.

## 구성

- `src/app/app.component.ts` — 루트 standalone 컴포넌트.
- `src/app/counter.component.ts` — picker 대상. Angular 어댑터는 DOM ancestor 를 따라가 Ivy 의 `window.ng.getOwningComponent` debug API 를 질의해 `CounterComponent` 클래스를 해석한다.
- `vite.config.ts` — `@analogjs/vite-plugin-angular` 와 함께 `agentDevtools({ framework: 'angular' })` 를 연결한다.

## 실행

```bash
pnpm install
pnpm --filter @agent-devtools/example-angular-vite dev
```

dev 서버는 `http://127.0.0.1:3202` 에서 수신 대기한다. agent 서버 또한 `127.0.0.1:4317` 에서 실행 중일 때 방문한다 (Vite 플러그인이 기본값으로 자동 spawn 한다).

## 프로덕션 누수 없음 스모크

```bash
pnpm --filter @agent-devtools/example-angular-vite build:check
```

`build:check` 는 `vite build` 를 실행한 뒤 `scripts/check-no-leak.mjs` 를 실행한다. leak check 는 어떤 위젯 체인 식별자(`mountAgentDevtools`, `describePickedAngular`, `walkComponentAncestors` 등)도 프로덕션 `dist/` 번들에 등장하는 것을 금지한다. Vite 플러그인은 `apply: 'serve'` 를 선언하므로 `vite build` 중에는 실행되지 않는다. 따라서 bootstrap script 태그가 프로덕션 HTML 에 없으며, 위젯 체인은 번들러에 의해 해석되지 않는다.
