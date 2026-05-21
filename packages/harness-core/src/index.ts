/**
 * @agent-devtools/harness-core
 *
 * Generic, domain-agnostic agent harness:
 *   - Loop strategies (orchestrator / model-driven / langgraph)
 *   - LLM provider abstraction (OpenRouter, Groq, Cerebras, OpenAI-compatible)
 *   - Domain extension points (GenerationDomain / OperationDomain / DomainBinding / PromptProvider / ToolProvider)
 *
 * Domain-specific concerns (DSLs, business rules, tenant/billing policies)
 * are intentionally absent — consumers provide them via DomainBinding.
 */

export * from './core/index.js';
export * from './llm/index.js';
