[English] · [한국어](./README.ko.md)

# @agent-devtools/harness-core

> Generic, domain-agnostic agent harness for [agent-devtools](https://github.com/Seungwoo321/agent-devtools) — loop strategies and an LLM provider abstraction that downstream products plug their own domain into.

**Status:** `0.1.0` — early alpha. The API may change before `1.0`.

## What's in here

- **Loop strategies** — `orchestrator`, `model-driven`, and an optional `langgraph` runner that lets you swap execution shapes without rewriting domain code.
- **LLM provider abstraction** — pluggable providers for OpenRouter, Groq, Cerebras, and any OpenAI-compatible endpoint. Optional integration with `@anthropic-ai/claude-agent-sdk`.
- **Domain extension points** — `GenerationDomain`, `OperationDomain`, `DomainBinding`, `PromptProvider`, `ToolProvider`. Domain-specific concerns (DSLs, business rules, tenant policies) are intentionally absent — consumers supply them.

This package is shared between the in-page `@agent-devtools` widget runtime and external SaaS consumers that want the same harness without the dev-only widget layer.

## Install

```bash
pnpm add @agent-devtools/harness-core
```

Optional peer dependencies (install only what you actually use):

- `@anthropic-ai/claude-agent-sdk >= 0.2.140`
- `@langchain/langgraph >= 1.3.0`

## Requirements

- Node.js `>= 24.0.0`

## Links

- Monorepo: <https://github.com/Seungwoo321/agent-devtools>
- Core package: [`@agent-devtools/core`](https://www.npmjs.com/package/@agent-devtools/core)
- Issue tracker: <https://github.com/Seungwoo321/agent-devtools/issues>

## License

[MIT](https://github.com/Seungwoo321/agent-devtools/blob/main/LICENSE) © Seungwoo Lee
