---
title: 어댑터별 컨텍스트 품질
description: 각 프레임워크 어댑터가 어떤 walker 전략을 쓰는지, source location 을 어떻게 해상하는지, 라우트 정보를 함께 싣는지, 그리고 어떤 다른 어댑터를 재사용하는지 한 페이지로.
---

agent-devtools 는 호스트 스택마다 어댑터를 한 패키지씩 둔다. 모든 어댑터는
같은 공개 계약을 따른다 ([`PickedEvidence`](./widget/) 모양과 `mount`
엔트리). 다만 **컨텍스트 품질** — 위젯이 프롬프트에 실어 보낼 수 있는 정보의
밀도 — 은 어댑터마다 다르다. 프레임워크가 노출하는 런타임 트리도, 컴파일러가
박아주는 디버그 메타데이터의 양도 서로 다르기 때문이다.

이 페이지는 출시된 어댑터들을 다음 네 축으로 정리한다:

- **Walker** — 어댑터가 DOM element 를 프레임워크의 컴포넌트 인스턴스로
  어떻게 다리 놓고, 어떻게 ancestor 를 따라 올라가는지.
- **Source resolution** — 컴포넌트 인스턴스에서
  workspace-relative `{ fileName, lineNumber }` 를 어떻게 뽑아내는지.
  추측보다 부재가 낫다는 정책은 [picker-coverage 룰][rule-coverage] 참조.
- **Route awareness** — 사용자가 현재 어느 라우트에 있는지를 에이전트에
  알릴 수 있는지 (있으면 에이전트가 `app/`, `pages/`, `src/routes/` 를
  좁혀서 grep 한다).
- **Reused adapters** — `workspace:*` 의존을 통해 어떤 다른 어댑터
  패키지를 재수출하는지.

모든 어댑터 walker 가 따라야 하는 정식 계약은
[`.claude/rules/picker-strategy.md`][rule-strategy] 에 있다. 세 가지
coverage 케이스 (named / unnamed host / pure DOM) 는
[`.claude/rules/picker-coverage.md`][rule-coverage], 패키지 모양 계약은
[`.claude/rules/adapter-discipline.md`][rule-discipline] 에 있다.

## react — `@agent-devtools/react`

| 축              | 실제 동작                                                                                                                                                                                                                                                                           |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Walker          | Fiber walker. element 의 own property `__reactFiber$<nonce>` (root 컨테이너는 `__reactContainer$<nonce>`) 로 DOM ↔ fiber 다리. ancestor 는 fiber 의 `.return` 사슬을 leaf-first 로 따라가며 host fiber 는 skip, 최대 깊이 10.                                                       |
| Source          | React ≤ 18 은 `fiber._debugSource` 가 있으면 그대로 사용. React 19 는 `_debugSource` 가 제거됐기 때문에 JSX 시점에 캡처된 `fiber._debugStack.stack` 을 V8 grammar 로 파싱해서 첫 non-React 프레임을 추출. 경로는 Vite 의 `?t=` 와 `/@fs/` 를 정리해서 workspace-relative 로 정규화. |
| Route awareness | 없음. React 자체는 라우팅을 책임지지 않는다.                                                                                                                                                                                                                                        |
| Reused adapters | 없음. React 계열 어댑터들이 재사용하는 base 어댑터.                                                                                                                                                                                                                                 |

## next — `@agent-devtools/next`

| 축              | 실제 동작                                                                                                                                                                                                                                                                                  |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Walker          | React fiber walker 를 그대로 재사용. Next 15 의 client component 는 같은 React fiber 트리를 그린다. `@agent-devtools/next` 는 `@agent-devtools/react` 의 `mountAgentDevtools` 를 re-export 하고, App Router 용 bootstrap 도우미 (`withAgentDevtools`, `bootstrapAgentDevtools`) 만 더한다. |
| Source          | React 경로. server component 자체는 client fiber 트리에 등장하지 않으므로 RSC 가 출력한 markup 을 picked 한 경우는 host-DOM-only evidence (selector + outerHTML + tagName) 로 떨어진다. 가짜 source 는 만들지 않는다 — [picker-coverage 룰][rule-coverage] 참조.                           |
| Route awareness | App Router 라우트 도우미는 차후 마일스톤 예정. 현재 어댑터는 picked element 에서 `app/`-스타일 라우트 파일을 직접 뽑지는 않는다. 에이전트는 URL 과 App Router 컨벤션으로 라우트를 추론할 수 있다.                                                                                          |
| Reused adapters | `@agent-devtools/react` (workspace 의존, React picker + mount 재수출).                                                                                                                                                                                                                     |

