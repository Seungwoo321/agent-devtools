/**
 * Groq LLM Provider
 *
 * Uses Groq's OpenAI-compatible API for ultra-fast inference.
 * Reference: https://console.groq.com/docs/api-reference
 *
 * Supports tool/function calling via chatWithTools override.
 */

import type {
  ChatMessage,
  ChatOptions,
  ToolDefinition,
  ToolChatResponse,
  ToolCall,
} from './types.js';
import { BaseOpenAICompatibleProvider, extractUsage } from './base-provider.js';
import { ProviderInputError, isProviderInputStatus } from './errors.js';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const REQUEST_TIMEOUT_MS = 60_000;

/** Groq models ordered by preference (llama-4-scout first — 500K TPD) */
export const GROQ_MODELS = [
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'llama-3.3-70b-versatile',
  'qwen/qwen3-32b',
  'llama-3.1-8b-instant',
] as const;

export type GroqModel = (typeof GROQ_MODELS)[number];

interface GroqToolApiResponse {
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
  error?: { message?: string; type?: string };
}

export class GroqProvider extends BaseOpenAICompatibleProvider {
  constructor(apiKey: string, model: string) {
    super(apiKey, 'GROQ_API_KEY', model);
  }

  protected get apiUrl(): string {
    return GROQ_API_URL;
  }

  get providerName(): string {
    return 'Groq';
  }

  protected buildHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };
  }

  /** Groq supports tool/function calling */
  override get supportsTools(): boolean {
    return true;
  }

  /** List of available models for this provider */
  get models(): string[] {
    return [...GROQ_MODELS];
  }

  /**
   * Chat with tool definitions — Claude Code style.
   * Model can call tools; caller executes them and feeds results back.
   */
  override async chatWithTools(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    options?: ChatOptions,
  ): Promise<ToolChatResponse> {
    const model = options?.model || this.defaultModel;
    return this.callApiWithTools(model, messages, tools, options);
  }

  private async callApiWithTools(
    model: string,
    messages: ChatMessage[],
    tools: ToolDefinition[],
    options?: ChatOptions,
  ): Promise<ToolChatResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const signal = options?.signal
      ? AbortSignal.any([controller.signal, options.signal])
      : controller.signal;

    try {
      const response = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify({
          model,
          messages,
          tools,
          max_tokens: options?.maxTokens ?? 4096,
          temperature: options?.temperature ?? 0.1,
        }),
        signal,
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as GroqToolApiResponse;
        const errorMsg = errorData.error?.message || response.statusText;
        if (response.status === 429) {
          throw new Error(`Rate limited (429) on ${model}: ${errorMsg}`);
        }
        if (isProviderInputStatus(response.status)) {
          throw new ProviderInputError(
            `Groq rejected request (${response.status}) on ${model}: ${errorMsg}`,
            response.status,
            'Groq',
          );
        }
        throw new Error(`Groq API error ${response.status}: ${errorMsg}`);
      }

      const data = (await response.json()) as GroqToolApiResponse;

      if (data.error) {
        throw new Error(`Groq response error: ${data.error.message || 'Unknown'}`);
      }

      const choice = data.choices?.[0];
      const msg = choice?.message;
      const toolCalls: ToolCall[] =
        msg?.tool_calls?.map((tc) => ({
          id: tc.id,
          type: 'function' as const,
          function: { name: tc.function.name, arguments: tc.function.arguments },
        })) || [];

      const tokensUsed = data.usage?.total_tokens;
      const usage = extractUsage(data.usage);
      return {
        content: msg?.content || null,
        toolCalls,
        finished: toolCalls.length === 0,
        ...(tokensUsed !== undefined && { tokensUsed }),
        ...(usage !== undefined && { usage }),
        model,
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        if (options?.signal?.aborted) {
          throw new Error(`Request to ${model} cancelled by caller`, { cause: error });
        }
        throw new Error(`Request to ${model} timed out after ${REQUEST_TIMEOUT_MS}ms`, {
          cause: error,
        });
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}
