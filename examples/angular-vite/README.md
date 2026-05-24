# @agent-devtools/example-angular-vite

End-to-end smoke for `@agent-devtools/angular`. A minimal standalone Angular 20 app served by Vite through `@analogjs/vite-plugin-angular`. The framework-aware vite plugin auto-detects Angular from `package.json` and mounts the floating widget.

## Layout

- `src/app/app.component.ts` — root standalone component.
- `src/app/counter.component.ts` — picker target. The Angular adapter walks DOM ancestors and queries Ivy's `window.ng.getOwningComponent` debug API to resolve the `CounterComponent` class.
- `vite.config.ts` — wires `agentDevtools({ framework: 'angular' })` alongside `@analogjs/vite-plugin-angular`.

## Run

```bash
pnpm install
pnpm --filter @agent-devtools/example-angular-vite dev
```

The dev server listens on `http://127.0.0.1:3202`. Visit it once the agent server is also running on `127.0.0.1:4317` (the Vite plugin spawns it automatically by default).

## Production no-leak smoke

```bash
pnpm --filter @agent-devtools/example-angular-vite build:check
```

`build:check` runs `vite build`, then `scripts/check-no-leak.mjs`. The leak check forbids any widget-chain identifier (`mountAgentDevtools`, `describePickedAngular`, `walkComponentAncestors`, etc.) from appearing in the production `dist/` bundle. The Vite plugin declares `apply: 'serve'`, so it does not run during `vite build`; the bootstrap script tag is therefore absent from the production HTML, and the widget chain is never resolved by the bundler.
