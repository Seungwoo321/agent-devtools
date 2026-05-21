/**
 * LLM Provider Interface & Types
 *
 * Defines the contract for an LLM backend (Cerebras, Groq, OpenRouter, …).
 * Strategies depend on this interface, not on any concrete provider, and
 * call only the method appropriate for the current phase:
 *
 *  - `chat`            generation/text-only turns (analyze, fix, …)
 *  - `chatWithVision`  image-input turns (analyze image)
 *  - `chatWithTools`   tool-use turns (model-driven loops)
 *
 * Provider selection and any fallback policy are the consumer's job. The
 * core never picks a default provider — see `llm/factory.ts` and Unit D.
 */

export interface LLMProvider {
  /**
   * Whether the underlying model accepts function-calling style tools.
   * Strategies refuse to call `chatWithTools` when this is `false`.
   */
  readonly supportsTools: boolean;

  /**
   * Stable identifier for this provider (e.g. `'OpenRouter'`, `'Groq'`,
   * `'Cerebras'`). Strategies stamp this on `AgentOutput.metadata.provider`
   * for downstream telemetry. The harness does not standardise casing —
   * each provider sets its own canonical name.
   */
  readonly providerName: string;

  /** Standard chat completion. */
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse>;

  /** Chat with a single image attachment (vision models). */
  chatWithVision(
    messages: ChatMessage[],
    imageContent: ImageContent,
    options?: ChatOptions,
  ): Promise<ChatResponse>;

  /**
   * Chat with tool definitions — the model may respond with text
   * (`finished: true`) or with one or more `toolCalls`. Strategies
   * loop until `finished` or until they hit `LoopConfig.maxIterations`.
   */
  chatWithTools(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    options?: ChatOptions,
  ): Promise<ToolChatResponse>;
}

// ── Messages ────────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | ContentPart[] | null;
  /** For assistant messages with tool calls */
  tool_calls?: ToolCall[];
  /** For tool result messages */
  tool_call_id?: string;
}

export interface ContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string };
}

export interface ImageContent {
  base64?: string;
  url?: string;
  mimeType?: string;
}

// ── Tool Definitions ────────────────────────────────────────────────

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>; // JSON Schema
  };
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

// ── Options & Responses ─────────────────────────────────────────────

export interface ChatOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  /**
   * Caller-supplied abort signal. Providers compose this with their
   * internal timeout controller via `AbortSignal.any()` so the request
   * aborts when either the caller cancels or the timeout fires.
   * Strategies forward `AgentOptions.signal` here.
   */
  signal?: AbortSignal;
}

/**
 * Token usage report. All fields optional because not every provider
 * returns the breakdown. Consumers building credit-accounting layers
 * are responsible for handling the `undefined` case.
 */
export interface TokenUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface ChatResponse {
  content: string;
  /** @deprecated Use `usage.totalTokens`. */
  tokensUsed?: number;
  usage?: TokenUsage;
  model: string;
}

export interface ToolChatResponse {
  /** Text content (if model responded with text instead of tool calls) */
  content: string | null;
  /** Tool calls the model wants to make */
  toolCalls: ToolCall[];
  /** Whether the model finished (no more tool calls) */
  finished: boolean;
  /** @deprecated Use `usage.totalTokens`. */
  tokensUsed?: number;
  usage?: TokenUsage;
  model: string;
}
