[English](./README.md) · [한국어]

# @agent-devtools/angular

> [agent-devtools](https://github.com/Seungwoo321/agent-devtools) 의 Angular 어댑터. 위젯을 closed Shadow DOM 에 mount 하고, Ivy 컴포넌트 트리를 따라가 picked 컴포넌트를 식별하며, framework-agnostic 위젯 셸을 재사용합니다.

[![npm](https://img.shields.io/npm/v/@agent-devtools/angular.svg)](https://www.npmjs.com/package/@agent-devtools/angular)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/Seungwoo321/agent-devtools/blob/main/LICENSE)

> Dev 전용. mount 엔트리는 `NODE_ENV === 'production'` 에서 실행을 거부합니다. 번들러 통합 (Angular CLI builder, Webpack) 이 production 빌드에서 import 를 추가로 제거합니다 — [`dev-only-guard`](https://github.com/Seungwoo321/agent-devtools/blob/main/.claude/rules/dev-only-guard.md) 참고.

## 기능

- **DOM → component bridge** — `getComponentInstanceForElement` 가 Ivy 의 debug API (`window.ng.getOwningComponent` / `getComponent`) 로 element 를 소유한 컴포넌트를 식별합니다. `enableProdMode()` 이전에만 노출되며, 이는 dev-only 가드가 강제하는 조건과 동일합니다.
- **Ancestor walker** — `walkComponentAncestors` 가 public `getOwningComponent` API 로 Ivy 컴포넌트 사슬을 leaf-first 로 따라갑니다. depth 10 으로 제한됩니다.
- **Source 추출** — Angular 는 JSX 스타일 `_debugSource` 를 제공하지 않습니다. `resolveInstanceSource` 가 `ɵcmp` 메타데이터로 컴포넌트 클래스 이름을 식별하며, source 라인/컬럼은 추측하지 않고 omit 합니다 ([picker-coverage](https://github.com/Seungwoo321/agent-devtools/blob/main/.claude/rules/picker-coverage.md) 의 fallback path, Case C).
- **Component name** — `resolveComponentName`: `component.constructor.name` → 첫 selector → `'Unknown'`.
- **`mountAgentDevtoolsAngular`** — launcher, composer, settings 위젯을 `@agent-devtools/widget-core` 셸을 통해 closed Shadow DOM 안에 mount 합니다. 위젯이 Angular 의 zone 을 patch 하지 않습니다.
- **Production 가드** — `mountAgentDevtoolsAngular` 가 `NODE_ENV === 'production'` 에서 throw 합니다.

cross-adapter 계약은 [picker-strategy.md](https://github.com/Seungwoo321/agent-devtools/blob/main/.claude/rules/picker-strategy.md) 참고.

## 설치

```bash
pnpm add -D @agent-devtools/angular
```

Peer dependency: `@angular/core >= 17` (`getOwningComponent` 제공, `getComponent` public 유지).

## 사용법

Angular CLI 는 `agent-devtools` 용 first-party 플러그인을 제공하지 않습니다. 아래 권장 호스트 패턴은 런타임 `isDevMode()` 게이트와 빌드 시점 `fileReplacements` 엔트리를 결합해, mount 모듈이 production 빌드에서 빈 stub 으로 교체되게 합니다 — [`dev-only-guard`](https://github.com/Seungwoo321/agent-devtools/blob/main/.claude/rules/dev-only-guard.md) 에 설명된 Layer 1 + Layer 2 가드 계약입니다.

`src/agent-devtools.dev.ts`:

```ts
import { mountAgentDevtoolsAngular } from '@agent-devtools/angular';
mountAgentDevtoolsAngular();
```

`src/agent-devtools.prod.ts`:

```ts
// Intentionally empty. The production build replaces the dev entry with
// this file via angular.json fileReplacements, so the widget chain never
// reaches the production bundle.
```

`src/main.ts`:

```ts
import { isDevMode } from '@angular/core';
import './agent-devtools.dev';

if (isDevMode()) {
  // mountAgentDevtoolsAngular was imported above for tree-shake safety;
  // the dev file calls it as a side effect.
}
```

`angular.json`:

```json
{
  "configurations": {
    "production": {
      "fileReplacements": [
        {
          "replace": "src/agent-devtools.dev.ts",
          "with": "src/agent-devtools.prod.ts"
        }
      ]
    }
  }
}
```

walker 는 Ivy 의 debug API 인 `window.ng.getOwningComponent` / `getComponent` 를 사용하며, 이는 Angular 가 `enableProdMode()` 없이 bootstrap 될 때만 존재합니다.

## 상태

fixed-mode `@agent-devtools/*` 릴리스 라인의 일부로 published. walker, picker, widget, Vite-plugin 통합이 모두 구현됨 — 검증된 표면은 `packages/angular/src/**/*.test.ts` 참고.

## 라이선스

[MIT](https://github.com/Seungwoo321/agent-devtools/blob/main/LICENSE) © Seungwoo Lee
