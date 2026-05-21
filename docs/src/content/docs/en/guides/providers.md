---
title: Provider — ACP vs SDK
description: Two ways the widget connects to your local Claude — ACP (default) and SDK. What to pick and when.
---

agent-devtools ships two **providers** that bridge the widget to your local
Claude. You can switch between them at any time from the widget's settings
panel.

| Provider            | Underlying implementation                                                                                    | How it works                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| **`acp`** (default) | [@agentclientprotocol/claude-agent-acp](https://www.npmjs.com/package/@agentclientprotocol/claude-agent-acp) | The dev server **spawns the Claude Code binary as a child process** and talks to it over stdio JSON-RPC. |
| **`sdk`**           | [@anthropic-ai/claude-agent-sdk](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk)               | The Claude Agent SDK is invoked directly **inside the dev server process**. No child process.            |

## TL;DR

- **Stick with `acp` (the default)** — it is stable, it is the official
  protocol used by Claude Code, and it is the integration we have supported
  from day one of the widget.
- **Consider switching to `sdk` once the SDK ships its official stable
  release (planned for 2026-06-15).** Today it is on the experimental track;
  as of Sprint 1 we keep it around for comparison and validation.

## Both share the same OAuth session

Both providers **reuse your own `~/.claude` OAuth session**.

- `acp` lets the child process use the same session the `claude` CLI normally
  uses.
- `sdk` reads from the same token store directly inside the SDK.

Neither path **requires an Anthropic API key**. There is no separate billing.

## ACP — what it is and why it is the default

ACP stands for the [Agent Client Protocol](https://github.com/zed-industries/agent-client-protocol).
It is a stdio JSON-RPC protocol used by Claude Code, Zed, and the
[ACP adapter that Zed maintains](https://github.com/zed-industries/claude-code-acp).

### How it flows

```
Browser widget
   │  HTTP POST /v1/agent/stream  (SSE)
   ▼
Vite dev server (agent-devtools plugin)
   │  spawn("claude-code-acp")
   ▼
ACP child process (stdio JSON-RPC)
   │  invokes Claude Code internally
   ▼
Uses the ~/.claude OAuth session → Anthropic
```

### Why it is the default

1. **Clear process boundary.** Because Claude Code runs as a separate
   process, memory leaks or session corruption inside it cannot bleed into
   the dev server. If it dies, we just spawn it again.
2. **Official support channel.** It is the standard integration shape built
   by Zed and used by Anthropic. Updates land quickly.
3. **Permission modes and the pairing token are both proven here.** The
   Sprint 1 integration tests (ADT-46) use ACP as the baseline.

### Limitations

- There is a small spawn cost (~200 ms on the first request). From the
  second request on, the child stays alive and the cost is negligible.
- For very large outputs you should be aware of stdio buffering behavior
  (rarely an issue in practice).

## SDK — what it is and when to pick it

`@anthropic-ai/claude-agent-sdk` is Anthropic's official Node SDK. A single
`query()` call returns a streaming response that already includes the
Claude Code tools (Read / Edit / Bash, etc.).

### How it flows

```
Browser widget
   │  HTTP POST /v1/agent/stream  (SSE)
   ▼
Vite dev server (agent-devtools plugin)
   │  query({ prompt, options })  // in-process
   ▼
@anthropic-ai/claude-agent-sdk
   │  Uses the ~/.claude OAuth session → Anthropic
```

### Upsides

- **No child process.** No spawn cost, and no separate dependency on the
  ACP adapter.
- **The SDK's own options are available as-is.** Custom tools, MCP server
  hookups, and the rest of the SDK surface area carry over directly.

### Why it is not yet the default

- The SDK's official stable release is scheduled for **2026-06-15**. Until
  then, types and behavior may shift between minor releases.
- The Sprint 1 integration test baseline is ACP. We keep the SDK code and
  tests around but do not recommend it as the default for users yet.

## Switching providers

Provider selection happens **at runtime in the widget's settings panel**.
It is not exposed as a `vite.config.ts` plugin option — provider is a
per-session choice, not a build-time decision.

Widget settings (gear icon) → **Provider** → pick `ACP` or `SDK`. The
choice is persisted in localStorage and takes effect from the next request.

## FAQ

**Q. Are both providers live at the same time?**
A. No. Routing happens per request. When you flip the widget over to SDK,
the next prompt goes down the SDK path. Any ACP child process that was
already running sits idle and gets cleaned up after a while.

**Q. I don't have the `claude` CLI installed — can I use SDK only?**
A. Yes. The SDK only needs the `~/.claude` OAuth session (run `/login` in
the CLI once and you're set). The catch is that you cannot fall back to
ACP without the CLI, so set the widget settings panel to `SDK` up front.

**Q. Which one is faster?**
A. Once a stream is up, throughput is essentially identical. Only the very
first request is slower under ACP because of the ~200 ms spawn cost.

**Q. Do both providers work in Vue / Next / Nuxt?**
A. The provider abstraction lives in the core package, so as soon as a
framework adapter ships, both providers are supported automatically
(adapters land in cycle U11).
