# @agent-devtools/example-next-pages

End-to-end smoke example for the Next.js Pages Router adapter (`@agent-devtools/next-pages`). Targets Next 14 / React 18 — the lower end of the adapter's supported range — to verify the wrapper works on legacy hosts that have not migrated to App Router.

## Run

```bash
pnpm install
pnpm --filter @agent-devtools/example-next-pages dev
```

Open http://127.0.0.1:3101. The widget appears in the bottom-right corner; the bootstrap helper is invoked from `pages/_app.tsx` and persists across client-side navigations to `/about` and back.

## Dev-only guard

Two layers cooperate:

1. **Layer 1 (build-time)** — `next.config.ts` is wrapped with `withAgentDevtools` from `@agent-devtools/next-pages`. In production builds the wrapper installs a webpack alias that maps `@agent-devtools/{react,core,harness-core}` to `false`, so the widget chain never enters the production graph. The `bootstrapAgentDevtools` shim's first statement is a `NODE_ENV === 'production'` check, which Next's webpack DefinePlugin inlines so the minifier proves the rest unreachable.
2. **Layer 2 (runtime)** — `mountAgentDevtoolsNextPages` throws when `NODE_ENV === 'production'`, defending the contract if Layer 1 is bypassed.

`pnpm --filter @agent-devtools/example-next-pages build:check` builds for production and runs `scripts/check-no-leak.mjs`, which greps every text file under `.next/static/` and `.next/server/` for any widget-chain symbol. CI fails the example if anything leaks.

## Pages Router specifics

- The `pages/_app.tsx` entry is the only place the host project touches `@agent-devtools/next-pages/bootstrap`. The helper is idempotent across route changes — repeated calls within the same client session are ignored.
- There is no App Router boundary in this project; every route lives under `pages/`.
- Server-rendered pages (`getServerSideProps`, `getStaticProps`) are unaffected — the bootstrap helper only runs inside `useEffect` on the client.
