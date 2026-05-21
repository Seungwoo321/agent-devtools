import { describe, expect, it, vi } from 'vitest';
import { createNetworkObserver } from './network.js';
import type { ErrorRecord } from './types.js';

function fakeFetchOk(status = 200): typeof fetch {
  return vi.fn(() =>
    Promise.resolve({ ok: status >= 200 && status < 300, status } as Response),
  ) as unknown as typeof fetch;
}

function fakeFetchThrowing(error: unknown): typeof fetch {
  return vi.fn(() => Promise.reject(error)) as unknown as typeof fetch;
}

describe('createNetworkObserver', () => {
  it('does not record on a 2xx response (success path unchanged)', async () => {
    const host = { fetch: fakeFetchOk(200) };
    const records: ErrorRecord[] = [];
    const obs = createNetworkObserver({ globalObject: host, onRecord: (r) => records.push(r) });
    obs.start();
    const res = await host.fetch('/api/x');
    expect(res.status).toBe(200);
    expect(records).toEqual([]);
  });

  it('records fetch-non-ok on a 4xx response', async () => {
    const host = { fetch: fakeFetchOk(404) };
    const records: ErrorRecord[] = [];
    const obs = createNetworkObserver({ globalObject: host, onRecord: (r) => records.push(r) });
    obs.start();
    await host.fetch('/api/missing');
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      kind: 'fetch-non-ok',
      url: '/api/missing',
      method: 'GET',
      status: 404,
    });
  });

  it('records fetch-non-ok on a 5xx response', async () => {
    const host = { fetch: fakeFetchOk(500) };
    const records: ErrorRecord[] = [];
    const obs = createNetworkObserver({ globalObject: host, onRecord: (r) => records.push(r) });
    obs.start();
    await host.fetch('/api/oops', { method: 'POST' });
    expect(records[0]).toMatchObject({
      kind: 'fetch-non-ok',
      method: 'POST',
      status: 500,
    });
  });

  it('records fetch-error and re-throws when the network fails', async () => {
    const networkError = new TypeError('Failed to fetch');
    const host = { fetch: fakeFetchThrowing(networkError) };
    const records: ErrorRecord[] = [];
    const obs = createNetworkObserver({ globalObject: host, onRecord: (r) => records.push(r) });
    obs.start();
    await expect(host.fetch('/api/x')).rejects.toBe(networkError);
    expect(records[0]).toMatchObject({
      kind: 'fetch-error',
      url: '/api/x',
      method: 'GET',
      stack: networkError.stack,
    });
  });

  it('restores the original fetch on stop()', () => {
    const original = fakeFetchOk();
    const host = { fetch: original };
    const obs = createNetworkObserver({ globalObject: host, onRecord: () => undefined });
    obs.start();
    expect(host.fetch).not.toBe(original);
    obs.stop();
    expect(host.fetch).toBe(original);
  });

  it('handles a URL input', async () => {
    const host = { fetch: fakeFetchOk(404) };
    const records: ErrorRecord[] = [];
    const obs = createNetworkObserver({ globalObject: host, onRecord: (r) => records.push(r) });
    obs.start();
    await host.fetch(new URL('https://example.com/x'));
    expect(records[0]?.url).toBe('https://example.com/x');
  });

  it('extracts method from Request object', async () => {
    const host = { fetch: fakeFetchOk(404) };
    const records: ErrorRecord[] = [];
    const obs = createNetworkObserver({ globalObject: host, onRecord: (r) => records.push(r) });
    obs.start();
    await host.fetch({ url: '/api/x', method: 'delete' } as unknown as Request);
    expect(records[0]?.method).toBe('DELETE');
    expect(records[0]?.url).toBe('/api/x');
  });
});