## next-pages — `@agent-devtools/next-pages`

| 축              | 실제 동작                                                                                                                                                                                                                                                                                                                    |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Walker          | React fiber walker 를 그대로 재사용. Pages Router 의 컴포넌트는 모두 일반 React client component 이므로 picker / walker 는 `@agent-devtools/react` 에서 그대로 가져온다. 어댑터는 `pages/_app.tsx` 용 bootstrap 도우미, `withAgentDevtools` 의 `next.config` 래퍼, Layer 2 의 NODE_ENV 런타임 가드를 더한다.                 |
| Source          | React 경로.                                                                                                                                                                                                                                                                                                                  |
| Route awareness | 있음. `resolveNextPagesRouteFile()` 가 `window.next.router.pathname` (예: `/blog/[slug]` 같은 dynamic-segment 형태) 을 읽고 확장자 없이 `pages${pathname}` 을 반환한다. 같은 라우트가 `.tsx`/`.jsx`/`.ts`/`.js`/`.mdx`/`.md` 중 어느 것으로 해상될지 런타임이 모르기 때문이다. 에이전트는 `pages${pathname}.*` 로 grep 한다. |
| Reused adapters | `@agent-devtools/react`.                                                                                                                                                                                                                                                                                                     |

## nuxt — `@agent-devtools/nuxt`

| 축              | 실제 동작                                                                                                                                                                                                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Walker          | Vue 3 의 vnode walker 를 그대로 재사용. Nuxt 3 모듈의 책임은 빌드 시 wiring 뿐 — `defineNuxtModule` setup 이 dev 모드일 때만 client-only 플러그인을 등록하고 production 에서는 setup 자체가 early return 한다. picker / walker / mount 는 전부 `@agent-devtools/vue` 에서 온다. |
| Source          | Vue 3 경로 — `@vitejs/plugin-vue` 가 박아주는 `__file` 을 쓰고 `lineNumber: 1` 로 고정한다. Vue 의 런타임이 태그별 라인 번호를 보존하지 않기 때문이다.                                                                                                                          |
| Route awareness | 어댑터에서는 아직 연결되지 않음. Nuxt 런타임은 `useRoute()` 와 `window.__NUXT__` 를 노출하지만, picker 가 `PickedEvidence` 에 route 정보를 붙이지는 않는다.                                                                                                                     |
| Reused adapters | `@agent-devtools/vue` (workspace 의존, `mountAgentDevtools` 를 `mountAgentDevtoolsVue` 로 재수출) + transport 도우미를 위한 `@agent-devtools/widget-core`.                                                                                                                      |

## nuxt2 — `@agent-devtools/nuxt2`

| 축              | 실제 동작                                                                                                                                                                                                                                                        |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Walker          | Vue 2 walker 를 그대로 재사용. Nuxt 2 모듈은 `@nuxt/kit` 이전 세대라 `ModuleContainer` 의 `this` 바인딩 위에서 `addPlugin` 을 duck-type 으로 호출한다. dev 모드에서 client-only 런타임 플러그인을 등록하고 production 에서는 plugin 호출 자체가 일어나지 않는다. |
| Source          | Vue 2 경로 — `vite-plugin-vue2` / `vue-template-compiler` 가 박아주는 `$options.__file` 을 쓰고 `lineNumber: 1` 로 고정.                                                                                                                                         |
| Route awareness | 어댑터에서는 연결되지 않음. Vue 2 인스턴스에서 `$route` 는 접근 가능하지만 `PickedEvidence` 에 route 정보를 첨부하지는 않는다.                                                                                                                                   |
| Reused adapters | `@agent-devtools/vue2` (workspace 의존, `mountAgentDevtools` 를 `mountAgentDevtoolsVue2` 로 재수출) + transport 도우미를 위한 `@agent-devtools/widget-core`.                                                                                                     |

