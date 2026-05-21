/**
 * Base class for OpenAI-compatible LLM providers.
 *
 * Eliminates duplicated fetch/error-handling/vision/timeout logic
 * across OpenRouter, Groq, and Cerebras providers.
 */

import type {
  LLMProvider,
  ChatMessage,
  ChatOptions,
  ChatResponse,
  ImageContent,
  ContentPart,
  ToolDefinition,
  ToolChatResponse,
  TokenUsage,
} from './types.js';
import { resolveImageUrl, injectImageIntoMessages } from './message-utils.js';
import { ProviderInputError, isProviderInputStatus } from './errors.js';

/**
 * Translate an OpenAI-format `usage` block into the canonical `TokenUsage`.
 * Returns undefined when nothing usable is present so accumulators don't
 * see zero-filled placeholders.
 */
export function extractUsage(raw?: {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}): TokenUsage | undefined {
  if (!raw) return undefined;
  const { prompt_tokens, completion_tokens, total_tokens } = raw;
  if (prompt_tokens == null && completion_tokens == null && total_tokens == null) {
    return undefined;
  }
  return {
    ...(prompt_tokens !== undefined && { inputTokens: prompt_tokens }),
    ...(completion_tokens !== undefined && { outputTokens: completion_tokens }),
    ...(total_tokens !== undefined && { totalTokens: total_tokens }),
  };
}

const DEFAULT_TIMEOUT_MS = 60_000;

interface OpenAIApiResponse {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: { message?: string; code?: number | string };
}

export abstract class BaseOpenAICompatibleProvider implements LLMProvider {
  protected apiKey: string;
  protected defaultModel: string;

  constructor(apiKey: string, envVarName: string, model: string) {
    if (!apiKey) {
      throw new Error(`${envVarName} is required.`);
    }
    if (!model) {
      throw new Error(
        `${envVarName} provider: model is required (no defaults — pass an explicit model).`,
      );
    }
    this.apiKey = apiKey;
    this.defaultModel = model;
  }

  /** API endpoint URL */
  protected abstract get apiUrl(): string;

  /**
   * Canonical provider name. Public for the LLMProvider interface
   * (telemetry / metadata) and used internally for error messages.
   */
  abstract get providerName(): string;

  /** Build provider-specific HTTP headers */
  protected abstract buildHeaders(): Record<string, string>;

  /** Whether this provider supports tool/function calling */
  get supportsTools(): boolean {
    return false;
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    const model = options?.model || this.defaultModel;
    return this.callApi(model, messages, options);
  }

  async chatWithVision(
    messages: ChatMessage[],
    imageContent: ImageContent,
    options?: ChatOptions,
  ): Promise<ChatResponse> {
    const imageUrl = resolveImageUrl(imageContent);
    if (!imageUrl) {
      throw new Error('No image provided. Supply base64 or url in ImageContent.');
    }

    const imagePart: ContentPart = {
      type: 'image_url',
      image_url: { url: imageUrl },
    };

    const augmented = injectImageIntoMessages(messages, imagePart);
    return this.chat(augmented, options);
  }

  async chatWithTools(
    messages: ChatMessage[],
    _tools: ToolDefinition[],
    options?: ChatOptions,
  ): Promise<ToolChatResponse> {
    const response = await this.chat(messages, options);
    return {
      content: response.content,
      toolCalls: [],
      finished: true,
      ...(response.tokensUsed !== undefined && { tokensUsed: response.tokensUsed }),
      model: response.model,
    };
  }

  /**
   * Call the provider's API with a specific model.
   * Handles timeout, HTTP errors (429/402), and empty responses.
   *
   * `options.signal` (caller cancellation) is composed with an internal
   * timeout controller via `AbortSignal.any()` so the fetch aborts on
   * whichever fires first — caller disconnects, or the timeout expires.
   */
  protected async callApi(
    model: string,
    messages: ChatMessage[],
    options?: ChatOptions,
  ): Promise<ChatResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    const signal = options?.signal
      ? AbortSignal.any([controller.signal, options.signal])
      : controller.signal;

    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify({
          model,
          messages,
          max_tokens: options?.maxTokens ?? 4096,
          temperature: options?.temperature ?? 0.1,
        }),
        signal,
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as OpenAIApiResponse;
        const errorMsg = errorData.error?.message || response.statusText;

        if (response.status === 429) {
          throw new Error(`Rate limited (429) on ${model}: ${errorMsg}`);
        }
        if (response.status === 402 || response.status === 403) {
          throw new Error(
            `Access denied (${response.status}): ${errorMsg}. Check your ${this.providerName} API key and credits.`,
          );
        }
        if (isProviderInputStatus(response.status)) {
          throw new ProviderInputError(
            `${this.providerName} rejected request (${response.status}) on ${model}: ${errorMsg}`,
            response.status,
            this.providerName,
          );
        }
        throw new Error(`${this.providerName} API error ${response.status}: ${errorMsg}`);
      }

      const data = (await response.json()) as OpenAIApiResponse;

      // Handle API-level errors in the response body
      if (data.error) {
        throw new Error(`${this.providerName} response error: ${data.error.message || 'Unknown'}`);
      }

      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error('Empty response from model — no content in choices');
      }

      const tokensUsed = data.usage?.total_tokens;
      const usage = extractUsage(data.usage);
      return {
        content,
        ...(tokensUsed !== undefined && { tokensUsed }),
        ...(usage !== undefined && { usage }),
        model,
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        if (options?.signal?.aborted) {
          throw new Error(`Request to ${model} cancelled by caller`, { cause: error });
        }
        throw new Error(`Request to ${model} timed out after ${DEFAULT_TIMEOUT_MS}ms`, {
          cause: error,
        });
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}
