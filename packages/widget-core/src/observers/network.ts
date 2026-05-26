import type { ErrorRecord } from './types.js';

/**
 * Wrap `fetch` so we record network failures (thrown errors) and non-OK
 * responses (4xx/5xx) without breaking any existing behaviour. The wrapper
 * always returns the original promise — success path unchanged.
 *
 * We deliberately don't intercept XMLHttpRequest. Modern apps almost
 * exclusively use fetch, and patching XHR significantly grows the wire
 * surface for things like progress events. If a downstream user needs XHR
 * coverage they can add their own listener.
 */

export interface NetworkObserverOptions {
  /** Global object hosting `fetch`. Defaults to `globalThis`. */
  globalObject?: { fetch: typeof fetch };
  onRecord: (record: ErrorRecord) => void;
}

export interface NetworkObserverHandle {
  start(): void;
  stop(): void;
}

export function createNetworkObserver(options: NetworkObserverOptions): NetworkObserverHandle {
  const target = options.globalObject ?? (globalThis as unknown as { fetch: typeof fetch });
  let originalFetch: typeof fetch | null = null;

  async function patchedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    if (!originalFetch) throw new Error('observer not started');
    const url = extractUrl(input);
    const method = extractMethod(input, init);
    try {
      const res = await originalFetch.call(target, input, init);
      if (!res.ok) {
        options.onRecord({
          kind: 'fetch-non-ok',
          timestamp: Date.now(),
          message: `fetch ${method} ${url} → ${res.status}`,
          url,
          method,
          status: res.status,
        });
      }
      return res;
    } catch (error) {
      options.onRecord({
        kind: 'fetch-error',
        timestamp: Date.now(),
        message: `fetch ${method} ${url} failed: ${errorMessage(error)}`,
        url,
        method,
        ...(error instanceof Error && typeof error.stack === 'string' && { stack: error.stack }),
      });
      throw error;
    }
  }

  return {
    start(): void {
      if (originalFetch) return;
      originalFetch = target.fetch;
      target.fetch = patchedFetch as typeof fetch;
    },
    stop(): void {
      if (!originalFetch) return;
      target.fetch = originalFetch;
      originalFetch = null;
    },
  };
}

function extractUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  // Request — best effort; some envs don't expose .url on the type but always
  // do at runtime.
  const candidate = (input as { url?: unknown }).url;
  return typeof candidate === 'string' ? candidate : '<unknown>';
}

function extractMethod(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method) return init.method.toUpperCase();
  if (typeof input === 'object' && input !== null && 'method' in input) {
    const m = (input as { method?: unknown }).method;
    if (typeof m === 'string') return m.toUpperCase();
  }
  return 'GET';
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
