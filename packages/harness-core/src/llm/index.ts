/**
 * LLM Module — Re-exports
 *
 * Provider classes are exported here so consumers can construct them
 * directly. The factory below is a convenience for env-driven setup;
 * direct instantiation is preferred when the consumer already knows
 * which provider it wants (no fallback inference inside core).
 */

export type {
  LLMProvider,
  ChatMessage,
  ContentPart,
  ImageContent,
  ChatOptions,
  ChatResponse,
  ToolDefinition,
  ToolChatResponse,
  ToolCall,
  TokenUsage,
} from './types.js';

export type {
  SessionProvider,
  SessionInput,
  SessionEvent,
  SessionAssistantTextEvent,
  SessionToolUseEvent,
  SessionToolResultEvent,
  SessionUsageEvent,
  SessionDoneEvent,
  ResolvedProvider,
} from './session-types.js';

export { BaseOpenAICompatibleProvider } from './base-provider.js';
export { resolveImageUrl, injectImageIntoMessages } from './message-utils.js';
export { ProviderInputError, isProviderInputStatus } from './errors.js';

export { OpenRouterProvider, FREE_MODELS } from './openrouter.js';
export type { FreeModel } from './openrouter.js';

export { GroqProvider, GROQ_MODELS } from './groq.js';
export type { GroqModel } from './groq.js';

export { CerebrasProvider, CEREBRAS_MODELS } from './cerebras.js';
export type { CerebrasModel } from './cerebras.js';

export { OpenAIProvider, OPENAI_MODELS } from './openai.js';
export type { OpenAIModel } from './openai.js';

export { ClaudeAgentSDKProvider } from './claude-agent-sdk.js';
export type { ClaudeAgentSDKConfig } from './claude-agent-sdk.js';

export {
  createProvider,
  createSessionProvider,
  getDefaultProvider,
  getAvailableProviders,
  getAvailableSessionProviders,
  getProviderModels,
  getProvidersInfo,
} from './factory.js';
export type { ProviderName, SessionProviderName } from './factory.js';
