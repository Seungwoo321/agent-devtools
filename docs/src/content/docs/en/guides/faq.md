---
title: FAQ
description: Frequently asked questions — Vue / Next / Nuxt adapter support, production use, team rollout.
---

## Q. When will the Vue / Next / Nuxt adapters ship?

**A.** The official packages today are `@agent-devtools/core`, `@agent-devtools/harness-core`, `@agent-devtools/react`, and `@agent-devtools/vite` — four in total. `@agent-devtools/next` / `vue` / `nuxt` are listed in the README package table as `planned`, meaning they are **follow-up milestones**. Within the scope of Phase 0 (i.e., "end-to-end verification with React + Vite + Claude Pro subscription"), only the React + Vite combination is covered, and the Vue / Next / Nuxt adapters are explicitly defined as **out of scope** (`CONTEXT.md` "MVP scope (Phase 0)" section). Once Phase 0 end-to-end verification is complete, additional packages will be added in sequence according to the "New adapter onboarding procedure" in [`.claude/rules/adapter-discipline.md`](https://github.com/Seungwoo321/agent-devtools/blob/main/.claude/rules/adapter-discipline.md).

## Q. Can I use it in production?

**A.** No. `agent-devtools` is designed to be **dev-only**, and the README's "What it is NOT" explicitly lists `usable in production (dev-only — permanently OUT)`. Two layers of guards prevent leakage (`.claude/rules/dev-only-guard.md`):

- **Layer 1 — Build-time block.** The Vite plugin is declared with `apply: 'serve'`, so it does not participate in the `vite build` step at all ([`packages/vite/src/plugin.ts`](https://github.com/Seungwoo321/agent-devtools/blob/main/packages/vite/src/plugin.ts)). Follow-up adapters such as Next / Nuxt will follow the same spirit and skip entry / plugin registration entirely in production mode.
- **Layer 2 — Runtime NODE_ENV gate.** `mountAgentDevtools()` throws immediately when `NODE_ENV === 'production'`, and the core server refuses to listen in a production environment (README "Security defaults").

An automated regression guard ([`packages/vite/src/build-integration.test.ts`](https://github.com/Seungwoo321/agent-devtools/blob/main/packages/vite/src/build-integration.test.ts)) enforces that the `@agent-devtools` identifier appears zero times in real production build output. A regression in the dev-only guard is an immediate release-blocking condition.

## Q. Can I use it without a Claude subscription?

**A.** At Phase 0, an **active Claude Pro/Max subscription is required**. The README's "Requirements" lists, alongside Node.js ≥24 and pnpm ≥11, "an active Claude Pro/Max subscription (Agent SDK Credit included, effective 2026-06-15)" as a prerequisite. The business model of this tool is **BYO subscription** — the maintainer does not eat LLM API key costs; users call directly using the Agent SDK Credit bundled with their own Claude Pro/Max subscription (`CONTEXT.md` "Decision log" entry "Claude communication = Claude Agent SDK + user subscription credit").

BYOK API key providers and local LLM options such as Ollama / LM Studio are listed in `CONTEXT.md` under "Out of scope (follow-up milestones)" as Phase 1. During Phase 0, no other provider options are offered.

## Q. How is this different from Stagewise / Cursor?

**A.** The biggest difference is **whether the agent is invoked directly by the tool or forwarded to an IDE**. Transcribing the Differentiation table from the README:

|                  | Stagewise                           | agent-devtools                                  |
| ---------------- | ----------------------------------- | ----------------------------------------------- |
| Required tooling | AI IDE such as Cursor / Windsurf    | Browser only                                    |
| Cost model       | Cursor subscription or IDE-side key | Your own LLM subscription (Claude Pro/Max etc.) |
| Response surface | IDE chat window                     | In-page widget                                  |
| Gaze movement    | Browser → IDE → Browser             | Stays in the browser                            |

Stagewise is an input-assistance tool that forwards picked elements + messages to an external AI IDE chat window, while `agent-devtools` invokes the Claude Agent SDK itself and **reads code and completes Edits from within the widget** (`CONTEXT.md` "Differentiation from similar tools — Stagewise"). No separate IDE is required, and your gaze never leaves the in-browser widget. The target user is "someone who develops with VSCode + a browser, without using an AI IDE."

## Q. How do we roll this out across a team?

**A.** This is **not a shared-server model** — each developer runs it on their own PC with their own subscription. Combining the README's "Security defaults" with the decision log in `CONTEXT.md`:

- **127.0.0.1 binding** — The local agent server binds to loopback only, so it is not exposed to the external network. No other PC can call the same server.
- **Pairing token** — Rotated on every CLI start, in-memory only, never persisted to disk, never embedded in URLs. The token is passed only through `window.__AGENT_DEVTOOLS_CONFIG__` in the dev HTML and the `Authorization: Bearer` header (README "Quick Start").
- **BYO subscription** — Since each developer calls with their own Claude Pro/Max subscription, team rollout = "N team members each add `@agent-devtools/vite` as a dev dep on their own PC and use it with their own subscription" (`CONTEXT.md` "Identity", README "What it is").

Scenarios where an organization runs a shared LLM proxy / server fall under the separate "auth SaaS-mediated mode (post-MVP)" listed in `CONTEXT.md` "Out of scope (follow-up milestones)", and are not part of Phase 0 scope.

## Q. Does page data leave my machine?

**A.** The only external endpoint the agent calls is **the Anthropic API via the Claude Agent SDK** (`CONTEXT.md` "Decision log" entry "Claude communication" — user OAuth → user subscription token → direct SDK call). The local agent server binds to `127.0.0.1` loopback only and is not exposed to the external network. The pairing token is not persisted to disk and lives only in memory, and URL embedding is forbidden so that it cannot leak through browser history / server logs / the Referer header (README "Security defaults", `CONTEXT.md` decision log).

The host app and the widget are dual-tree isolated via **a closed Shadow DOM + a separate React module instance**, so there is no path for the widget to arbitrarily read the host app's state / context / global styles either ([`.claude/rules/adapter-discipline.md`](https://github.com/Seungwoo321/agent-devtools/blob/main/.claude/rules/adapter-discipline.md) "Isolation (host app safety)").

## Q. What is the license?

**A.** [MIT](https://github.com/Seungwoo321/agent-devtools/blob/main/LICENSE). Both the README "License" section and `CONTEXT.md` "Identity" state MIT explicitly — the rationale is standard OSS posture, minimizing friction for npm distribution and external contributions (`CONTEXT.md` decision log "License = MIT").