## vue — `@agent-devtools/vue`

| 축              | 실제 동작                                                                                                                                                                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Walker          | Vnode walker. Vue 3.2+ 가 모든 렌더된 host node 에 non-enumerable property `__vueParentComponent` 를 박아준다. 이걸로 DOM ↔ 인스턴스 다리. ancestor 는 인스턴스의 `.parent` 사슬.                                                           |
| Source          | `instance.type.__file` (dev 모드에서 `@vitejs/plugin-vue` 가 절대 경로로 박아줌). 경로는 workspace-relative 로 정규화. `lineNumber` 는 의도적으로 `1` 고정 — Vue SFC 컴파일러가 런타임 컴포넌트 객체에 태그별 라인 번호를 남기지 않기 때문. |
| Route awareness | 어댑터 수준에는 없음. Vue Router 는 선택적이고 프로젝트별이라 route 첨부는 호스트 측 관심사.                                                                                                                                                |
| Reused adapters | 없음. Nuxt 3 가 재사용하는 base Vue 3 어댑터.                                                                                                                                                                                               |

## vue2 — `@agent-devtools/vue2`

| 축              | 실제 동작                                                                                                                                                                                                                                           |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Walker          | Vnode walker. Vue 2 는 컴포넌트의 **root** DOM node 한 곳에만 `__vue__` 를 박는다. 따라서 다리 함수는 클릭된 element 에서 `parentElement` 를 따라 올라가며 인스턴스 reference 를 가진 첫 element 를 찾는다. ancestor 는 인스턴스의 `.$parent` 사슬. |
| Source          | `instance.$options.__file` (`vite-plugin-vue2` 또는 `vue-template-compiler` 가 박아줌). 경로는 workspace-relative 로 정규화. `lineNumber` 는 `1` (Vue 2 컴파일러도 태그별 라인을 보존하지 않음).                                                    |
| Route awareness | 어댑터 수준에는 없음.                                                                                                                                                                                                                               |
| Reused adapters | 없음. Nuxt 2 가 재사용하는 base Vue 2 어댑터.                                                                                                                                                                                                       |

## svelte — `@agent-devtools/svelte`

| 축              | 실제 동작                                                                                                                                                                                                                                                  |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Walker          | Element-keyed walker. Svelte 컴파일러는 dev 모드에서 자기가 렌더한 모든 element 에 `__svelte_meta` 를 박아준다. walker 는 그 meta 를 읽고, 같은 source file 을 공유하는 형제 element 들을 하나의 컴포넌트 ancestor entry 로 묶어 leaf-first 로 yield 한다. |
| Source          | `__svelte_meta.loc` (`{ file, line, column }`) 에서 직접 읽음. Svelte 4 와 Svelte 5 모두 같은 property 이름 `__svelte_meta` 를 쓴다 (별도의 `_svelte_meta` 필드는 없음). 경로는 `?t=…` 캐시버스트, `/@fs/` 접두, `file://` decode 까지 정규화.             |
| Route awareness | 어댑터 수준에는 없음. 라우트 인식은 SvelteKit 의 책임 (아래 참조).                                                                                                                                                                                         |
| Reused adapters | transport 도우미를 위한 `@agent-devtools/widget-core` 외에는 없음. self-contained Svelte 어댑터.                                                                                                                                                           |

## sveltekit — `@agent-devtools/sveltekit`

