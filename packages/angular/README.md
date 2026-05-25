# @agent-devtools/angular

Angular adapter for [agent-devtools](https://github.com/Seungwoo321/agent-devtools). Provides the floating chat widget, DOM picker, and Ivy component-tree walker for Angular host applications.

> Dev-only. The mount entry refuses to run when `NODE_ENV === 'production'`. Bundler integrations (Angular CLI builder, Webpack) further strip imports from production builds — see [`dev-only-guard`](https://github.com/Seungwoo321/agent-devtools/blob/main/.claude/rules/dev-only-guard.md).

## Install

```bash
pnpm add -D @agent-devtools/angular
```

## Usage

The Angular CLI does not ship a first-party plugin for `agent-devtools`. The
recommended host pattern below combines a runtime `isDevMode()` gate with a
build-time `fileReplacements` entry so the mount module is replaced by an
empty stub in production builds — that is the Layer 1 + Layer 2 guard
contract described in [`dev-only-guard`](https://github.com/Seungwoo321/agent-devtools/blob/main/.claude/rules/dev-only-guard.md).

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

The walker uses `window.ng.getOwningComponent` / `getComponent` from Ivy's
debug API, which is only present when Angular is bootstrapped without
`enableProdMode()`.

## Status

Phase 2 adapter expansion. Walker, picker, widget and bundler integration land incrementally. See the plan tree in Clawket (`PLAN-01KSBW8EMVP50W21DQKVB3G0NG`).
