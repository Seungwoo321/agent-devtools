/**
 * AbortSignal contract tests.
 *
 * Verifies that caller-supplied `ChatOptions.signal` propagates to the
 * provider's underlying `fetch` and that an externally-aborted signal
 * surfaces as a "cancelled by caller" error rather than a "timed out"
 * error — the route uses this distinction for telemetry / status codes.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GroqProvider } from './groq.js';
import { CerebrasProvider } from './cerebras.js';

interface FakeFetchInit {
  signal?: AbortSignal;
}

function makeFakeOkResponse(): Response {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content: 'ok', tool_calls: [] } }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

describe('ChatOptions.signal propagation', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('passes a composed signal to fetch — caller signal triggers abort', async () => {
    let capturedSignal: AbortSignal | undefined;
    globalThis.fetch = vi.fn(async (_url: string | URL | Request, init?: FakeFetchInit) => {
      capturedSignal = init?.signal;
      return new Promise<Response>((_resolve, reject) => {
        // Mimic real fetch: reject when its signal aborts
        init?.signal?.addEventListener('abort', () => {
          const err = new Error('aborted') as Error & { name: string };
          err.name = 'AbortError';
          reject(err);
        });
      });
    }) as typeof fetch;

    const provider = new GroqProvider('fake-key', 'fake-model');
    const callerController = new AbortController();
    const promise = provider.chatWithTools([{ role: 'user', content: 'hi' }], [], {
      signal: callerController.signal,
    });

    // Wait for fetch to be called and signal captured
    await new Promise((r) => setTimeout(r, 10));
    expect(capturedSignal).toBeDefined();
    expect(capturedSignal?.aborted).toBe(false);

    // Caller cancels — composed signal should fire
    callerController.abort();

    await expect(promise).rejects.toThrow(/cancelled by caller/);
  });

  it('cerebras: caller-aborted signal produces "cancelled by caller" not "timed out"', async () => {
    globalThis.fetch = vi.fn(async (_url: string | URL | Request, init?: FakeFetchInit) => {
      return new Promise<Response>((_resolve, reject) => {
        const abortErr = () => {
          const err = new Error('aborted') as Error & { name: string };
          err.name = 'AbortError';
          reject(err);
        };
        if (init?.signal?.aborted) {
          abortErr();
          return;
        }
        init?.signal?.addEventListener('abort', abortErr);
      });
    }) as typeof fetch;

    const provider = new CerebrasProvider('fake-key', 'fake-model');
    const callerController = new AbortController();
    callerController.abort(); // pre-aborted

    await expect(
      provider.chatWithTools([{ role: 'user', content: 'hi' }], [], {
        signal: callerController.signal,
      }),
    ).rejects.toThrow(/cancelled by caller/);
  });

  it('completes normally when signal is provided but never aborted', async () => {
    globalThis.fetch = vi.fn(async () => makeFakeOkResponse()) as typeof fetch;

    const provider = new GroqProvider('fake-key', 'fake-model');
    const callerController = new AbortController();
    const result = await provider.chatWithTools([{ role: 'user', content: 'hi' }], [], {
      signal: callerController.signal,
    });
    expect(result.content).toBe('ok');
  });

  it('base provider chat() — caller signal aborts fetch and surfaces "cancelled by caller"', async () => {
    globalThis.fetch = vi.fn(async (_url: string | URL | Request, init?: FakeFetchInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const err = new Error('aborted') as Error & { name: string };
          err.name = 'AbortError';
          reject(err);
        });
      });
    }) as typeof fetch;

    // GroqProvider extends BaseOpenAICompatibleProvider — chat() goes via callApi
    const provider = new GroqProvider('fake-key', 'fake-model');
    const callerController = new AbortController();
    const promise = provider.chat([{ role: 'user', content: 'hi' }], {
      signal: callerController.signal,
    });

    await new Promise((r) => setTimeout(r, 10));
    callerController.abort();

    await expect(promise).rejects.toThrow(/cancelled by caller/);
  });
});
