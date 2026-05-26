---
title: Bring your own provider
description: Swap Claude Code for OpenAI / Anthropic / Ollama — or any other LLM — by implementing the LLMProvider interface in @agent-devtools/harness-core.
---

agent-devtools ships two provider lanes. By default the widget talks to
**Claude Code via ACP** — the local CLI you already authenticated. The
**SDK lane** swaps that out for any backend that satisfies the
`LLMProvider` contract exported from `@agent-devtools/harness-core`.

The widget never sees which backend you picked. The provider abstraction
is a server-side seam, not a client-side feature flag. This page documents
that seam as a public extension point and shows three concrete adapters
you can copy into your own host.

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

One-line gloss per member:

- `supportsTools` — when `false`, strategies skip `chatWithTools` and stay on plain text turns.
- `providerName` — stable identifier the harness stamps onto `AgentOutput.metadata.provider` for telemetry.
- `chat` — single text-only turn. Returns `{ content, model, usage? }`.
- `chatWithVision` — same as `chat` but takes one `ImageContent` (base64 or URL) and injects it into the last user message.
- `chatWithTools` — tool-use turn. Returns `{ content, toolCalls, finished, model, usage? }`; the model-driven loop iterates while `finished === false`.

`ChatOptions.signal` is the only field providers MUST honour. Compose it
with your internal timeout via `AbortSignal.any([timeoutCtrl.signal, options.signal])`
so the fetch aborts on whichever fires first.

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
} from '@agent-devtools/harness-core';

// Request/response lane
const openai = createProvider('openai', 'gpt-4o-mini');

// Session lane (Claude Code subscription auth or ANTHROPIC_API_KEY)
const claude = createSessionProvider('claude-agent-sdk', 'claude-sonnet-4-5');
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
} from '@agent-devtools/harness-core';

getAvailableProviders(); // -> ['openai', 'groq', ...] based on env keys
getAvailableSessionProviders(); // -> ['claude-agent-sdk'] if ANTHROPIC_API_KEY
getProviderModels('openai'); // -> the bundled model whitelist
```

These three are the building blocks for the `/info` HTTP endpoint a host
mounts to let the widget show a "which model am I talking to" indicator.

## Adding a custom provider

Implement the `LLMProvider` interface in your host code, then either
register through the factory (fork-and-edit) or pass your instance
directly into the harness-core run loop. The three examples below are
copy-pastable starting points — replace the model identifier, headers,
and response field names to match the backend you actually target.

For OpenAI-compatible endpoints you can also extend
`BaseOpenAICompatibleProvider` (the same base class `OpenRouterProvider`,
`GroqProvider`, and `CerebrasProvider` use) and only override `apiUrl`,
`providerName`, and `buildHeaders`. The standalone class form below is
shown so the contract is visible end-to-end.

### Example 1: OpenAI-compatible chat completions

A generic adapter for any backend that speaks the OpenAI
`/v1/chat/completions` shape — your own self-hosted vLLM, Azure OpenAI,
Together AI, Fireworks, DeepInfra, and so on. Drop in your `baseUrl` and
auth header.

```ts
import type {
  ChatMessage,
  ChatOptions,
  ChatResponse,
  LLMProvider,
  ToolCall,
  ToolChatResponse,
  ToolDefinition,
} from '@agent-devtools/harness-core';

interface OpenAICompatibleResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
      tool_calls?: Array<{
        id: string;
        type: 'function';
        function: { name: string; arguments: string };
      }>;
    };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: { message?: string };
}

