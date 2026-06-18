[English](./README.md) · [한국어]

# @agent-devtools/vue

> [agent-devtools](https://github.com/Seungwoo321/agent-devtools) 의 Vue 3 어댑터. 피킹된 DOM 요소를 Vue ComponentInternalInstance 로 환원하고, `.parent` 체인을 따라 컴포넌트 정체성 페이로드를 만들고, widget UI 는 `@agent-devtools/widget-core` 의 framework-agnostic shell 에 위임합니다.

[![npm](https://img.shields.io/npm/v/@agent-devtools/vue.svg)](https://www.npmjs.com/package/@agent-devtools/vue)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/Seungwoo321/agent-devtools/blob/main/LICENSE)

## 이 어댑터가 제공하는 것

- **DOM → component 브리지** — `element.__vueParentComponent` (Vue 3.4+). own-property 읽기만 하고 proxy 순회는 하지 않습니다.
- **Ancestor walker** — `walkComponentAncestors` 가 `.parent` 체인을 leaf-first 로 따라가며 정체성 (`name` / `__name` / `displayName` / `__file`) 이 잡히는 인스턴스만 yield 하고, depth 10 에서 cap 합니다.
- **Source 추출** — dev 모드에서 `@vitejs/plugin-vue` 가 주입한 `instance.type.__file`. workspace 기준 상대 경로로 정규화됩니다. line/column 은 SFC source map 으로 후속 해상되며, 오늘은 추측 대신 line 을 `1` 로 둡니다.
- **Component name** — `instance.type.name` → `instance.type.__name` → `__file` 의 basename → `'Unknown'`.
- **Widget UI** — `@agent-devtools/widget-core` 의 framework-agnostic shell 에 위임합니다. 호스트 앱이 Vue 3 을 쓰더라도 Vue 3 은 widget 번들에 로드되지 않습니다.
- **재사용처** — `@agent-devtools/nuxt` 가 이 walker 를 직접 import 합니다.

어댑터 간 계약은 [picker-strategy.md](https://github.com/Seungwoo321/agent-devtools/blob/main/.claude/rules/picker-strategy.md) 를 참조하세요.

## 기능

- **`mountAgentDevtoolsVue`** — floating widget 을 closed Shadow DOM 에 마운트하고 picker 를 Vue 3 vnode walker 에 연결합니다.
- **Vue 3 컴포넌트 정체성** — `describePickedVue` 가 `element.__vueParentComponent` 를 읽어 `name` / `__name` / `__file` (`@vitejs/plugin-vue` 가 주입) 로 컴포넌트 이름을 환원하고, `.parent` 체인을 leaf-first 로 따라가 컴포넌트 breadcrumb 을 구성합니다.
- **SFC source 매핑** — dev 모드의 `__file` 을 workspace 루트 기준 경로로 정규화해 에이전트가 그대로 grep 할 수 있게 합니다.
- **공유 widget UI** — launcher, composer, settings panel, transport 는 `@agent-devtools/widget-core` 에서 그대로 재사용됩니다. 모두 closed Shadow DOM 안의 plain DOM factory 로 구현되어 있어 Vue 어댑터가 React 나 호스트 framework 런타임을 끌어들이지 않습니다.
- **Production 가드** — `mountAgentDevtoolsVue` 는 `NODE_ENV === 'production'` 일 때 mount 를 거부합니다.

## 설치

```bash
pnpm add -D @agent-devtools/vue @agent-devtools/core
```

Peer dependency: `vue >= 3.4.0`.

## 사용법

대부분의 프로젝트는 Vite 플러그인이 모든 wiring 을 처리합니다:

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { agentDevtools } from '@agent-devtools/vite';

export default defineConfig({
  plugins: [vue(), agentDevtools()],
});
```

Vite 플러그인은 `package.json` 에서 `vue` 를 자동 감지하고 `@agent-devtools/vue` 를 import 대상으로 사용합니다. auto-detect 우선순위 (`nuxt > next > vue > react`) 가 다른 어댑터를 선택할 때는 `framework: 'vue'` 로 명시하세요.

### 수동 마운트 (Vite 플러그인 없이)

```ts
// production 번들에 widget 이 새지 않도록 동적 import.
if (import.meta.env.DEV) {
  const { mountAgentDevtoolsVue } = await import('@agent-devtools/vue');
  const { createDefaultTransport } =
    await import('@agent-devtools/widget-core');

  const handle = mountAgentDevtoolsVue({
    transport: createDefaultTransport({
      baseUrl: 'http://127.0.0.1:4317',
      pairingToken: '<provisioned at startup>',
    }),
  });

  // 앱 unmount 시 명시적으로 정리하고 싶을 때:
  // handle.destroy();
}
```

## API

### `mountAgentDevtoolsVue(options)`

`@agent-devtools/widget-core` 의 `mountAgentDevtools` 와 동일한 옵션. `describePicked` 가 Vue 3 vnode walker 로 기본 설정된다는 점만 다릅니다. 직접 resolver 를 넘기면 override 가능.

### `describePickedVue(element, options?)`

Vue 3 가 렌더한 DOM 요소에 대해 `PickedEvidence` 를 빌드. 다른 어댑터들과 동일한 shape — widget UI 는 단일 인터페이스로 모든 어댑터를 소비합니다.

### `getComponentInstanceForElement(element)`

DOM 요소의 `__vueParentComponent` 를 읽어 소유 Vue 인스턴스를 반환. Vue 가 렌더하지 않은 요소면 `null`.

### `walkComponentAncestors(instance, options?)`

`.parent` 체인을 leaf-first 로 따라가며 정체성 (name/**name/displayName/**file) 이 잡히는 인스턴스만 yield. `maxDepth` (기본 10) 까지만 방출하고, 사이클을 안전하게 처리합니다.

## 보안 기본값

- **Production 거부** — `mountAgentDevtoolsVue` 는 `process.env.NODE_ENV === 'production'` 일 때 throw.
- **Closed Shadow DOM** — host CSS, host event, host Vue app 인스턴스가 widget 트리 밖에 머무릅니다.
- **Pairing-token 전용 인증** — transport 가 `Authorization: Bearer <token>` 을 동봉. 토큰은 URL 에 기록되지 않습니다.

## 요구 사항

- Node.js `>= 22.13.0`
- Vue `>= 3.4` (dev 빌드 + `@vitejs/plugin-vue` — walker 가 plugin 이 주입한 `__file` 을 읽음)

## 관련 링크

- 모노레포: <https://github.com/Seungwoo321/agent-devtools>
- Core 패키지: [`@agent-devtools/core`](https://www.npmjs.com/package/@agent-devtools/core)
- React 어댑터: [`@agent-devtools/react`](https://www.npmjs.com/package/@agent-devtools/react)
- Vite 플러그인: [`@agent-devtools/vite`](https://www.npmjs.com/package/@agent-devtools/vite)
- 사용자 가이드: <https://agent-devtools-docs.vercel.app/>
- 이슈 트래커: <https://github.com/Seungwoo321/agent-devtools/issues>

## 라이선스

[MIT](https://github.com/Seungwoo321/agent-devtools/blob/main/LICENSE) © Seungwoo Lee
