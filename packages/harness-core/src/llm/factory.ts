/**
 * LLM Provider Factory
 *
 * Creates provider instances by name, and reports which providers are
 * available based on environment variables.
 *
 * No-Fallback policy: this module never picks a provider/model on the
 * caller's behalf. Tier / quota policy and (provider, model) selection
 * live in the host that mounts the binding (consumer-owned — see
 * TierResolver<TCtx> in ../core/types.ts for the extension point).
 */

import type { LLMProvider } from './types.js';
import type { SessionProvider } from './session-types.js';
import { OpenRouterProvider, FREE_MODELS } from './openrouter.js';
import { GroqProvider, GROQ_MODELS } from './groq.js';
import { CerebrasProvider, CEREBRAS_MODELS } from './cerebras.js';
import { OpenAIProvider, OPENAI_MODELS } from './openai.js';
import { ClaudeAgentSDKProvider, type ClaudeAgentSDKConfig } from './claude-agent-sdk.js';

export type ProviderName = 'openrouter' | 'groq' | 'cerebras' | 'openai';

/**
 * Session-style provider identifiers. Kept separate from `ProviderName`
 * because the two return different shapes (`SessionProvider` vs
 * `LLMProvider`) and hosts route to different loop strategies.
 *
 * Today the only session provider is the Claude Agent SDK. New entries
 * here should also extend `createSessionProvider` below.
 */
export type SessionProviderName = 'claude-agent-sdk';

/**
 * Create a provider instance by name and model.
 * No-Fallback policy: both `name` and `model` must be specified by the
 * caller; the harness never picks a default.
 *
 * Throws if the required API key is not set in the environment.
 */
export function createProvider(name: ProviderName, model: string): LLMProvider {
  if (!model) {
    throw new Error(
      `createProvider: model is required for provider "${name}". ` +
        `The harness does not pick defaults — pass an explicit model.`,
    );
  }
  switch (name) {
    case 'openrouter':
      return new OpenRouterProvider(process.env.OPENROUTER_API_KEY!, model);
    case 'groq':
      return new GroqProvider(process.env.GROQ_API_KEY!, model);
    case 'cerebras':
      return new CerebrasProvider(process.env.CEREBRAS_API_KEY!, model);
    case 'openai':
      return new OpenAIProvider(process.env.OPENAI_API_KEY!, model);
    default:
      throw new Error(`Unknown provider: ${name as string}`);
  }
}

/**
 * Read DEFAULT_LLM_PROVIDER from env, if set and valid. Returns undefined
 * when the env var is missing or not one of the known providers — the
 * caller decides what to do with that.
 */
export function getDefaultProvider(): ProviderName | undefined {
  const envValue = process.env.DEFAULT_LLM_PROVIDER;
  return envValue && isValidProvider(envValue) ? envValue : undefined;
}

/**
 * List providers that have API keys configured.
 */
export function getAvailableProviders(): ProviderName[] {
  const providers: ProviderName[] = [];
  if (process.env.OPENROUTER_API_KEY) providers.push('openrouter');
  if (process.env.GROQ_API_KEY) providers.push('groq');
  if (process.env.CEREBRAS_API_KEY) providers.push('cerebras');
  if (process.env.OPENAI_API_KEY) providers.push('openai');
  return providers;
}

/**
 * Get model list for a given provider.
 */
export function getProviderModels(name: ProviderName): readonly string[] {
  switch (name) {
    case 'openrouter':
      return FREE_MODELS;
    case 'groq':
      return GROQ_MODELS;
    case 'cerebras':
      return CEREBRAS_MODELS;
    case 'openai':
      return OPENAI_MODELS;
    default:
      return [];
  }
}

/**
 * Build a provider info object for an HTTP info endpoint. The `default`
 * field is only present when DEFAULT_LLM_PROVIDER is explicitly set.
 */
export function getProvidersInfo(): {
  available: ProviderName[];
  default: ProviderName | undefined;
  providers: Record<string, { models: readonly string[] }>;
} {
  const available = getAvailableProviders();
  const defaultProvider = getDefaultProvider();

  const providers: Record<string, { models: readonly string[] }> = {};
  for (const name of available) {
    providers[name] = { models: getProviderModels(name) };
  }

  return {
    available,
    default: defaultProvider,
    providers,
  };
}

function isValidProvider(value: string): value is ProviderName {
  return ['openrouter', 'groq', 'cerebras', 'openai'].includes(value);
}

/**
 * Construct a session-style provider. Sibling to `createProvider` — same
 * No-Fallback contract (both `name` and `model` required, no env-driven
 * defaults) but returns a `SessionProvider` instead of an `LLMProvider`.
 *
 * Host TierResolvers wrap the result as `{ kind: 'session', provider }`
 * before returning a `TierResolution`. The route layer then picks
 * `sdkSessionLoop` based on the `kind` discriminator.
 *
 * The optional config is forwarded to the underlying provider — API key
 * override, tool allow-list, permission mode, etc. See `ClaudeAgentSDKConfig`.
 */
export function createSessionProvider(
  name: SessionProviderName,
  model: string,
  options?: Omit<ClaudeAgentSDKConfig, 'model'>,
): SessionProvider {
  if (!model) {
    throw new Error(
      `createSessionProvider: model is required for provider "${name}". ` +
        `The harness does not pick defaults — pass an explicit model.`,
    );
  }
  switch (name) {
    case 'claude-agent-sdk':
      return new ClaudeAgentSDKProvider({ ...options, model });
    default:
      throw new Error(`Unknown session provider: ${name as string}`);
  }
}

/**
 * List session providers that have credentials/SDK available. Today only
 * `claude-agent-sdk` is known — it requires either `ANTHROPIC_API_KEY`
 * (headless) or a Claude Code subscription auth (handled by the SDK itself).
 * We surface it whenever `ANTHROPIC_API_KEY` is set; subscription-only
 * setups are deployment-specific and host-driven.
 */
export function getAvailableSessionProviders(): SessionProviderName[] {
  const providers: SessionProviderName[] = [];
  if (process.env.ANTHROPIC_API_KEY) providers.push('claude-agent-sdk');
  return providers;
}
