import { describe, expect, it, vi } from 'vitest';
import { createAgentCommandsFetcher } from './sse-transport.js';

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

describe('createAgentCommandsFetcher', () => {
  it('maps a well-formed catalogue to SlashCommandInfo[] with and without argument hints', async () => {
    const { fetch, captured } = makeFetch({
      json: {
        commands: [
          { name: 'init', description: 'Set up the project', input: { hint: '[dir]' } },
          { name: 'help', description: 'Show help' },
          { name: 'clear', description: 'Clear chat', input: null },
        ],
      },
    });
    const fetcher = createAgentCommandsFetcher({
      baseUrl: 'http://127.0.0.1:4317/',
      pairingToken: 'tok',
      fetch,
    });
    const out = await fetcher();
    expect(out).toEqual([
      { name: 'init', description: 'Set up the project', argumentHint: '[dir]' },
      { name: 'help', description: 'Show help' },
      { name: 'clear', description: 'Clear chat' },
    ]);
    expect(captured).toHaveLength(1);
    expect(captured[0]?.url).toBe('http://127.0.0.1:4317/v1/agent/commands');
  });

  it('sends the pairing-token Authorization header and accept header', async () => {
    const { fetch, captured } = makeFetch({ json: { commands: [] } });
    const fetcher = createAgentCommandsFetcher({
      baseUrl: 'http://127.0.0.1:4317',
      pairingToken: 'secret-tok',
      fetch,
    });
    await fetcher();
    const headers = captured[0]?.init.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer secret-tok');
    expect(headers.accept).toBe('application/json');
    expect(captured[0]?.init.method).toBe('GET');
  });

  it('strips trailing slashes from baseUrl', async () => {
    const { fetch, captured } = makeFetch({ json: { commands: [] } });
    const fetcher = createAgentCommandsFetcher({
      baseUrl: 'http://127.0.0.1:4317///',
      pairingToken: 'tok',
      fetch,
    });
    await fetcher();
    expect(captured[0]?.url).toBe('http://127.0.0.1:4317/v1/agent/commands');
  });

  it('defaults description to "" when missing or non-string', async () => {
    const { fetch } = makeFetch({
      json: { commands: [{ name: 'go' }, { name: 'stop', description: 42 }] },
    });
    const fetcher = createAgentCommandsFetcher({
      baseUrl: 'http://127.0.0.1:4317',
      pairingToken: 'tok',
      fetch,
    });
    const out = await fetcher();
    expect(out).toEqual([
      { name: 'go', description: '' },
      { name: 'stop', description: '' },
    ]);
  });

  it('omits argumentHint when input.hint is missing or non-string', async () => {
    const { fetch } = makeFetch({
      json: {
        commands: [
          { name: 'a', description: 'A', input: {} },
          { name: 'b', description: 'B', input: { hint: 7 } },
        ],
      },
    });
    const fetcher = createAgentCommandsFetcher({
      baseUrl: 'http://127.0.0.1:4317',
      pairingToken: 'tok',
      fetch,
    });
    const out = await fetcher();
    expect(out).toEqual([
      { name: 'a', description: 'A' },
      { name: 'b', description: 'B' },
    ]);
    expect(out[0]).not.toHaveProperty('argumentHint');
  });

  it('skips entries without a usable name', async () => {
    const { fetch } = makeFetch({
      json: {
        commands: [{ description: 'no name' }, { name: '', description: 'empty' }, 42, null],
      },
    });
    const fetcher = createAgentCommandsFetcher({
      baseUrl: 'http://127.0.0.1:4317',
      pairingToken: 'tok',
      fetch,
    });
    const out = await fetcher();
    expect(out).toEqual([]);
  });

  it('returns [] on non-OK responses', async () => {
    const { fetch } = makeFetch({
      status: 500,
      json: { commands: [{ name: 'x', description: '' }] },
    });
    const fetcher = createAgentCommandsFetcher({
      baseUrl: 'http://127.0.0.1:4317',
      pairingToken: 'tok',
      fetch,
    });
    expect(await fetcher()).toEqual([]);
  });

  it('returns [] on fetch throw (network error)', async () => {
    const { fetch } = makeFetch({ throwOnFetch: new Error('econnrefused') });
    const fetcher = createAgentCommandsFetcher({
      baseUrl: 'http://127.0.0.1:4317',
      pairingToken: 'tok',
      fetch,
    });
    expect(await fetcher()).toEqual([]);
  });

  it('returns [] on JSON parse failure', async () => {
    const { fetch } = makeFetch({ throwOnJson: true });
    const fetcher = createAgentCommandsFetcher({
      baseUrl: 'http://127.0.0.1:4317',
      pairingToken: 'tok',
      fetch,
    });
    expect(await fetcher()).toEqual([]);
  });

  it('returns [] when payload.commands is not an array', async () => {
    const { fetch } = makeFetch({ json: { commands: 'oops' } });
    const fetcher = createAgentCommandsFetcher({
      baseUrl: 'http://127.0.0.1:4317',
      pairingToken: 'tok',
      fetch,
    });
    expect(await fetcher()).toEqual([]);
  });

  it('returns [] when payload is malformed (not an object)', async () => {
    const { fetch } = makeFetch({ json: null });
    const fetcher = createAgentCommandsFetcher({
      baseUrl: 'http://127.0.0.1:4317',
      pairingToken: 'tok',
      fetch,
    });
    expect(await fetcher()).toEqual([]);
  });
});
