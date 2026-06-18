[English](./README.md) · [한국어]

# @agent-devtools/svelte

> [agent-devtools](https://github.com/Seungwoo321/agent-devtools) 의 Svelte 4/5 어댑터. 위젯을 closed Shadow DOM 에 mount 하고, 컴파일러의 `__svelte_meta` 를 읽어 picked 컴포넌트를 식별합니다.

[![npm](https://img.shields.io/npm/v/@agent-devtools/svelte.svg)](https://www.npmjs.com/package/@agent-devtools/svelte)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/Seungwoo321/agent-devtools/blob/main/LICENSE)

> Dev 전용. mount 엔트리는 `NODE_ENV === 'production'` 에서 실행을 거부합니다. 번들러 통합 (Vite, SvelteKit) 이 production 빌드에서 import 를 추가로 제거합니다 — [`dev-only-guard`](https://github.com/Seungwoo321/agent-devtools/blob/main/.claude/rules/dev-only-guard.md) 참고.

## 기능

- **DOM → source bridge** — `readSvelteMeta` 가 `element.__svelte_meta.loc.{ file, line, column }` 을 읽습니다. Svelte 컴파일러가 dev 모드에서 모든 DOM element 에 이 메타데이터를 부착합니다. 트리 walk 가 필요 없습니다 — picked element 가 이미 자기 source 를 들고 있습니다.
- **Component name** — `deriveComponentName`: `.svelte` 파일 경로의 basename (`src/Counter.svelte` → `Counter`), 없으면 `'Unknown'` 으로 fallback.
- **Ancestor chain** — `walkComponentAncestors` 가 DOM `parentElement` 사슬을 leaf-first 로 따라가며 서로 다른 `__svelte_meta.loc.file` 엔트리를 수집합니다. depth 10 으로 제한됩니다.
- **Source 추출** — `resolveSourceFromMeta` 는 DOM bridge 로 거저 얻어집니다. `file` 은 workspace-normalised (`/@fs/` 제거, `file://` decode, `?t=<bust>` 제거) 되고, `line` 과 `column` 은 그대로 통과합니다.
- **`mountAgentDevtoolsSvelte`** — launcher, composer, settings 위젯을 `@agent-devtools/widget-core` 셸을 통해 closed Shadow DOM 안에 mount 합니다. 위젯이 Svelte 의 reactivity 시스템을 건드리지 않습니다.
- **Production 가드** — `mountAgentDevtoolsSvelte` 가 `NODE_ENV === 'production'` 에서 throw 합니다.
- **재사용처** — `@agent-devtools/sveltekit` 가 이 walker 를 직접 import 합니다.

cross-adapter 계약은 [picker-strategy.md](https://github.com/Seungwoo321/agent-devtools/blob/main/.claude/rules/picker-strategy.md) 참고.

## 설치

```bash
pnpm add -D @agent-devtools/svelte
```

Peer dependency: `svelte ^4.0.0 || ^5.0.0` (`__svelte_meta` shape 은 Svelte 4 와 Svelte 5 dev 빌드 전반에서 안정적입니다).

## 사용법

```ts
// In a dev-only entry, e.g. src/main.dev.ts gated by import.meta.env.DEV
import { mountAgentDevtoolsSvelte } from '@agent-devtools/svelte';
mountAgentDevtoolsSvelte();
```

walker 는 Svelte 컴파일러가 모든 DOM element 에 부착하는 dev 전용 메타데이터 `element.__svelte_meta.loc.{file,line,column}` 을 읽습니다. componentName 은 `.svelte` 파일의 basename 에서 derive 됩니다 (예: `Counter.svelte` → `Counter`).

SvelteKit 호스트에서는 dev-only handle hook 을 등록하는 `@agent-devtools/sveltekit` 를 사용하세요.

## 상태

fixed-mode `@agent-devtools/*` 릴리스 라인의 일부로 published. walker, picker, widget, Vite-plugin 통합이 모두 구현됨 — 검증된 표면은 `packages/svelte/src/**/*.test.ts` 참고.

## 라이선스

[MIT](https://github.com/Seungwoo321/agent-devtools/blob/main/LICENSE) © Seungwoo Lee
