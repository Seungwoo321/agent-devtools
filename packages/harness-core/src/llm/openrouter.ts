/**
 * OpenRouter LLM Provider (Free Tier)
 *
 * Uses free models from OpenRouter.
 *
 * OpenRouter recommends sending HTTP-Referer / X-Title for app attribution
 * on its analytics dashboard. The generic harness reads them from the env
 * (OPENROUTER_REFERER / OPENROUTER_TITLE) so the host application owns its
 * own identity — this package does not embed any consumer's branding.
 */

import { BaseOpenAICompatibleProvider } from './base-provider.js';

/** Free models ordered by quality */
export const FREE_MODELS = [
  'qwen/qwen3-coder:free',
  'google/gemma-3-27b-it:free',
  'nvidia/nemotron-nano-12b-v2-vl:free',
  'meta-llama/llama-3.3-70b-instruct:free',
] as const;

export type FreeModel = (typeof FREE_MODELS)[number];

export class OpenRouterProvider extends BaseOpenAICompatibleProvider {
  constructor(apiKey: string, model: string) {
    super(apiKey, 'OPENROUTER_API_KEY', model);
  }

  protected get apiUrl(): string {
    return 'https://openrouter.ai/api/v1/chat/completions';
  }

  get providerName(): string {
    return 'OpenRouter';
  }

  protected buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };
    const referer = process.env.OPENROUTER_REFERER;
    const title = process.env.OPENROUTER_TITLE;
    if (referer) headers['HTTP-Referer'] = referer;
    if (title) headers['X-Title'] = title;
    return headers;
  }

  /** List of available models for this provider */
  get models(): string[] {
    return [...FREE_MODELS];
  }
}
