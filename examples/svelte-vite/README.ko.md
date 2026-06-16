[English](./README.md) · [한국어]

# @agent-devtools/example-svelte-vite

`@agent-devtools/svelte` 의 종단(end-to-end) 스모크. 프레임워크 인지형 Vite 플러그인을 통해 floating 위젯을 마운트하는 최소 Vite 8 + Svelte 5 앱이다.

## 구성

- `src/App.svelte` — `<Counter />` 자식 하나만 두는 루트 컴포넌트.
- `src/lib/Counter.svelte` — picker 대상. `describePickedSvelte` 가 `__svelte_meta` 를 읽고 컴포넌트 ancestor 체인을 거슬러 올라가 소스 `.svelte` 파일을 해석한다.
- `vite.config.ts` — `@sveltejs/vite-plugin-svelte` 와 나란히 `agentDevtools({ framework: 'svelte' })` 를 연결한다.

## 실행

```bash
pnpm install
pnpm --filter @agent-devtools/example-svelte-vite dev
```

dev 서버는 `http://127.0.0.1:3203` 에서 수신한다. 위젯은 오른쪽 아래 모서리에 나타나며, bootstrap script 태그는 `@agent-devtools/vite` 가 `framework: 'svelte'` 로 주입한다.

## 프로덕션 누수 없음 스모크

```bash
pnpm --filter @agent-devtools/example-svelte-vite build:check
```

`build:check` 는 `vite build` 다음 `scripts/check-no-leak.mjs` 를 실행한다. 누수 검사는 어떤 위젯 체인 식별자 (`mountAgentDevtools`, `mountAgentDevtoolsSvelte`, `describePickedSvelte`, `walkComponentAncestors` 등) 도 프로덕션 `dist/` 번들에 나타나는 것을 금지한다. Vite 플러그인은 `apply: 'serve'` 를 선언하므로 `vite build` 동안 실행되지 않는다. 따라서 bootstrap script 태그가 프로덕션 HTML 에서 빠진다. 혹시라도 Layer 1 이 우회되면, Layer 2 backstop 으로 `mountAgentDevtoolsSvelte` 가 `NODE_ENV === 'production'` 일 때 throw 한다.
