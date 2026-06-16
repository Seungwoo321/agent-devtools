[English] · [한국어](./README.ko.md)

# @agent-devtools/angular

> Angular adapter for [agent-devtools](https://github.com/Seungwoo321/agent-devtools). Mounts the floating widget into a closed Shadow DOM, walks the Ivy component tree to resolve picked components, and reuses the framework-agnostic widget shell.

[![npm](https://img.shields.io/npm/v/@agent-devtools/angular.svg)](https://www.npmjs.com/package/@agent-devtools/angular)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/Seungwoo321/agent-devtools/blob/main/LICENSE)

> Dev-only. The mount entry refuses to run when `NODE_ENV === 'production'`. Bundler integrations (Angular CLI builder, Webpack) further strip imports from production builds — see [`dev-only-guard`](https://github.com/Seungwoo321/agent-devtools/blob/main/.claude/rules/dev-only-guard.md).

## Features

- **DOM → component bridge** — `getComponentInstanceForElement` resolves the owning component from Ivy's debug API (`window.ng.getOwningComponent` / `getComponent`). Only exposed before `enableProdMode()`, which is the same condition the dev-only guard enforces.
- **Ancestor walker** — `walkComponentAncestors` climbs the Ivy component chain leaf-first via the public `getOwningComponent` API, capped at depth 10.
- **Source extraction** — Angular does not ship JSX-style `_debugSource`. `resolveInstanceSource` resolves the component class name via `ɵcmp` metadata; source line/column is omitted rather than guessed (fallback path in [picker-coverage](https://github.com/Seungwoo321/agent-devtools/blob/main/.claude/rules/picker-coverage.md), Case C).
- **Component name** — `resolveComponentName`: `component.constructor.name` → first selector → `'Unknown'`.
- **`mountAgentDevtoolsAngular`** — mounts the launcher, composer, and settings widget into a closed Shadow DOM via the `@agent-devtools/widget-core` shell. Angular's zone is never patched by the widget.
- **Production guard** — `mountAgentDevtoolsAngular` throws when `NODE_ENV === 'production'`.

See [picker-strategy.md](https://github.com/Seungwoo321/agent-devtools/blob/main/.claude/rules/picker-strategy.md) for the cross-adapter contract.

## Install

```bash
pnpm add -D @agent-devtools/angular
```

Peer dependency: `@angular/core >= 17` (`getOwningComponent` ships and `getComponent` stays public).

## Usage

The Angular CLI does not ship a first-party plugin for `agent-devtools`. The recommended host pattern below combines a runtime `isDevMode()` gate with a build-time `fileReplacements` entry so the mount module is replaced by an empty stub in production builds — that is the Layer 1 + Layer 2 guard contract described in [`dev-only-guard`](https://github.com/Seungwoo321/agent-devtools/blob/main/.claude/rules/dev-only-guard.md).

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

The walker uses `window.ng.getOwningComponent` / `getComponent` from Ivy's debug API, which is only present when Angular is bootstrapped without `enableProdMode()`.

## Status

Published as part of the fixed-mode `@agent-devtools/*` release line. Walker, picker, widget and Vite-plugin integration are in place — see `packages/angular/src/**/*.test.ts` for the verified surface.

## License

[MIT](https://github.com/Seungwoo321/agent-devtools/blob/main/LICENSE) © Seungwoo Lee
