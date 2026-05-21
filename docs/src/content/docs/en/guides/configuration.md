---
title: Configuration reference
description: Reference for the seven options of the agentDevtools() Vite plugin.
---

## Vite plugin options

> Source of truth: `AgentDevtoolsPluginOptions` in
> `packages/vite/src/plugin.ts`. This page expands each of the seven
> fields of that interface into its own section. If behaviour ever
> disagrees, the doc comment in the source wins.

The `agentDevtools()` plugin from `@agent-devtools/vite` takes a single
options object. Every field is optional — leaving the object empty gives
you safe defaults.

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import { agentDevtools } from '@agent-devtools/vite';

export default defineConfig({
  plugins: [
    agentDevtools({
      // pick only the options you need
    }),
  ],
});
```

The plugin itself ships with two layers of production safety:

1. **Build-time guard** — the plugin declares `apply: 'serve'`, so
   `vite build` ignores it entirely. No agent-devtools code ever lands
   in a production bundle.
2. **Runtime guard** — when `enabled: false`, both `configureServer`
   and `transformIndexHtml` become no-ops even in the dev server. Use
   this for env-gated rollout.

Everything below is a knob inside dev mode; none of it replaces the
production block above.

### `enabled` (boolean, default `true`)

Disables the plugin at runtime without removing it from the Vite
config. When `false`, `configureServer` and `transformIndexHtml` are
both no-ops. This is independent of the production guard — `vite build`
ignores the plugin regardless of this value.

Commonly used to gate the plugin behind an env flag:

```ts
agentDevtools({
  enabled: Boolean(import.meta.env.VITE_DEVTOOLS),
});
```

### `importFrom` (string, default `'@agent-devtools/react'`)

Module specifier that the injected bootstrap imports from. The target
module must export both:

- `mountAgentDevtools`
- `createDefaultTransport`

Override it when you write a non-React adapter or use a fork of the
standard adapter.

```ts
agentDevtools({ importFrom: '@agent-devtools/vue' });
```

### `spawnServer` (boolean, default `true`)

Decides whether to spawn the agent server alongside Vite's dev server.
The default `true` keeps the two lifecycles linked: starting Vite starts
the agent, stopping Vite stops the agent.

Setting it to `false` makes the plugin inject the bootstrap HTML but
skip spawning the server. The widget will still render, but with no
transport — i.e. visible but unconfigured. Only useful when an embedder
manages the agent server lifecycle externally.

### `workspace` (string, default Vite `config.root`)

The workspace root the agent is allowed to read and edit within.
Defaults to whatever `configureServer` sees as Vite's `config.root`.

Path resolution rules:

- **Absolute paths** — used verbatim.
- **Relative paths** — resolved against the Vite project root
  (`config.root`), not `process.cwd()`.

So in a monorepo where the example app lives below the repo root,
`workspace: '..'` always points to the parent repo, regardless of where
`vite` was invoked.

```ts
agentDevtools({ workspace: '..' });
```

### `port` (number, default core's 4317 with sequential fallback)

Preferred port for the spawned agent server. Omit it to use the core's
default (`DEFAULT_PORT = 4317`). If the chosen port is busy, core
sequentially tries the next ones, up to `PORT_FALLBACK_ATTEMPTS`
(currently 20) attempts.

Set it explicitly when you run multiple dev servers in parallel and
want to avoid collisions:

```ts
agentDevtools({ port: 4400 });
```

### `startServer` (function, test-only)

Hook to override `startAgentDevtoolsServer` with a different
implementation. Used by tests to inject a stub that does not bind a
real port.

Its type is
`(options: StartAgentDevtoolsServerOptions) => Promise<AgentDevtoolsServerHandle>`.
**Do not pass it from production code.** It is part of the public type
only because tests inside this repo need it; application code should
ignore it.

### `shadowOpen` (boolean, default `false`)

Mounts the widget with an open shadow root. The default `false` keeps
the widget's DOM behind a closed shadow root so host-page automation
cannot peek inside.

When this option is left unset, the env var
`AGENT_DEVTOOLS_OPEN_SHADOW=1` flips the default to `true` at runtime.
This lets Playwright-driven E2E pierce the widget's DOM without
weakening the production-default closed isolation.

```ts
// Explicitly open the shadow root (rare).
agentDevtools({ shadowOpen: true });
```

## Further reading

- Security model and pairing-token handling: header comment of
  `packages/vite/src/plugin.ts` and `CONTEXT.md`.
- How `importFrom` targets are structured:
  `.claude/rules/adapter-discipline.md`.
- The two-layer production-leak contract:
  `.claude/rules/dev-only-guard.md`.
