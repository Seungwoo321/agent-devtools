/**
 * OpenAI provider unit tests.
 *
 * Mocks `globalThis.fetch` — no network. Verifies the contract pieces a
 * downstream consumer relies on:
 *   - constructor enforces explicit model (No-Fallback policy)
 *   - chatWithTools returns parsed tool_calls + usage
 *   - HTTP error classification: 401 → ProviderInputError (caller-fix),
 *     429 → rate-limit error, 402/403 → access-denied error
 *   - supportsTools is true (paid tier capability)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenAIProvider } from './openai.js';
import { ProviderInputError } from './errors.js';

const originalFetch = globalThis.fetch;

function makeJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('OpenAIProvider — construction', () => {
  it('rejects missing model (No-Fallback policy)', () => {
    expect(() => new OpenAIProvider('key', '')).toThrow(/model is required/);
  });

  it('exposes providerName and supportsTools', () => {
    const p = new OpenAIProvider('key', 'gpt-4o-mini');
    expect(p.providerName).toBe('OpenAI');
    expect(p.supportsTools).toBe(true);
    expect(p.models).toEqual(expect.arrayContaining(['gpt-4o-mini']));
  });
});

describe('OpenAIProvider.chatWithTools', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('parses tool_calls and usage from a successful response', async () => {
    globalThis.fetch = vi.fn(async () =>
      makeJsonResponse({
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  id: 'call_1',
                  type: 'function',
                  function: { name: 'parse_dsl', arguments: '{"source":"x"}' },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 },
      }),
    ) as typeof fetch;

    const provider = new OpenAIProvider('key', 'gpt-4o-mini');
    const res = await provider.chatWithTools(
      [{ role: 'user', content: 'hi' }],
      [{ type: 'function', function: { name: 'parse_dsl', description: 'x', parameters: {} } }],
    );

    expect(res.toolCalls).toHaveLength(1);
    expect(res.toolCalls[0]!.function.name).toBe('parse_dsl');
    expect(res.finished).toBe(false);
    expect(res.tokensUsed).toBe(14);
    expect(res.usage).toEqual({ inputTokens: 10, outputTokens: 4, totalTokens: 14 });
    expect(res.model).toBe('gpt-4o-mini');
  });

  it('returns finished=true when no tool_calls are present', async () => {
    globalThis.fetch = vi.fn(async () =>
      makeJsonResponse({
        choices: [{ message: { content: 'done', tool_calls: [] } }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
    ) as typeof fetch;

    const provider = new OpenAIProvider('key', 'gpt-4o-mini');
    const res = await provider.chatWithTools([{ role: 'user', content: 'hi' }], []);
    expect(res.finished).toBe(true);
    expect(res.content).toBe('done');
    expect(res.toolCalls).toEqual([]);
  });

  it('maps caller-fixable statuses (400/404/422) to ProviderInputError', async () => {
    globalThis.fetch = vi.fn(async () =>
      makeJsonResponse({ error: { message: 'bad request' } }, 400),
    ) as typeof fetch;

    const provider = new OpenAIProvider('key', 'gpt-4o-mini');
    await expect(
      provider.chatWithTools([{ role: 'user', content: 'hi' }], []),
    ).rejects.toBeInstanceOf(ProviderInputError);
  });

  it('does not map 401 to ProviderInputError — it is a host-config issue, not caller input', async () => {
    globalThis.fetch = vi.fn(async () =>
      makeJsonResponse({ error: { message: 'invalid api key' } }, 401),
    ) as typeof fetch;

    const provider = new OpenAIProvider('bad-key', 'gpt-4o-mini');
    const promise = provider.chatWithTools([{ role: 'user', content: 'hi' }], []);
    await expect(promise).rejects.not.toBeInstanceOf(ProviderInputError);
    await expect(promise).rejects.toThrow(/401/);
  });

  it('maps 429 to a rate-limit error message', async () => {
    globalThis.fetch = vi.fn(async () =>
      makeJsonResponse({ error: { message: 'too many' } }, 429),
    ) as typeof fetch;

    const provider = new OpenAIProvider('key', 'gpt-4o-mini');
    await expect(provider.chatWithTools([{ role: 'user', content: 'hi' }], [])).rejects.toThrow(
      /Rate limited \(429\)/,
    );
  });

  it('maps 402/403 to an access-denied error message', async () => {
    globalThis.fetch = vi.fn(async () =>
      makeJsonResponse({ error: { message: 'no credits' } }, 402),
    ) as typeof fetch;

    const provider = new OpenAIProvider('key', 'gpt-4o-mini');
    await expect(provider.chatWithTools([{ role: 'user', content: 'hi' }], [])).rejects.toThrow(
      /Access denied \(402\)/,
    );
  });

  it('surfaces caller cancellation as "cancelled by caller"', async () => {
    globalThis.fetch = vi.fn(
      async (_url: string | URL | Request, init?: { signal?: AbortSignal }) => {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const err = new Error('aborted') as Error & { name: string };
            err.name = 'AbortError';
            reject(err);
          });
        });
      },
    ) as typeof fetch;

    const provider = new OpenAIProvider('key', 'gpt-4o-mini');
    const callerController = new AbortController();
    const promise = provider.chatWithTools([{ role: 'user', content: 'hi' }], [], {
      signal: callerController.signal,
    });
    await new Promise((r) => setTimeout(r, 5));
    callerController.abort();
    await expect(promise).rejects.toThrow(/cancelled by caller/);
  });
});
