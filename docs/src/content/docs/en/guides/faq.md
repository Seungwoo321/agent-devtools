---
title: FAQ
description: Frequently asked questions — supported stacks, production use, team rollout.
---

## Q. Which framework stacks are supported?

**A.** Four adapters are available today: **React + Vite**, **Vue 3 + Vite**, **Next.js 15** (App Router + Pages Router), and **Nuxt 3**.

Each adapter ships with a runnable example under [`examples/`](https://github.com/Seungwoo321/agent-devtools/tree/main/examples) and a CI-enforced `smoke:no-leak` regression scanner that walks the production output (`dist/`, `.next/`, `.output/`) and rejects any widget-chain symbol leaking into the bundle. See the [installation guide](/en/guides/installation/) for per-stack wiring and the README Packages table for the full list.

## Q. Can I use it in production?

**A.** No. This is a **local tool you run on your own machine, only while developing**. It is deliberately built so that it does not even turn on in a production build.

**Why so strict.** This tool gives an AI agent (Claude) permission to read and change your project's code. That is safe when it is _just you, on your own PC, during development_ — but if this capability were left on in a live, deployed environment, anyone who visits the site (including people who are neither operators nor developers, and have no authorization) could try to reach the server-connected agent and read or modify code or server resources. **The mere possibility of that door being open in production is itself a security incident.** That is why it was designed from the start to be local (`127.0.0.1`) only and development-mode only.

**And it would be pointless anyway.** Even if someone stripped the guards and ran it in a deployed environment, all that exists there is already-built output. It is not editing your original source, so any change is reverted on the next build — and a production build carries no information telling the agent "which source file this screen comes from" (the dev-only debug metadata is gone), so the agent cannot even tell where to make a change.

To guarantee this, two layers of leak-prevention guards exist (`.claude/rules/dev-only-guard.md`):

- **Layer 1 — Build-time block.** The Vite plugin declares `apply: 'serve'` ([`packages/vite/src/plugin.ts`](https://github.com/Seungwoo321/agent-devtools/blob/main/packages/vite/src/plugin.ts)) so it does not participate in `vite build`. The Next adapter installs a webpack alias on production builds and inlines a DCE-friendly `NODE_ENV` early-return in the bootstrap shim ([`packages/next/src/config.ts`](https://github.com/Seungwoo321/agent-devtools/blob/main/packages/next/src/config.ts), [`packages/next/src/bootstrap.ts`](https://github.com/Seungwoo321/agent-devtools/blob/main/packages/next/src/bootstrap.ts)). The Nuxt module reads `nuxt.options.dev` and returns before `addPlugin` is called on production builds.
- **Layer 2 — Runtime block.** `mountAgentDevtools()` / `mountAgentDevtoolsVue()` throw immediately when `NODE_ENV === 'production'`, and the core server refuses to listen in a production environment (README "Security defaults").

Automated regression guards run on every CI push: [`packages/vite/src/build-integration.test.ts`](https://github.com/Seungwoo321/agent-devtools/blob/main/packages/vite/src/build-integration.test.ts) enforces zero widget identifiers in Vite production output, and each example (`examples/react-vite`, `examples/vue-vite`, `examples/next`, `examples/nuxt`) runs a `scripts/check-no-leak.mjs` symbol scan against the real build artifacts. Any regression is an immediate release-blocking condition.

## Q. Can I use it without a Claude subscription?

**A.** An **active Claude Pro/Max subscription is required**. It calls through your own subscription, so without one it will not work.

In detail, the README's "Requirements" lists, alongside Node.js ≥24 and pnpm ≥11, "an active Claude Pro/Max subscription (Agent SDK Credit included, effective 2026-06-15)" as a prerequisite. The business model of this tool is **BYO subscription (use your own)** — the maintainer does not eat LLM API key costs; users call directly with the Agent SDK Credit bundled into their own Claude Pro/Max subscription (`CONTEXT.md` "Decision log" entry "Claude communication").

BYOK API key providers and local LLM options such as Ollama / LM Studio are listed under `CONTEXT.md` "Out of scope (follow-up milestones)" and are not offered today.

## Q. How is this different from Stagewise / Cursor?

**A.** The biggest difference is that **no separate AI IDE is required**. With agent-devtools, the agent reads and edits code directly inside the in-browser widget — it does not hand the content off to an IDE chat window.

Tools like Stagewise need an AI IDE such as Cursor or Windsurf, and they forward the picked elements and your message into that IDE's chat window. So you read the response inside the IDE, and you end up moving back and forth between the browser and the IDE throughout the work. The cost is tied to a Cursor subscription or an IDE-side API key.

agent-devtools invokes the Claude Agent SDK itself and **reads code and completes Edits from within the widget** (`CONTEXT.md` "Differentiation from similar tools — Stagewise"). All you need is a browser, and since you read the response right there in the in-page widget, your gaze never leaves the browser. The cost is just your own LLM subscription (Claude Pro/Max etc.). The target user is "someone who develops with VSCode + a browser, without using an AI IDE."

## Q. How do we roll this out across a team?

**A.** **It is not a shared server — each teammate runs it on their own PC with their own subscription.**

In detail (README "Security defaults" + the `CONTEXT.md` decision log):

- **127.0.0.1 binding** — The local agent server binds to loopback only, so it is not exposed to the external network. No other PC can call the same server.
- **Pairing token** — Rotated on every CLI start, in-memory only, never persisted to disk, never embedded in URLs. The token is passed only through `window.__AGENT_DEVTOOLS_CONFIG__` in the dev HTML and the `Authorization: Bearer` header (README "Quick Start").
- **BYO subscription** — Since each developer calls with their own Claude Pro/Max subscription, team rollout simply means "N teammates each add the Vite plugin as a dev dependency on their own PC and use it with their own subscription" (`CONTEXT.md` "Identity").

Scenarios where an organization runs a shared LLM proxy / server fall under the "auth SaaS-mediated mode (post-MVP)" listed in `CONTEXT.md` "Out of scope (follow-up milestones)", and are not part of the current scope.

## Q. Does page data leave my machine?

**A.** The only place the agent connects out to is **Claude (the Anthropic API)**. Everything else stays inside your own computer.

In detail, the only external endpoint the agent calls is the Anthropic API via the Claude Agent SDK (`CONTEXT.md` "Decision log" entry "Claude communication" — user OAuth → user subscription token → direct SDK call). The local agent server binds to `127.0.0.1` loopback only and is not exposed to the external network. The pairing token is not persisted to disk and lives only in memory, and URL embedding is forbidden so that it cannot leak through browser history / server logs / the Referer header (README "Security defaults", `CONTEXT.md` decision log).

The host app and the widget are separated via **a closed Shadow DOM + a separate React module instance**, so there is no path for the widget to arbitrarily read the host app's state / context / global styles either ([`.claude/rules/adapter-discipline.md`](https://github.com/Seungwoo321/agent-devtools/blob/main/.claude/rules/adapter-discipline.md) "Isolation (host app safety)").

## Q. What is the license?

**A.** [MIT](https://github.com/Seungwoo321/agent-devtools/blob/main/LICENSE). Anyone is free to use, fork, and modify it.

Both the README "License" section and `CONTEXT.md` "Identity" state MIT explicitly — the rationale is standard OSS posture, minimizing friction for npm distribution and external contributions (`CONTEXT.md` decision log "License = MIT").