export class OpenAICompatibleProvider implements LLMProvider {
  readonly providerName = 'openai-compatible';
  readonly supportsTools = true;

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly defaultModel: string,
  ) {}

  async chat(
    messages: ChatMessage[],
    options?: ChatOptions,
  ): Promise<ChatResponse> {
    const model = options?.model ?? this.defaultModel;
    const data = await this.post(model, messages, undefined, options);
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error(`${this.providerName}: empty response from ${model}`);
    }
    return {
      content,
      model,
      ...(data.usage && {
        usage: {
          inputTokens: data.usage.prompt_tokens,
          outputTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
        },
      }),
    };
  }

  async chatWithVision(
    messages: ChatMessage[],
    imageContent: { base64?: string; url?: string; mimeType?: string },
    options?: ChatOptions,
  ): Promise<ChatResponse> {
    const url =
      imageContent.url ??
      (imageContent.base64
        ? `data:${imageContent.mimeType ?? 'image/png'};base64,${imageContent.base64}`
        : undefined);
    if (!url) {
      throw new Error(`${this.providerName}: image url or base64 required`);
    }
    const augmented = messages.map((m, idx) => {
      const isLastUser = idx === messages.length - 1 && m.role === 'user';
      if (!isLastUser) return m;
      const text = typeof m.content === 'string' ? m.content : '';
      return {
        ...m,
        content: [
          { type: 'text' as const, text },
          { type: 'image_url' as const, image_url: { url } },
        ],
      };
    });
    return this.chat(augmented, options);
  }

  async chatWithTools(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    options?: ChatOptions,
  ): Promise<ToolChatResponse> {
    const model = options?.model ?? this.defaultModel;
    const data = await this.post(model, messages, tools, options);
    const msg = data.choices?.[0]?.message;
    const toolCalls: ToolCall[] = (msg?.tool_calls ?? []).map((tc) => ({
      id: tc.id,
      type: 'function' as const,
      function: { name: tc.function.name, arguments: tc.function.arguments },
    }));
    return {
      content: msg?.content ?? null,
      toolCalls,
      finished: toolCalls.length === 0,
      model,
      ...(data.usage && {
        usage: {
          inputTokens: data.usage.prompt_tokens,
          outputTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
        },
      }),
    };
  }

  private async post(
    model: string,
    messages: ChatMessage[],
    tools: ToolDefinition[] | undefined,
    options?: ChatOptions,
  ): Promise<OpenAICompatibleResponse> {
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), 60_000);
    const signal = options?.signal
      ? AbortSignal.any([timeout.signal, options.signal])
      : timeout.signal;
    try {
      const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages,
          ...(tools && { tools }),
          max_tokens: options?.maxTokens ?? 4096,
          temperature: options?.temperature ?? 0.1,
        }),
        signal,
      });
      const body = (await res.json()) as OpenAICompatibleResponse;
      if (!res.ok || body.error) {
        const msg = body.error?.message ?? res.statusText;
        throw new Error(
          `${this.providerName} ${res.status} on ${model}: ${msg}`,
        );
      }
      return body;
    } finally {
      clearTimeout(timer);
    }
  }
}
```

### Example 2: Anthropic Messages API

The Anthropic `/v1/messages` endpoint has a different shape than OpenAI:
the `system` prompt lives at the top level (not inside `messages`), tool
calls are returned as `content` blocks of type `tool_use`, and tool
results go back as `content` blocks of type `tool_result`. The adapter
below translates the `LLMProvider` ChatMessage list into that shape and
flattens the response back.

```ts
import type {
  ChatMessage,
  ChatOptions,
  ChatResponse,
  ContentPart,
  LLMProvider,
  ToolCall,
  ToolChatResponse,
  ToolDefinition,
} from '@agent-devtools/harness-core';

interface AnthropicContentBlock {
  type: 'text' | 'tool_use' | 'tool_result';
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  content?: string;
}

interface AnthropicResponse {
  content?: AnthropicContentBlock[];
  stop_reason?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { message?: string; type?: string };
}

export class AnthropicProvider implements LLMProvider {
  readonly providerName = 'Anthropic';
  readonly supportsTools = true;

  constructor(
    private readonly apiKey: string,
    private readonly defaultModel: string,
  ) {}

  async chat(
    messages: ChatMessage[],
    options?: ChatOptions,
  ): Promise<ChatResponse> {
    const model = options?.model ?? this.defaultModel;
    const data = await this.post(model, messages, undefined, options);
    const text = (data.content ?? [])
      .filter((b) => b.type === 'text' && b.text)
      .map((b) => b.text!)
      .join('');
    if (!text) {
      throw new Error(`${this.providerName}: empty response from ${model}`);
    }
    return {
      content: text,
      model,
      ...(data.usage && {
        usage: {
          inputTokens: data.usage.input_tokens,
          outputTokens: data.usage.output_tokens,
          totalTokens:
            (data.usage.input_tokens ?? 0) + (data.usage.output_tokens ?? 0),
        },
      }),
    };
  }