| 축              | 실제 동작                                                                                                                                                                                                                                                                                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Walker          | Svelte walker 를 그대로 재사용. `mountAgentDevtoolsSvelte` 를 `mountAgentDevtoolsSvelteKit` 로 재수출하고, walker / picker / source resolver / component-name 도우미까지 `@agent-devtools/svelte` 에서 그대로 가져온다.                                                                                                                                      |
| Source          | Svelte 경로 (`__svelte_meta.loc`).                                                                                                                                                                                                                                                                                                                           |
| Route awareness | Scaffolding 만 깔려 있고 현재는 identity-passthrough. `src/hooks.server.ts` 에 꽂는 `createAgentDevtoolsHandle()` 가 `@agent-devtools/sveltekit/hooks` 에서 export 되며, Phase 0 는 request 를 손대지 않고 그대로 통과. 차후 마일스톤에서 pairing token 을 `event.locals` 로 흘리고 SSR 페이지가 첫 페인트에 위젯을 받도록 bootstrap config 를 emit 할 예정. |
| Reused adapters | `@agent-devtools/svelte` (workspace 의존, Svelte picker + mount 재수출).                                                                                                                                                                                                                                                                                     |

## angular — `@agent-devtools/angular`

| 축              | 실제 동작                                                                                                                                                                                                                                                                                                        |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Walker          | Ivy debug API walker. 다리 함수는 우선 `window.ng.getOwningComponent(element)` 를 쓰고, 안 되면 `window.ng.getComponent(element)` 로 fallback — 둘 다 dev-only 의 Ivy 전역이라 `enableProdMode()` 가 켜진 production 에서는 사라진다. ancestor 는 Angular 의 내부 debug data 가 노출하는 parent chain 을 따른다. |
| Source          | 현재는 `undefined` 반환. Angular 의 템플릿 컴파일러는 React 의 JSX dev transform 처럼 `__source` prop 을 emit 하지 않고, 런타임도 컴포넌트 클래스의 파일 메타데이터를 노출하지 않는다. picker 는 컴포넌트 이름, selector, outerHTML, tagName 까지는 채워주므로 에이전트가 클래스 이름으로 grep 할 수 있다.       |
| Route awareness | 없음.                                                                                                                                                                                                                                                                                                            |
| Reused adapters | 없음. self-contained Ivy walker + closed shadow widget.                                                                                                                                                                                                                                                          |

## Coverage 케이스 매핑

모든 어댑터의 picker 는 element 를 reject 하지 않는다. 항상 `PickedEvidence`
를 반환하고, walker 가 풀어낸 만큼만 필드를 채운다. 다음 세 케이스의
정식 정의는 [picker-coverage 룰][rule-coverage] 에 있다:

- **Case A** — named component 가 완전히 해상됨 (walker + source 둘 다 성공)
- **Case B** — host fiber/vnode 는 잡혔는데 named component 가 없음 (chip
  라벨은 lowercase tag 로 폴백)
- **Case C** — walker 가 아예 못 잡음 (pure host node, 다른 프레임워크가
  그린 영역, 익스텐션 주입 element) → `{ tagName, selector, outerHTML }` 만

현재 source 를 못 뽑는 어댑터 (angular 전부, next 의 RSC-only pick) 는
나머지 트리가 아무리 풍부해도 Case B ↔ C 사이에 항상 머무른다. 트레이드오프는
의도된 것이다 — 잘못된 `fileName` 은 에이전트가 무관한 파일을 수정하게
만든다. 부재는 `outerHTML` + `selector` 로 복구 가능하지만 잘못된 location 은
복구할 수 없다.

## 함께 보기

- [`.claude/rules/picker-strategy.md`][rule-strategy] — 프레임워크별 walker
  정식 계약.
- [`.claude/rules/picker-coverage.md`][rule-coverage] — 세 coverage 케이스
  와 "Pick anything" 결정 기록.
- [`.claude/rules/adapter-discipline.md`][rule-discipline] — 모든
  `@agent-devtools/<framework>` 어댑터가 따라야 하는 패키지 모양 계약.
- [어떻게 동작하나](./how-it-works/) — 종단 루프 다이어그램.
- [위젯과 페이지 컨텍스트](./widget/) — 채팅 composer 에서 `PickedEvidence`
  가 어떻게 보이는지.

[rule-strategy]: https://github.com/Seungwoo321/agent-devtools/blob/main/.claude/rules/picker-strategy.md
[rule-coverage]: https://github.com/Seungwoo321/agent-devtools/blob/main/.claude/rules/picker-coverage.md
[rule-discipline]: https://github.com/Seungwoo321/agent-devtools/blob/main/.claude/rules/adapter-discipline.md
