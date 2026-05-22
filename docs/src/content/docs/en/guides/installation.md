---
title: Installation
description: Wire agent-devtools into a Vite + React app in five minutes.
---

This page assumes you **already have a Vite + React project**. If you don't,
run `pnpm create vite@latest my-app --template react-ts` and come back when
you're done.

## 0. Prerequisites

You need the following two things ready before continuing.

1. **Claude Code CLI installed and logged in.**
   ```bash
   # If you've never installed it
   curl -fsSL https://claude.ai/install.sh | bash
   # Log in (Claude Pro / Max account)
   claude /login
   ```
   You're done as soon as an OAuth session file appears under `~/.claude/`.
2. **Node.js 24 LTS or newer.**
   Verify with `node --version`.

> agent-devtools never asks for an Anthropic API key. It reuses the OAuth
> session that the CLI already maintains.

## 1. Install the packages

```bash
pnpm add -D @agent-devtools/vite @agent-devtools/react
# or
npm install -D @agent-devtools/vite @agent-devtools/react
```

The two packages have the following roles.

| Package                 | Role                                                                                                            |
| ----------------------- | --------------------------------------------------------------------------------------------------------------- |
| `@agent-devtools/vite`  | Mounts the widget backend (HTTP + SSE) on the dev server. Bridges to the local Claude Code over stdio JSON-RPC. |
| `@agent-devtools/react` | Mounts the floating widget UI in the browser.                                                                   |

## 2. Register the Vite plugin

Add the plugin to `vite.config.ts`.

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { agentDevtools } from '@agent-devtools/vite';

export default defineConfig({
  plugins: [
    react(),
    // Only activates on the dev server. Never included in build output.
    agentDevtools(),
  ],
});
```

Every plugin option is covered in the [configuration reference](/en/guides/configuration/).
The defaults are enough to get started.

## 3. Mount the widget

In your app's entry point (`src/main.tsx` or equivalent), mount the widget
**only when running in dev mode**.

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if (import.meta.env.DEV) {
  // Splitting via dynamic import guarantees this never reaches a production bundle.
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

> The `import.meta.env.DEV` guard is required. `mountAgentDevtools()` itself
> is also dev-only by construction, but applying dynamic import on top is the
> recommended pattern for bundle size and security.

## 4. Run the dev server

```bash
pnpm dev
```

If a purple round floating icon appears in the bottom-right of the browser,
installation is complete.

The first click briefly displays the pairing token notice, and the dev server
console emits logs similar to the following.

```
[agent-devtools] pairing token (memory-only, rotates per CLI start)
[agent-devtools] provider: acp (default) — connecting to local Claude Code
```

## 5. Next steps

- [First run](/en/guides/first-run/) — send the first prompt to the widget and
  confirm code edits actually land
- [Permission modes](/en/guides/permission-modes/) — stop being asked to approve every action
- [Providers guide](/en/guides/providers/) — switch to SDK mode

## When installation doesn't work

- **Widget icon doesn't appear** → [Troubleshooting: widget never appears](/en/guides/troubleshooting/#widget-never-appears-on-the-dev-server-at-all)
- **`501 agent stream not configured`** → [Troubleshooting: provider not configured](/en/guides/troubleshooting/#claude-code-cli-handshake-failure-acp-child-terminates-immediately-after-spawn)
- **`claude` CLI reports missing** → revisit the Step 0 CLI installation
