[English] · [한국어](./README.ko.md)

# @agent-devtools/example-next-pages

End-to-end smoke for `@agent-devtools/next-pages`. Targets Next 14 / React 18 — the lower end of the adapter's supported range — to verify the wrapper works on legacy hosts that have not migrated to App Router.

## Layout

- `pages/_app.tsx` — the only place the host project touches `@agent-devtools/next-pages/bootstrap`. It calls `bootstrapAgentDevtools()` inside `useEffect`; the helper is idempotent across route changes, so repeated calls within the same client session are ignored.
- `pages/index.tsx` / `pages/about.tsx` — picker targets. Every route lives under `pages/`; there is no App Router boundary. Client-side navigation between them keeps the widget mounted.
- `next.config.mjs` — wraps the config with `withAgentDevtools` so the dev server propagates the pairing token + base URL.

## Run

```bash
pnpm install
pnpm --filter @agent-devtools/example-next-pages dev
```

The dev server listens on `http://127.0.0.1:3101`. The widget appears in the bottom-right corner; the bootstrap helper is invoked from `pages/_app.tsx` and persists across client-side navigations to `/about` and back. The agent server itself must be running on `127.0.0.1:4317` (configurable through `AGENT_DEVTOOLS_BASE_URL`).

## Production no-leak smoke

```bash
pnpm --filter @agent-devtools/example-next-pages build:check
```

`build:check` builds for production and runs `scripts/check-no-leak.mjs`, which greps every text file under `.next/static/` and `.next/server/` for any widget-chain symbol. CI fails the example if anything leaks. Two layers protect this:

- **Layer 1 (build-time).** `next.config.mjs` is wrapped with `withAgentDevtools` from `@agent-devtools/next-pages`. In production builds the wrapper installs a webpack alias that maps `@agent-devtools/{react,core,harness-core}` to `false`, so the widget chain never enters the production graph. The `bootstrapAgentDevtools` shim's first statement is a `NODE_ENV === 'production'` check, which Next's webpack DefinePlugin inlines so the minifier proves the rest unreachable.
- **Layer 2 (runtime).** `mountAgentDevtoolsNextPages` throws when `NODE_ENV === 'production'`, defending the contract if Layer 1 is bypassed.

Server-rendered pages (`getServerSideProps`, `getStaticProps`) are unaffected — the bootstrap helper only runs inside `useEffect` on the client.
