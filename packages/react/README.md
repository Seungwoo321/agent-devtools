[English] · [한국어](./README.ko.md)

# @agent-devtools/react

> React 19 adapter for [agent-devtools](https://github.com/Seungwoo321/agent-devtools) — fiber walker, DOM picker, composer widget, and closed-shadow-DOM mount.

**Status:** `0.1.0` — early alpha. The API may change before `1.0`.

## What's in here

- **`mountAgentDevtools`** — mounts the launcher + composer widget inside a closed Shadow DOM so host styles, events, and React instance stay isolated. Throws on `NODE_ENV === 'production'` (override with `{ force: true }`).
- **`createDefaultTransport`** — `Authorization: Bearer …` header + SSE reader, wired to the core agent server.
- **Fiber walker + DOM picker** — in **Pick** mode, hovering an element resolves its React component name, a subset of props, and a stable semantic selector.
- **Auto context** — picked descriptor, current route, and recent console errors are attached to each prompt automatically.

## Install

```bash
pnpm add -D @agent-devtools/react @agent-devtools/core
```

Peer dependencies: `react >= 19`, `react-dom >= 19`.

## Quick usage

```tsx
// Dynamic import keeps the widget bundle out of production builds.
if (import.meta.env.DEV) {
  const { mountAgentDevtools, createDefaultTransport } =
    await import('@agent-devtools/react');
  mountAgentDevtools({
    transport: createDefaultTransport({
      baseUrl: 'http://127.0.0.1:4317',
      pairingToken: '<provisioned at startup>',
    }),
  });
}
```

Vite users do not need to write this by hand — [`@agent-devtools/vite`](https://www.npmjs.com/package/@agent-devtools/vite) injects an equivalent bootstrap during dev and skips production entirely.

## Requirements

- Node.js `>= 24.0.0`
- React `>= 19` running in a dev build (the picker reads JSX source from the dev runtime)

## Links

- Monorepo: <https://github.com/Seungwoo321/agent-devtools>
- Core package: [`@agent-devtools/core`](https://www.npmjs.com/package/@agent-devtools/core)
- Vite plugin: [`@agent-devtools/vite`](https://www.npmjs.com/package/@agent-devtools/vite)

## License

[MIT](https://github.com/Seungwoo321/agent-devtools/blob/main/LICENSE) © Seungwoo Lee
