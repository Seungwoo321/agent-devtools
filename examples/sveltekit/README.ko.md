[English](./README.md) · [한국어]

# @agent-devtools/example-sveltekit

`@agent-devtools/sveltekit` 의 종단(end-to-end) 스모크. dev 전용 `onMount` 호출을 통해 floating 위젯을 마운트하는, Node 어댑터가 붙은 Vite 8 기반 최소 SvelteKit 앱이다.

## 구성

- `src/routes/+page.svelte` — `<Counter />` 자식 하나만 두는 루트 route.
- `src/lib/Counter.svelte` — picker 대상. `describePickedSvelteKit` 가 `__svelte_meta` 를 읽고 컴포넌트 ancestor 체인을 거슬러 올라가 소스 `.svelte` 파일을 해석한다.
- `src/routes/+layout.svelte` — `import('@agent-devtools/sveltekit')` + `mountAgentDevtoolsSvelteKit()` 를 `if (import.meta.env.PROD) return` 뒤에 둔다. 따라서 호출 지점이 프로덕션 클라이언트 번들에서 tree-shake 되어 빠진다.
- `src/hooks.server.ts` — `createAgentDevtoolsHandle()` 을 passthrough 로 연결한다. 향후 서버 측 기능 (요청별 페어링 토큰 주입, SSR bootstrap 설정 emit) 의 바인딩 지점이다.
- `vite.config.ts` — `@sveltejs/kit/vite` 와 나란히 `agentDevtools({ framework: 'sveltekit' })` 를 연결하며, 이는 `@sveltejs/kit` 의존성을 자동 감지한다.

## 실행

```bash
pnpm install
pnpm --filter @agent-devtools/example-sveltekit dev
```

dev 서버는 `http://127.0.0.1:3204` 에서 수신한다. 위젯은 오른쪽 아래 모서리에 나타나며, bootstrap 은 `+layout.svelte` 의 dev 전용 `onMount` 에서 `@agent-devtools/sveltekit` 가 마운트한다.

## 프로덕션 누수 없음 스모크

```bash
pnpm --filter @agent-devtools/example-sveltekit build:check
```

`build:check` 는 `vite build` 다음 `scripts/check-no-leak.mjs` 를 실행한다. 이 스크립트는 `build/` 와 `.svelte-kit/output/` 의 모든 텍스트 파일을 grep 하여 어떤 위젯 체인 식별자 (`mountAgentDevtools`, `mountAgentDevtoolsSvelte`, `mountAgentDevtoolsSvelteKit`, `describePickedSvelte`, `describePickedSvelteKit`, `walkComponentAncestors` 등) 도 찾는다. Layer 1 (`if (import.meta.env.PROD) return` + 플러그인의 `apply: 'serve'`) 이 마운트 체인을 프로덕션 번들 밖으로 유지한다. 혹시라도 우회되면, Layer 2 backstop 으로 `mountAgentDevtoolsSvelteKit` 가 `NODE_ENV === 'production'` 일 때 throw 한다. 무언가라도 누수되면 CI 가 이 example 을 실패 처리한다.