  async chatWithVision(
    messages: ChatMessage[],
    imageContent: { base64?: string; url?: string; mimeType?: string },
    options?: ChatOptions,
  ): Promise<ChatResponse> {
    const url =
      imageContent.url ??
      (imageContent.base64
        ? `data:${imageContent.mimeType ?? 'image/png'};base64,${imageContent.base64}`
        : undefined);
    if (!url) {
      throw new Error(`${this.providerName}: image url or base64 required`);
    }
    const augmented = messages.map((m, idx) => {
      const isLastUser = idx === messages.length - 1 && m.role === 'user';
      if (!isLastUser) return m;
      const text = typeof m.content === 'string' ? m.content : '';
      const parts: ContentPart[] = [
        { type: 'text', text },
        { type: 'image_url', image_url: { url } },
      ];
      return { ...m, content: parts };
    });
    return this.chat(augmented, options);
  }

  async chatWithTools(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    options?: ChatOptions,
  ): Promise<ToolChatResponse> {
    const model = options?.model ?? this.defaultModel;
    const data = await this.post(model, messages, tools, options);
    const textBlocks = (data.content ?? []).filter(
      (b) => b.type === 'text' && b.text,
    );
    const toolBlocks = (data.content ?? []).filter(
      (b) => b.type === 'tool_use' && b.id && b.name,
    );
    const toolCalls: ToolCall[] = toolBlocks.map((b) => ({
      id: b.id!,
      type: 'function' as const,
      function: {
        name: b.name!,
        arguments: JSON.stringify(b.input ?? {}),
      },
    }));
    const text = textBlocks.map((b) => b.text!).join('');
    return {
      content: text.length > 0 ? text : null,
      toolCalls,
      finished: toolCalls.length === 0,
      model,
      ...(data.usage && {
        usage: {
          inputTokens: data.usage.input_tokens,
          outputTokens: data.usage.output_tokens,
          totalTokens:
            (data.usage.input_tokens ?? 0) + (data.usage.output_tokens ?? 0),
        },
      }),
    };
  }

  private async post(
    model: string,
    messages: ChatMessage[],
    tools: ToolDefinition[] | undefined,
    options?: ChatOptions,
  ): Promise<AnthropicResponse> {
    const system = messages
      .filter((m) => m.role === 'system')
      .map((m) => (typeof m.content === 'string' ? m.content : ''))
      .join('\n\n');
    const turns = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'tool' ? 'user' : m.role,
        content:
          m.role === 'tool'
            ? [
                {
                  type: 'tool_result',
                  tool_use_id: m.tool_call_id,
                  content: typeof m.content === 'string' ? m.content : '',
                },
              ]
            : m.content,
      }));
    const anthropicTools = tools?.map((t) => ({
      name: t.function.name,
      description: t.function.description,
      input_schema: t.function.parameters,
    }));
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), 60_000);
    const signal = options?.signal
      ? AbortSignal.any([timeout.signal, options.signal])
      : timeout.signal;
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          ...(system && { system }),
          messages: turns,
          ...(anthropicTools && { tools: anthropicTools }),
          max_tokens: options?.maxTokens ?? 4096,
          temperature: options?.temperature ?? 0.1,
        }),
        signal,
      });
      const body = (await res.json()) as AnthropicResponse;
      if (!res.ok || body.error) {
        const msg = body.error?.message ?? res.statusText;
        throw new Error(
          `${this.providerName} ${res.status} on ${model}: ${msg}`,
        );
      }
      return body;
    } finally {
      clearTimeout(timer);
    }
  }
}
```

### Example 3: Local Ollama

[Ollama](https://ollama.com/) runs models locally on `http://localhost:11434`.
The `/api/chat` endpoint takes OpenAI-style messages but returns its own
shape: `{ message: { content }, prompt_eval_count, eval_count }`. Tool
calling exists for models that advertise it (e.g. `llama3.1`,
`qwen2.5-coder`), but most local models do not — this adapter sets
`supportsTools = false` so the harness only calls `chat`.

