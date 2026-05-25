# @agent-devtools/vue2

Vue 2 adapter for [agent-devtools](https://github.com/Seungwoo321/agent-devtools). Provides the floating chat widget, DOM picker, and Vue 2.7 component-tree walker for host applications still on Vue 2.

> Dev-only. The mount entry refuses to run when `NODE_ENV === 'production'`. Bundler integrations (Vite, Nuxt 2 module) further strip imports from production builds — see [`dev-only-guard`](https://github.com/Seungwoo321/agent-devtools/blob/main/.claude/rules/dev-only-guard.md).

## Install

```bash
pnpm add -D @agent-devtools/vue2
```

## Usage

```ts
// In a dev-only entry, e.g. main.dev.ts gated by an import.meta.env.DEV check
import { mountAgentDevtoolsVue2 } from '@agent-devtools/vue2';

mountAgentDevtoolsVue2();
```

For Nuxt 2 hosts, use `@agent-devtools/nuxt2` which registers a dev-only client plugin.

## Status

Phase 2 adapter expansion. Walker, picker, widget and bundler integration land incrementally. See the plan tree in Clawket (`PLAN-01KSBW8EMVP50W21DQKVB3G0NG`).
