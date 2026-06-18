[English] · [한국어](./README.ko.md)

# @agent-devtools/harness-core

> Generic, domain-agnostic agent harness for [agent-devtools](https://github.com/Seungwoo321/agent-devtools) and external SaaS consumers. Provides loop strategies and an LLM provider abstraction that downstream products plug their own domain into.

[![npm](https://img.shields.io/npm/v/@agent-devtools/harness-core.svg)](https://www.npmjs.com/package/@agent-devtools/harness-core)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/Seungwoo321/agent-devtools/blob/main/LICENSE)

## Features

- **Loop strategies** — `orchestratorLoop`, `modelDrivenLoop`, `sdkSessionLoop`, and an optional `langgraphLoop` runner so the execution shape can change without rewriting the domain.
- **LLM provider abstraction** — first-class providers for OpenRouter, Groq, Cerebras, the official OpenAI API, and any OpenAI-compatible endpoint. Optional Claude Agent SDK provider.
- **Tier resolution** — domain-level tiering hooks for splitting heavy and cheap calls across providers.
- **Domain extension points** — `GenerationDomain`, `OperationDomain`, `DomainBinding`, `PromptProvider`, `ToolProvider`. DSLs, business rules, and tenant policies are intentionally absent — the consumer supplies them.
- **Session model** — provider-neutral `SessionProvider` whose streaming events carry a `type` of `assistant_text`, `tool_use`, `tool_result`, `usage`, or `done` for harness-driven UIs.

The package is shared between the in-page `@agent-devtools` widget runtime and external SaaS consumers that want the same harness without the dev-only widget layer.

## Install

```bash
pnpm add @agent-devtools/harness-core
```

Optional peer dependencies (install only what you actually use):

- `@anthropic-ai/claude-agent-sdk >= 0.2.140` — required by `ClaudeAgentSDKProvider`.
- `@langchain/langgraph >= 1.3.0` — required by the `langgraph` loop strategy.

## Usage

### Pick a provider directly

```ts
import { OpenRouterProvider } from '@agent-devtools/harness-core';

const provider = new OpenRouterProvider({
  apiKey: process.env.OPENROUTER_API_KEY!,
  model: 'meta-llama/llama-3.1-8b-instruct:free',
});

const reply = await provider.chat({
  messages: [{ role: 'user', content: 'Summarise the changelog' }],
});
```

### Or resolve one from the environment

```ts
import {
  createProvider,
  getDefaultProvider,
} from '@agent-devtools/harness-core';

const name = getDefaultProvider(); // 'openrouter' | 'groq' | 'cerebras' | 'openai' | undefined
const provider = createProvider(name!, 'meta-llama/llama-3.1-8b-instruct:free');
```

`getDefaultProvider` inspects `OPENROUTER_API_KEY`, `GROQ_API_KEY`, `CEREBRAS_API_KEY`, and `OPENAI_API_KEY` and returns the first provider whose key is present (or `undefined`). `createProvider(name, model)` then constructs that provider for the given model id. Prefer direct instantiation in app code so the dependency is explicit.

### Plug a domain into a loop

```ts
import { orchestratorLoop } from '@agent-devtools/harness-core';

for await (const event of orchestratorLoop(
  input,
  llm,
  adapter,
  prompts,
  config,
)) {
  // event.type === 'start' | 'progress' | 'complete' | 'error'
}
```

- `input` — an `AgentInput`: the user input plus optional `AgentOptions` (including an `AbortSignal`).
- `llm` — an `LLMProvider`. `sdkSessionLoop` takes a `SessionProvider` in this position instead.
- `adapter` — a `GenerationDomain` that supplies parsers, validators, and the generation contract.
- `prompts` — a `PromptProvider` that renders the system prompt and tool descriptions.
- `config` — `LoopConfig` (`maxIterations`, `qualityThreshold`, `tierResolver`, telemetry hooks).

`orchestratorLoop`, `modelDrivenLoop`, `sdkSessionLoop`, and `langgraphLoop` share the same five-argument shape so a consumer can swap strategies without changing the surrounding code. Each yields `StreamEvent` values discriminated by `event.type`.

## Provider matrix

| Provider             | Class                    | Required env / config            |
| -------------------- | ------------------------ | -------------------------------- |
| OpenRouter           | `OpenRouterProvider`     | `OPENROUTER_API_KEY`             |
| Groq                 | `GroqProvider`           | `GROQ_API_KEY`                   |
| Cerebras             | `CerebrasProvider`       | `CEREBRAS_API_KEY`               |
| OpenAI (and proxies) | `OpenAIProvider`         | `OPENAI_API_KEY`                 |
| Claude Agent SDK     | `ClaudeAgentSDKProvider` | `@anthropic-ai/claude-agent-sdk` |

Each provider exposes a curated list of supported model identifiers (`FREE_MODELS`, `GROQ_MODELS`, `CEREBRAS_MODELS`, `OPENAI_MODELS`).

## Requirements

- Node.js `>= 22.13.0`

## Links

- Monorepo: <https://github.com/Seungwoo321/agent-devtools>
- Core package: [`@agent-devtools/core`](https://www.npmjs.com/package/@agent-devtools/core)
- User guide: <https://agent-devtools-docs.vercel.app/>
- Issue tracker: <https://github.com/Seungwoo321/agent-devtools/issues>

## License

[MIT](https://github.com/Seungwoo321/agent-devtools/blob/main/LICENSE) © Seungwoo Lee
