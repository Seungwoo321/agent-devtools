# @agent-devtools/angular

Angular adapter for [agent-devtools](https://github.com/Seungwoo321/agent-devtools). Provides the floating chat widget, DOM picker, and Ivy component-tree walker for Angular host applications.

> Dev-only. The mount entry refuses to run when `NODE_ENV === 'production'`. Bundler integrations (Angular CLI builder, Webpack) further strip imports from production builds — see [`dev-only-guard`](https://github.com/Seungwoo321/agent-devtools/blob/main/.claude/rules/dev-only-guard.md).

## What this adapter provides

- **DOM → component bridge** — `window.ng.getOwningComponent(element)` from Ivy's debug API. Only exposed before `enableProdMode()`, which is the same condition the dev-only guard enforces.
- **Ancestor walker** — climbs the Ivy `LView[PARENT]` chain via the public `getOwningComponent` API leaf-first, capped at depth 10.
- **Source extraction** — Angular does not ship JSX-style `_debugSource`. The walker resolves the component class name via `ɵcmp.selectors` and the template URL via `ɵcmp.template`; source line/column is omitted rather than guessed (fallback path in [picker-coverage](https://github.com/Seungwoo321/agent-devtools/blob/main/.claude/rules/picker-coverage.md), Case C).
- **Component name** — `component.constructor.name` → first selector → `'Unknown'`.
- **Widget UI** — `@agent-devtools/widget-core` shell. Angular's zone is never patched by the widget.

Peer range: `@angular/core >= 17` (`getOwningComponent` ships and `getComponent` stays public).

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

Published as part of the fixed-mode `@agent-devtools/*` release line. Walker, picker, widget and Vite-plugin integration are in place — see `packages/angular/src/**/*.test.ts` for the verified surface.
