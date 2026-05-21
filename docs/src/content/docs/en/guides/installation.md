---
title: Installation
description: Wire agent-devtools into a Vite + React app in five minutes.
---

This page is pending translation (ADT-49).

Install the Vite plugin and the React adapter, register the plugin in
`vite.config.ts`, and mount the widget from your dev entry point. The widget
will only mount when `import.meta.env.DEV` is true, so production builds are
unaffected.

## Prerequisites

- Claude Code CLI installed and logged in (`claude /login`).
- **Node.js 24 LTS or newer.** Verify with `node --version`.

## Mounting the widget

From your dev entry point (e.g. `src/main.tsx`), mount the widget only when
`import.meta.env.DEV` is true:

```tsx
if (import.meta.env.DEV) {
  // Dynamic import keeps this branch out of production bundles.
  const { mountAgentDevtools, createDefaultTransport } =
    await import('@agent-devtools/react');
  mountAgentDevtools({
    transport: createDefaultTransport({
      baseUrl: 'http://127.0.0.1:4317',
      pairingToken: '<delivered via your provisioning mechanism>',
    }),
  });
}
```
