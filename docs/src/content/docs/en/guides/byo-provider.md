---
title: Bring your own provider
description: Swap Claude Code for OpenAI / Groq / Cerebras / OpenRouter — or plug in a custom LLM — without touching the widget.
---

agent-devtools ships two provider lanes. By default the widget talks to
**Claude Code via ACP** — the local CLI you already authenticated. The
**SDK lane** swaps that out for any backend that satisfies the
`LLMProvider` contract in `@agent-devtools/harness-core`.

The widget never sees which backend you picked. The provider abstraction
is a server-side seam, not a client-side feature flag.

## Two lanes, one contract

| Lane          | Identifier        | Shape              | Today's implementations            |
| ------------- | ----------------- | ------------------ | ---------------------------------- |
| ACP (default) | n/a               | local CLI spawn    | `claude` CLI (Claude Code)         |
| SDK           | `LLMProvider`     | request/response   | OpenRouter, Groq, Cerebras, OpenAI |
| Session SDK   | `SessionProvider` | persistent session | Claude Agent SDK                   |

The ACP lane reuses your existing `~/.claude/` OAuth session — no key,
no extra account. The SDK lanes take an API key from the environment.

## The `LLMProvider` interface

Source: `packages/harness-core/src/llm/types.ts`.

```ts
export interface LLMProvider {
  readonly supportsTools: boolean;
  readonly providerName: string;

  chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse>;
  chatWithVision(
    messages: ChatMessage[],
    imageContent: ImageContent,
    options?: ChatOptions,
  ): Promise<ChatResponse>;
  chatWithTools(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    options?: ChatOptions,
  ): Promise<ToolChatResponse>;
}
```

Three methods, three phases — text-only generation, vision turns, and
tool-use loops. Strategies refuse to call `chatWithTools` when
`supportsTools` is `false`, so an LLM without function calling can still
power text turns without crashing the loop.

## Bundled SDK providers

| Provider name | Module                               | Env var              |
| ------------- | ------------------------------------ | -------------------- |
| `openrouter`  | `harness-core/src/llm/openrouter.ts` | `OPENROUTER_API_KEY` |
| `groq`        | `harness-core/src/llm/groq.ts`       | `GROQ_API_KEY`       |
| `cerebras`    | `harness-core/src/llm/cerebras.ts`   | `CEREBRAS_API_KEY`   |
| `openai`      | `harness-core/src/llm/openai.ts`     | `OPENAI_API_KEY`     |

Plus the session-shaped provider:

| Session provider   | Module                                     | Env var             |
| ------------------ | ------------------------------------------ | ------------------- |
| `claude-agent-sdk` | `harness-core/src/llm/claude-agent-sdk.ts` | `ANTHROPIC_API_KEY` |

The session provider returns a `SessionProvider` — the harness routes it
to the SDK session loop rather than the request/response loop. ACP and
session SDK are the only paths that preserve conversation state across
turns server-side.

## Picking a provider — the no-fallback rule

```ts
import {
  createProvider,
  createSessionProvider,
} from '@agent-devtools/harness-core/llm';

// Request/response lane
const openai = createProvider('openai', 'gpt-4o-mini');

// Session lane (Claude Code subscription auth or ANTHROPIC_API_KEY)
const claude = createSessionProvider('claude-agent-sdk', 'claude-sonnet-4-6');
```

`createProvider` and `createSessionProvider` **require an explicit model
name**. There is no "default model" — the harness refuses to pick one
on the host's behalf. The reason is operational: a default model in a
shared library becomes a silent dependency that costs money the wrong
way the day the model is renamed or deprecated.

`DEFAULT_LLM_PROVIDER` is an opt-in env var the _host_ reads to choose
between bundled providers. It is never consulted automatically.

## Discovery — what is wired up right now

```ts
import {
  getAvailableProviders,
  getAvailableSessionProviders,
  getProviderModels,
} from '@agent-devtools/harness-core/llm';

getAvailableProviders(); // -> ['openai', 'groq', ...] based on env keys
getAvailableSessionProviders(); // -> ['claude-agent-sdk'] if ANTHROPIC_API_KEY
getProviderModels('openai'); // -> the bundled model whitelist
```

These three are the building blocks for the `/info` HTTP endpoint a host
mounts to let the widget show a "which model am I talking to" indicator.

## Adding a custom provider

Implement the `LLMProvider` interface, then either register through the
factory (fork-and-edit) or pass your instance directly into the
harness-core run loop in your own host.

```ts
import { BaseLLMProvider } from '@agent-devtools/harness-core/llm';
import type {
  ChatMessage,
  ChatOptions,
  ChatResponse,
} from '@agent-devtools/harness-core/llm';

class LocalOllamaProvider extends BaseLLMProvider {
  readonly providerName = 'ollama';
  readonly supportsTools = false;

  async chat(
    messages: ChatMessage[],
    options?: ChatOptions,
  ): Promise<ChatResponse> {
    const res = await fetch('http://127.0.0.1:11434/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        model: options?.model ?? 'llama3.2',
        messages,
        stream: false,
      }),
    });
    const json = await res.json();
    return { content: json.message.content, finishReason: 'stop' };
  }

  // chatWithVision / chatWithTools omitted — supportsTools = false means
  // strategies won't call them.
}
```

The factory in `packages/harness-core/src/llm/factory.ts` is a thin
switch — adding a `case 'ollama':` line keeps registry-style discovery
working. Or skip the factory entirely and hand your provider instance to
the harness directly; the run loop takes an `LLMProvider`, not a name.

## Transport — not pluggable today

The pairing-token + loopback HTTP + SSE transport between widget and
local dev server is fixed. There is no third lane. The seam is the
_provider_ on the server side, not the wire format on the browser side.

If you need a different wire transport — say, a remote dev container
talking to a local browser — file an issue. It is a deliberate
non-feature today, not an oversight.

## Why this matters

The widget never holds an API key. The host decides which lane to use
based on policy (cost, latency, capability) and the widget reads
whatever the server hands back. Switching from Claude Code to OpenAI for
a single user session is a server-side toggle, not a redeploy and not a
widget rebuild.
