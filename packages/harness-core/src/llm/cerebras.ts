/**
 * Cerebras LLM Provider
 *
 * Uses Cerebras' OpenAI-compatible API for ultra-fast inference.
 * 1M TPD free tier, no credit card required.
 * Reference: https://inference-docs.cerebras.ai
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

const CEREBRAS_API_URL = 'https://api.cerebras.ai/v1/chat/completions';
const REQUEST_TIMEOUT_MS = 60_000;

/** Cerebras models ordered by preference */
export const CEREBRAS_MODELS = [
  'qwen-3-235b-a22b-instruct-2507',
  'gpt-oss-120b',
  'llama3.1-8b',
] as const;

export type CerebrasModel = (typeof CEREBRAS_MODELS)[number];

interface CerebrasToolApiResponse {
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

export class CerebrasProvider extends BaseOpenAICompatibleProvider {
  constructor(apiKey: string, model: string) {
    super(apiKey, 'CEREBRAS_API_KEY', model);
  }

  protected get apiUrl(): string {
    return CEREBRAS_API_URL;
  }

  get providerName(): string {
    return 'Cerebras';
  }

  protected buildHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };
  }

  /** Cerebras supports tool/function calling */
  override get supportsTools(): boolean {
    return true;
  }

  /** List of available models for this provider */
  get models(): string[] {
    return [...CEREBRAS_MODELS];
  }

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
      const response = await fetch(CEREBRAS_API_URL, {
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
        const rawBody = await response.text().catch(() => '');
        let errorData: CerebrasToolApiResponse = {};
        try {
          errorData = JSON.parse(rawBody) as CerebrasToolApiResponse;
        } catch {
          // rawBody is not JSON — fall through with the empty default
        }
        const errorMsg = errorData.error?.message || rawBody.slice(0, 500) || response.statusText;
        if (response.status === 429) {
          throw new Error(`Rate limited (429) on ${model}: ${errorMsg}`);
        }
        if (isProviderInputStatus(response.status)) {
          throw new ProviderInputError(
            `Cerebras rejected request (${response.status}) on ${model}: ${errorMsg}`,
            response.status,
            'Cerebras',
          );
        }
        throw new Error(`Cerebras API error ${response.status}: ${errorMsg}`);
      }

      const data = (await response.json()) as CerebrasToolApiResponse;

      if (data.error) {
        throw new Error(`Cerebras response error: ${data.error.message || 'Unknown'}`);
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
