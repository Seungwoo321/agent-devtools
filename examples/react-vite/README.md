[English] · [한국어](./README.ko.md)

# @agent-devtools/example-react-vite

End-to-end smoke for `@agent-devtools/react`. A minimal Vite + React 19 app that mounts the floating widget through the framework-aware Vite plugin.

## Layout

- `src/App.tsx` — root component. Renders an `<OrderSummary />`, a `<Counter />`, a `<UserTable />`, and a `<ProfileCard />` as picker targets.
- `src/checkout/OrderSummary.tsx` — checkout-table picker target. `describePicked` walks the React fiber chain to resolve the source `.tsx` file and component name.
- `vite.config.ts` — wires `agentDevtools()` alongside `@vitejs/plugin-react`; the plugin auto-detects the React adapter from the host plugins.

## Run

```bash
pnpm install
pnpm --filter @agent-devtools/example-react-vite dev
```

The dev server listens on `http://127.0.0.1:5173`. Visit it once the agent server is also running on `127.0.0.1:4317` (the Vite plugin spawns it automatically by default).

## Production no-leak smoke

```bash
pnpm --filter @agent-devtools/example-react-vite build
grep -rE 'mountAgentDevtools|describePicked|getFiberForElement|walkComponentAncestors' dist
```

The widget-execution grep above must return zero matches. The Vite plugin declares `apply: 'serve'` so it does not run during `vite build`; the bootstrap script tag is therefore absent from the production HTML, and the widget chain is never even resolved by the bundler.

A plain `grep -r '@agent-devtools' dist` will match the literal `agent-devtools` text rendered by `App.tsx` — that string is user prose in the page body, not widget code. The `scripts/check-no-leak.mjs` guard (run via `pnpm --filter @agent-devtools/example-react-vite build:check`) enforces the same invariant against the precise widget-chain symbols.
