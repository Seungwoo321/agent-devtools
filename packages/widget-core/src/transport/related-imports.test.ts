import { describe, expect, it, vi } from 'vitest';
import { createRelatedImportsFetcher } from './sse-transport.js';

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

describe('createRelatedImportsFetcher', () => {
  it('returns the deduped imports on success', async () => {
    const { fetch, captured } = makeFetch({
      json: { imports: ['src/App.tsx', 'src/util/x.ts', 'src/App.tsx'] },
    });
    const fetcher = createRelatedImportsFetcher({
      baseUrl: 'http://127.0.0.1:4317/',
      pairingToken: 'tok',
      fetch,
    });
    const out = await fetcher('src/Picked.tsx');
    expect(out).toEqual(['src/App.tsx', 'src/util/x.ts', 'src/App.tsx']);
    expect(captured).toHaveLength(1);
    expect(captured[0]?.url).toBe('http://127.0.0.1:4317/related-imports?file=src%2FPicked.tsx');
    const headers = captured[0]?.init.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer tok');
    expect(headers.accept).toBe('application/json');
  });

  it('strips trailing slashes from baseUrl', async () => {
    const { fetch, captured } = makeFetch({ json: { imports: [] } });
    const fetcher = createRelatedImportsFetcher({
      baseUrl: 'http://127.0.0.1:4317///',
      pairingToken: 'tok',
      fetch,
    });
    await fetcher('src/X.tsx');
    expect(captured[0]?.url).toBe('http://127.0.0.1:4317/related-imports?file=src%2FX.tsx');
  });

  it('returns [] when file is empty', async () => {
    const { fetch, captured } = makeFetch({ json: { imports: ['nope'] } });
    const fetcher = createRelatedImportsFetcher({
      baseUrl: 'http://127.0.0.1:4317',
      pairingToken: 'tok',
      fetch,
    });
    const out = await fetcher('');
    expect(out).toEqual([]);
    expect(captured).toHaveLength(0);
  });

  it('returns [] on non-OK responses', async () => {
    const { fetch } = makeFetch({ status: 500, json: { imports: ['x'] } });
    const fetcher = createRelatedImportsFetcher({
      baseUrl: 'http://127.0.0.1:4317',
      pairingToken: 'tok',
      fetch,
    });
    const out = await fetcher('src/X.tsx');
    expect(out).toEqual([]);
  });

  it('returns [] on fetch throw (network error)', async () => {
    const { fetch } = makeFetch({ throwOnFetch: new Error('econnrefused') });
    const fetcher = createRelatedImportsFetcher({
      baseUrl: 'http://127.0.0.1:4317',
      pairingToken: 'tok',
      fetch,
    });
    const out = await fetcher('src/X.tsx');
    expect(out).toEqual([]);
  });

  it('returns [] on JSON parse failure', async () => {
    const { fetch } = makeFetch({ throwOnJson: true });
    const fetcher = createRelatedImportsFetcher({
      baseUrl: 'http://127.0.0.1:4317',
      pairingToken: 'tok',
      fetch,
    });
    const out = await fetcher('src/X.tsx');
    expect(out).toEqual([]);
  });

  it('returns [] when payload.imports is not an array', async () => {
    const { fetch } = makeFetch({ json: { imports: 'oops' } });
    const fetcher = createRelatedImportsFetcher({
      baseUrl: 'http://127.0.0.1:4317',
      pairingToken: 'tok',
      fetch,
    });
    const out = await fetcher('src/X.tsx');
    expect(out).toEqual([]);
  });

  it('filters non-string entries from imports', async () => {
    const { fetch } = makeFetch({
      json: { imports: ['src/A.tsx', 42, null, 'src/B.tsx', ''] },
    });
    const fetcher = createRelatedImportsFetcher({
      baseUrl: 'http://127.0.0.1:4317',
      pairingToken: 'tok',
      fetch,
    });
    const out = await fetcher('src/X.tsx');
    expect(out).toEqual(['src/A.tsx', 'src/B.tsx']);
  });

  it('forwards an AbortSignal when provided', async () => {
    const { fetch, captured } = makeFetch({ json: { imports: [] } });
    const fetcher = createRelatedImportsFetcher({
      baseUrl: 'http://127.0.0.1:4317',
      pairingToken: 'tok',
      fetch,
    });
    const controller = new AbortController();
    await fetcher('src/X.tsx', controller.signal);
    expect(captured[0]?.init.signal).toBe(controller.signal);
  });
});