```ts
import type {
  ChatMessage,
  ChatOptions,
  ChatResponse,
  LLMProvider,
  ToolChatResponse,
  ToolDefinition,
} from '@agent-devtools/harness-core';

interface OllamaResponse {
  message?: { role: string; content: string };
  prompt_eval_count?: number;
  eval_count?: number;
  done?: boolean;
  error?: string;
}

export class OllamaProvider implements LLMProvider {
  readonly providerName = 'ollama';
  readonly supportsTools = false;

  constructor(
    private readonly defaultModel: string,
    private readonly baseUrl: string = 'http://127.0.0.1:11434',
  ) {}

  async chat(
    messages: ChatMessage[],
    options?: ChatOptions,
  ): Promise<ChatResponse> {
    const model = options?.model ?? this.defaultModel;
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), 120_000);
    const signal = options?.signal
      ? AbortSignal.any([timeout.signal, options.signal])
      : timeout.signal;
    try {
      const res = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: messages.map((m) => ({
            role: m.role,
            content: typeof m.content === 'string' ? m.content : '',
          })),
          stream: false,
          options: {
            temperature: options?.temperature ?? 0.1,
            num_predict: options?.maxTokens ?? 4096,
          },
        }),
        signal,
      });
      const body = (await res.json()) as OllamaResponse;
      if (!res.ok || body.error) {
        throw new Error(
          `${this.providerName} ${res.status} on ${model}: ${body.error ?? res.statusText}`,
        );
      }
      const content = body.message?.content;
      if (!content) {
        throw new Error(`${this.providerName}: empty response from ${model}`);
      }
      return {
        content,
        model,
        usage: {
          inputTokens: body.prompt_eval_count,
          outputTokens: body.eval_count,
          totalTokens: (body.prompt_eval_count ?? 0) + (body.eval_count ?? 0),
        },
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async chatWithVision(
    messages: ChatMessage[],
    _imageContent: { base64?: string; url?: string },
    options?: ChatOptions,
  ): Promise<ChatResponse> {
    // Ollama's vision support depends on the model (llava, bakllava, ...) and
    // takes images as a top-level `images: string[]` (base64). For brevity
    // this adapter falls back to text-only — extend it if your model needs
    // vision turns.
    return this.chat(messages, options);
  }

  async chatWithTools(
    _messages: ChatMessage[],
    _tools: ToolDefinition[],
    _options?: ChatOptions,
  ): Promise<ToolChatResponse> {
    // `supportsTools = false` means the harness never reaches here. Throw
    // loudly so a strategy that ignores the flag fails fast in dev.
    throw new Error(
      `${this.providerName}: tool calling not enabled — set supportsTools = true and implement /api/chat with tools.`,
    );
  }
}
```

### Wiring an adapter into the harness

```ts
import { OpenAICompatibleProvider } from './openai-compatible-provider.js';
// ...or AnthropicProvider, OllamaProvider — same shape.

const provider = new OpenAICompatibleProvider(
  'https://api.together.xyz',
  process.env.TOGETHER_API_KEY!,
  'meta-llama/Llama-3.1-70B-Instruct-Turbo',
);
```

The harness-core run loop takes an `LLMProvider`, not a provider _name_.
You can skip the factory entirely and pass the instance directly. If you
want the bundled discovery surface (`getAvailableProviders`,
`getProviderModels`, `/info` endpoint) to know about your adapter, add a
`case` branch to `packages/harness-core/src/llm/factory.ts` — but that
step is optional.

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

## Cross-references

- [How it works](/en/guides/how-it-works/) — where the provider sits in the dev-server architecture.
- [Provider — ACP vs SDK](/en/guides/providers/) — when to pick which lane.
- [Permission modes](/en/guides/permission-modes/) — the action-aware policy that gates what your provider's tool calls are allowed to do.
- [Security model](/en/guides/security/) — pairing token, loopback binding, and the boundary your provider runs inside.
