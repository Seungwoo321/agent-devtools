import { describe, expect, it, vi } from 'vitest';
import { createSourceSliceFetcher } from './sse-transport.js';

interface CapturedRequest {
  readonly url: string;
  readonly init: RequestInit;
}

function makeFetch(response: {
  readonly status?: number;
  readonly json?: unknown;
  readonly throwOnJson?: boolean;
  readonly throwOnFetch?: Error;
}): { fetch: typeof fetch; captured: CapturedRequest[] } {
  const captured: CapturedRequest[] = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    captured.push({ url: String(input), init: init ?? {} });
    if (response.throwOnFetch) throw response.throwOnFetch;
    return {
      ok: (response.status ?? 200) < 400,
      status: response.status ?? 200,
      async json(): Promise<unknown> {
        if (response.throwOnJson) throw new Error('bad json');
        return response.json;
      },
    } as Response;
  }) as unknown as typeof fetch;
  return { fetch: fetchImpl, captured };
}

describe('createSourceSliceFetcher', () => {
  it('returns the payload on success and forms a workspace-rooted URL', async () => {
    const { fetch, captured } = makeFetch({
      json: { code: 'line\nline\nline', startLine: 3, endLine: 5 },
    });
    const fetcher = createSourceSliceFetcher({
      baseUrl: 'http://127.0.0.1:4317/',
      pairingToken: 'tok',
      fetch,
    });
    const out = await fetcher('src/App.tsx', 4);
    expect(out).toEqual({ code: 'line\nline\nline', startLine: 3, endLine: 5 });
    expect(captured).toHaveLength(1);
    expect(captured[0]?.url).toBe('http://127.0.0.1:4317/source-slice?file=src%2FApp.tsx&line=4');
    const headers = captured[0]?.init.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer tok');
    expect(headers.accept).toBe('application/json');
  });

  it('strips trailing slashes from baseUrl', async () => {
    const { fetch, captured } = makeFetch({
      json: { code: 'x', startLine: 1, endLine: 1 },
    });
    const fetcher = createSourceSliceFetcher({
      baseUrl: 'http://127.0.0.1:4317///',
      pairingToken: 'tok',
      fetch,
    });
    await fetcher('src/X.tsx', 1);
    expect(captured[0]?.url).toBe('http://127.0.0.1:4317/source-slice?file=src%2FX.tsx&line=1');
  });

  it('floors fractional line numbers in the URL', async () => {
    const { fetch, captured } = makeFetch({
      json: { code: 'x', startLine: 1, endLine: 1 },
    });
    const fetcher = createSourceSliceFetcher({
      baseUrl: 'http://127.0.0.1:4317',
      pairingToken: 'tok',
      fetch,
    });
    await fetcher('src/X.tsx', 12.9);
    expect(captured[0]?.url).toBe('http://127.0.0.1:4317/source-slice?file=src%2FX.tsx&line=12');
  });

  it('returns null when file is empty', async () => {
    const { fetch, captured } = makeFetch({
      json: { code: 'x', startLine: 1, endLine: 1 },
    });
    const fetcher = createSourceSliceFetcher({
      baseUrl: 'http://127.0.0.1:4317',
      pairingToken: 'tok',
      fetch,
    });
    const out = await fetcher('', 4);
    expect(out).toBeNull();
    expect(captured).toHaveLength(0);
  });

  it('returns null when line is not a positive integer', async () => {
    const { fetch, captured } = makeFetch({
      json: { code: 'x', startLine: 1, endLine: 1 },
    });
    const fetcher = createSourceSliceFetcher({
      baseUrl: 'http://127.0.0.1:4317',
      pairingToken: 'tok',
      fetch,
    });
    expect(await fetcher('src/X.tsx', 0)).toBeNull();
    expect(await fetcher('src/X.tsx', -1)).toBeNull();
    expect(await fetcher('src/X.tsx', Number.NaN)).toBeNull();
    expect(await fetcher('src/X.tsx', Number.POSITIVE_INFINITY)).toBeNull();
    expect(captured).toHaveLength(0);
  });

  it('returns null on non-OK responses', async () => {
    const { fetch } = makeFetch({ status: 500, json: { code: 'x', startLine: 1, endLine: 1 } });
    const fetcher = createSourceSliceFetcher({
      baseUrl: 'http://127.0.0.1:4317',
      pairingToken: 'tok',
      fetch,
    });
    expect(await fetcher('src/X.tsx', 1)).toBeNull();
  });

  it('returns null on fetch throw (network error)', async () => {
    const { fetch } = makeFetch({ throwOnFetch: new Error('econnrefused') });
    const fetcher = createSourceSliceFetcher({
      baseUrl: 'http://127.0.0.1:4317',
      pairingToken: 'tok',
      fetch,
    });
    expect(await fetcher('src/X.tsx', 1)).toBeNull();
  });

  it('returns null on JSON parse failure', async () => {
    const { fetch } = makeFetch({ throwOnJson: true });
    const fetcher = createSourceSliceFetcher({
      baseUrl: 'http://127.0.0.1:4317',
      pairingToken: 'tok',
      fetch,
    });
    expect(await fetcher('src/X.tsx', 1)).toBeNull();
  });

  it('returns null when payload shape is invalid', async () => {
    const cases: Array<unknown> = [
      { code: 42, startLine: 1, endLine: 1 },
      { code: 'x', startLine: 'one', endLine: 1 },
      { code: 'x', startLine: 1, endLine: 'one' },
      { code: 'x', startLine: 0, endLine: 1 },
      { code: 'x', startLine: 3, endLine: 2 },
      {},
      null,
    ];
    for (const json of cases) {
      const { fetch } = makeFetch({ json });
      const fetcher = createSourceSliceFetcher({
        baseUrl: 'http://127.0.0.1:4317',
        pairingToken: 'tok',
        fetch,
      });
      expect(await fetcher('src/X.tsx', 1)).toBeNull();
    }
  });

  it('forwards a derived AbortSignal so the internal timeout can interrupt the fetch', async () => {
    const { fetch, captured } = makeFetch({
      json: { code: 'x', startLine: 1, endLine: 1 },
    });
    const fetcher = createSourceSliceFetcher({
      baseUrl: 'http://127.0.0.1:4317',
      pairingToken: 'tok',
      fetch,
    });
    const callerController = new AbortController();
    await fetcher('src/X.tsx', 1, callerController.signal);
    const derived = captured[0]?.init.signal as AbortSignal | undefined;
    expect(derived).toBeInstanceOf(AbortSignal);
    expect(derived).not.toBe(callerController.signal);
  });

  it('returns null when the internal timeout fires before the dev server responds', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (!signal) return;
        if (signal.aborted) {
          reject(new DOMException('aborted', 'AbortError'));
          return;
        }
        signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), {
          once: true,
        });
      });
    }) as unknown as typeof fetch;

    const fetcher = createSourceSliceFetcher({
      baseUrl: 'http://127.0.0.1:4317',
      pairingToken: 'tok',
      fetch: fetchImpl,
      timeoutMs: 10,
    });
    const out = await fetcher('src/Picked.tsx', 4);
    expect(out).toBeNull();
  });

  it('aborts the in-flight fetch when the caller signal fires', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          'abort',
          () => reject(new DOMException('aborted', 'AbortError')),
          { once: true },
        );
      });
    }) as unknown as typeof fetch;

    const fetcher = createSourceSliceFetcher({
      baseUrl: 'http://127.0.0.1:4317',
      pairingToken: 'tok',
      fetch: fetchImpl,
      timeoutMs: 0,
    });
    const caller = new AbortController();
    const pending = fetcher('src/X.tsx', 1, caller.signal);
    caller.abort();
    const out = await pending;
    expect(out).toBeNull();
  });
});
