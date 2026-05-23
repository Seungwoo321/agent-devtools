# @agent-devtools/example-next

End-to-end smoke for `@agent-devtools/next`. Demonstrates both App Router and Pages Router integration paths.

## Layout

- `app/` — App Router. `layout.tsx` mounts the client component `agent-devtools.tsx` which calls `bootstrapAgentDevtools()` inside `useEffect`.
- `pages/hello.tsx` — Pages Router. Calls `bootstrapAgentDevtools()` directly from the page component.
- `next.config.ts` — Wraps the config with `withAgentDevtools` so the dev server propagates the pairing token + base URL through Next's `env` field.

## Run

```bash
pnpm install
pnpm --filter @agent-devtools/example-next dev
```

The dev server listens on `http://127.0.0.1:3100`. Visit `/` for the App Router smoke and `/hello` for the Pages Router smoke. The agent server itself must be running on `127.0.0.1:4317` (configurable through `AGENT_DEVTOOLS_BASE_URL`).

## Production no-leak smoke

```bash
pnpm --filter @agent-devtools/example-next build
grep -rE 'attachShadow\(\{mode:"closed"|AGENT_DEVTOOLS_OPEN_SHADOW|agent-devtools-launcher' .next/static
```

The widget-execution grep above must return zero matches. Two layers protect this:

- **Layer 1 (build).** `withAgentDevtools` installs a webpack alias that maps `@agent-devtools/react`, `@agent-devtools/core`, and `@agent-devtools/harness-core` to `false` for production client builds. The chain that contains the picker, composer, launcher, and closed-shadow widget mount is replaced with empty modules. The tiny `@agent-devtools/next/bootstrap` shim is deliberately kept so the user-side `bootstrapAgentDevtools()` call resolves to a real (no-op) function at runtime.
- **Layer 2 (runtime).** The bootstrap shim short-circuits when `NODE_ENV === 'production'`, and the underlying `mountAgentDevtools` throws if it is somehow reached in a production build.

A plain `grep -r '@agent-devtools' .next/static` will find string references to the symbols (call sites whose targets resolve to the empty module, plus the `bootstrapAgentDevtools` identifier baked into the JSX `<code>` text on `/hello`). Those references carry no executable widget logic — they are the Layer 2 guard itself plus user content. The grep above targets only the widget-execution fingerprints.
