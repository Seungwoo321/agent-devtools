[English](./README.md) · [한국어]

# @agent-devtools/example-next-pages

`@agent-devtools/next-pages` 의 종단(end-to-end) 스모크. App Router 로 마이그레이션하지 않은 레거시 호스트에서도 wrapper 가 동작함을 검증하기 위해, 어댑터 지원 범위의 하단인 Next 14 / React 18 을 타깃한다.

## 구성

- `pages/_app.tsx` — 호스트 프로젝트가 `@agent-devtools/next-pages/bootstrap` 을 건드리는 유일한 곳. `useEffect` 안에서 `bootstrapAgentDevtools()` 를 호출한다. 이 helper 는 라우트 변경에 걸쳐 idempotent 하므로, 같은 클라이언트 세션 내에서 반복 호출은 무시된다.
- `pages/index.tsx` / `pages/about.tsx` — picker 대상. 모든 라우트가 `pages/` 아래에 있으며 App Router 경계는 없다. 이들 간 클라이언트 사이드 내비게이션 동안 위젯은 마운트된 상태를 유지한다.
- `next.config.mjs` — `withAgentDevtools` 로 config 를 감싸, dev 서버가 pairing 토큰 + base URL 을 전파하도록 한다.

## 실행

```bash
pnpm install
pnpm --filter @agent-devtools/example-next-pages dev
```

dev 서버는 `http://127.0.0.1:3101` 에서 수신 대기한다. 위젯은 우하단 모서리에 나타난다. bootstrap helper 는 `pages/_app.tsx` 에서 호출되며 `/about` 으로의 클라이언트 사이드 내비게이션과 복귀에 걸쳐 유지된다. agent 서버 자체는 `127.0.0.1:4317` 에서 실행 중이어야 한다 (`AGENT_DEVTOOLS_BASE_URL` 로 설정 가능).

## 프로덕션 누수 없음 스모크

```bash
pnpm --filter @agent-devtools/example-next-pages build:check
```

`build:check` 는 프로덕션 빌드를 수행한 뒤 `scripts/check-no-leak.mjs` 를 실행한다. 이 스크립트는 `.next/static/` 과 `.next/server/` 아래 모든 텍스트 파일을 grep 하여 위젯 체인 심볼을 찾는다. 무언가 누수되면 CI 가 이 예제를 실패시킨다. 두 layer 가 이를 보호한다:

- **Layer 1 (build-time).** `next.config.mjs` 는 `@agent-devtools/next-pages` 의 `withAgentDevtools` 로 감싸진다. 프로덕션 빌드에서 wrapper 는 `@agent-devtools/{react,core,harness-core}` 를 `false` 로 매핑하는 webpack alias 를 설치하므로, 위젯 체인은 프로덕션 그래프에 절대 진입하지 않는다. `bootstrapAgentDevtools` shim 의 첫 statement 는 `NODE_ENV === 'production'` 검사이며, Next 의 webpack DefinePlugin 이 이를 inline 하여 minifier 가 나머지를 도달 불가로 증명한다.
- **Layer 2 (runtime).** `mountAgentDevtoolsNextPages` 는 `NODE_ENV === 'production'` 일 때 throw 하여, Layer 1 이 우회되더라도 계약을 방어한다.

서버 렌더링 페이지(`getServerSideProps`, `getStaticProps`)는 영향을 받지 않는다 — bootstrap helper 는 클라이언트에서 `useEffect` 안에서만 실행된다.
