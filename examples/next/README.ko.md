[English](./README.md) · [한국어]

# @agent-devtools/example-next

`@agent-devtools/next` 의 종단(end-to-end) 스모크. App Router 와 Pages Router 통합 경로를 모두 시연한다.

## 구성

- `app/` — App Router. `layout.tsx` 가 클라이언트 컴포넌트 `agent-devtools.tsx` 를 마운트하며, 이 컴포넌트는 `useEffect` 안에서 `bootstrapAgentDevtools()` 를 호출한다.
- `pages/hello.tsx` — Pages Router. 페이지 컴포넌트에서 `bootstrapAgentDevtools()` 를 직접 호출한다.
- `next.config.ts` — `withAgentDevtools` 로 config 를 감싸, dev 서버가 Next 의 `env` 필드를 통해 pairing 토큰 + base URL 을 전파하도록 한다.

## 실행

```bash
pnpm install
pnpm --filter @agent-devtools/example-next dev
```

dev 서버는 `http://127.0.0.1:3100` 에서 수신 대기한다. App Router 스모크는 `/`, Pages Router 스모크는 `/hello` 를 방문한다. agent 서버 자체는 `127.0.0.1:4317` 에서 실행 중이어야 한다 (`AGENT_DEVTOOLS_BASE_URL` 로 설정 가능).

## 프로덕션 누수 없음 스모크

```bash
pnpm --filter @agent-devtools/example-next build
grep -rE 'attachShadow\(\{mode:"closed"|AGENT_DEVTOOLS_OPEN_SHADOW|agent-devtools-launcher' .next/static
```

위 widget-execution grep 은 반드시 0 건을 반환해야 한다. 두 layer 가 이를 보호한다:

- **Layer 1 (build).** `withAgentDevtools` 는 프로덕션 클라이언트 빌드에서 `@agent-devtools/react`, `@agent-devtools/core`, `@agent-devtools/harness-core` 를 `false` 로 매핑하는 webpack alias 를 설치한다. picker, composer, launcher, closed-shadow 위젯 마운트를 담은 체인이 빈 모듈로 치환된다. 작은 `@agent-devtools/next/bootstrap` shim 은 의도적으로 유지되어, 사용자 측 `bootstrapAgentDevtools()` 호출이 런타임에 실제(no-op) 함수로 해석되게 한다.
- **Layer 2 (runtime).** bootstrap shim 은 `NODE_ENV === 'production'` 일 때 단락(short-circuit)되며, 기저의 `mountAgentDevtools` 는 프로덕션 빌드에서 어떻게든 도달될 경우 throw 한다.

단순한 `grep -r '@agent-devtools' .next/static` 은 심볼에 대한 문자열 참조를 찾아낸다 (대상이 빈 모듈로 해석되는 call site 들, 그리고 `/hello` 의 JSX `<code>` 텍스트에 구워진 `bootstrapAgentDevtools` 식별자). 이 참조들은 실행 가능한 위젯 로직을 담지 않는다 — Layer 2 가드 자체와 사용자 콘텐츠일 뿐이다. 위 grep 은 위젯 실행 지문(fingerprint)만 겨냥한다.
