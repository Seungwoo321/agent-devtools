import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultTransport, createHandoffRequester } from './sse-transport.js';
import { createMessageStore, type MessageStore } from '../stream/index.js';
import type { TransportPayload } from '../orchestrator/index.js';
import { PAGE_CONTEXT_SCHEMA_VERSION } from '../context/types.js';

// The shared MessageStore now persists to sessionStorage by default, so
// without an inter-test reset a prior test's flush would re-hydrate the
// next test's store with stale items.
beforeEach(() => {
  try {
    globalThis.sessionStorage?.clear();
  } catch {
    /* environments without sessionStorage are fine */
  }
});

interface CapturedRequest {
  readonly url: string;
  readonly init: RequestInit;
}

function streamFrom(chunks: readonly string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let i = 0;
  return new ReadableStream({
    pull(controller): void {
      if (i >= chunks.length) {
        controller.close();
        return;
      }
      const chunk = chunks[i] ?? '';
      i += 1;
      controller.enqueue(encoder.encode(chunk));
    },
  });
}

function makeFetch(options: {
  readonly status?: number;
  readonly body?: ReadableStream<Uint8Array> | null;
  readonly textBody?: string;
}): { fetch: typeof fetch; captured: CapturedRequest[] } {
  const captured: CapturedRequest[] = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    captured.push({ url: String(input), init: init ?? {} });
    const status = options.status ?? 200;
    const responseInit: ResponseInit = { status };
    const body =
      options.body === null
        ? null
        : (options.body ??
          (options.textBody !== undefined ? streamFrom([options.textBody]) : streamFrom([])));
    return new Response(body, responseInit);
  }) as unknown as typeof fetch;
  return { fetch: fetchImpl, captured };
}

function makeStorage(backing: Map<string, string>): Storage {
  return {
    get length(): number {
      return backing.size;
    },
    clear(): void {
      backing.clear();
    },
    getItem(key: string): string | null {
      return backing.get(key) ?? null;
    },
    key(index: number): string | null {
      return Array.from(backing.keys())[index] ?? null;
    },
    removeItem(key: string): void {
      backing.delete(key);
    },
    setItem(key: string, value: string): void {
      backing.set(key, value);
    },
  };
}

function basePayload(overrides: Partial<TransportPayload> = {}): TransportPayload {
  const store: MessageStore = overrides.store ?? createMessageStore();
  const controller = new AbortController();
  return {
    text: 'hello',
    picked: null,
    pageContext: {
      schemaVersion: PAGE_CONTEXT_SCHEMA_VERSION,
      capturedAt: 0,
      url: 'http://example.com/',
      route: { pathname: '/', search: '', hash: '' },
      pageFiles: [],
      errors: [],
    },
    store,
    signal: controller.signal,
    ...overrides,
  };
}

describe('createDefaultTransport', () => {
  it('POSTs to /v1/agent/stream with bearer auth and the prompt payload', async () => {
    const { fetch: fetchImpl, captured } = makeFetch({ textBody: '' });
    const transport = createDefaultTransport({
      baseUrl: 'http://127.0.0.1:4317',
      pairingToken: 'tok-abc',
      fetch: fetchImpl,
      generateSessionId: () => 'cs-test-1',
    });
    const payload = basePayload({
      text: 'do the thing',
      picked: {
        tagName: 'BUTTON',
        componentName: 'PrimaryButton',
        selector: 'button.primary',
        outerHTML: '<button class="primary"></button>',
        attributes: { class: 'primary' },
        componentChain: [],
      },
    });

    await transport.send(payload);

    expect(captured).toHaveLength(1);
    const req = captured[0];
    if (!req) throw new Error('no captured request');
    expect(req.url).toBe('http://127.0.0.1:4317/v1/agent/stream');
    expect(req.init.method).toBe('POST');
    const headers = req.init.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer tok-abc');
    expect(headers['content-type']).toBe('application/json');
    expect(headers.accept).toBe('text/event-stream');
    expect(typeof req.init.body).toBe('string');
    const parsed = JSON.parse(req.init.body as string) as Record<string, unknown>;
    expect(parsed.prompt).toBe('do the thing');
    expect(parsed.clientSessionId).toBe('cs-test-1');
    expect(parsed.context).toMatchObject({
      picked: { tagName: 'BUTTON', componentName: 'PrimaryButton' },
      pageContext: { url: 'http://example.com/' },
    });
  });

  it('reuses the same clientSessionId across multiple sends from one transport instance', async () => {
    const { fetch: fetchImpl, captured } = makeFetch({ textBody: '' });
    const transport = createDefaultTransport({
      baseUrl: 'http://127.0.0.1:4317',
      pairingToken: 'tok',
      fetch: fetchImpl,
      generateSessionId: () => 'cs-stable',
    });

    await transport.send(basePayload());
    await transport.send(basePayload());

    expect(captured).toHaveLength(2);
    const ids = captured.map(
      (r) => (JSON.parse(r.init.body as string) as { clientSessionId: string }).clientSessionId,
    );
    expect(ids).toEqual(['cs-stable', 'cs-stable']);
  });

  it('forwards provider + permissionMode from getSettings() on every request', async () => {
    const { fetch: fetchImpl, captured } = makeFetch({ textBody: '' });
    let current: { provider: 'acp' | 'sdk'; permissionMode: 'acceptEdits' | 'bypassPermissions' } =
      {
        provider: 'acp',
        permissionMode: 'acceptEdits',
      };
    const transport = createDefaultTransport({
      baseUrl: 'http://127.0.0.1:4317',
      pairingToken: 'tok',
      fetch: fetchImpl,
      getSettings: () => current,
    });
    await transport.send(basePayload());
    // Live snapshot — the second turn should see the mutated value.
    current = { provider: 'sdk', permissionMode: 'bypassPermissions' };
    await transport.send(basePayload());
    expect(captured).toHaveLength(2);
    const bodies = captured.map(
      (r) => JSON.parse(r.init.body as string) as { provider?: string; permissionMode?: string },
    );
    expect(bodies[0]).toMatchObject({ provider: 'acp', permissionMode: 'acceptEdits' });
    expect(bodies[1]).toMatchObject({ provider: 'sdk', permissionMode: 'bypassPermissions' });
  });

  it('omits provider/permissionMode when getSettings is not supplied (server defaults apply)', async () => {
    const { fetch: fetchImpl, captured } = makeFetch({ textBody: '' });
    const transport = createDefaultTransport({
      baseUrl: 'http://127.0.0.1:4317',
      pairingToken: 'tok',
      fetch: fetchImpl,
    });
    await transport.send(basePayload());
    const body = JSON.parse(captured[0]?.init.body as string) as Record<string, unknown>;
    expect(body).not.toHaveProperty('provider');
    expect(body).not.toHaveProperty('permissionMode');
  });

  it('defaults clientSessionId to a fresh UUID per transport instance', async () => {
    const { fetch: fetchImpl, captured } = makeFetch({ textBody: '' });
    const transport = createDefaultTransport({
      baseUrl: 'http://127.0.0.1:4317',
      pairingToken: 'tok',
      fetch: fetchImpl,
      sessionIdStorage: null,
    });
    await transport.send(basePayload());
    const body = JSON.parse(captured[0]?.init.body as string) as { clientSessionId: unknown };
    expect(typeof body.clientSessionId).toBe('string');
    expect((body.clientSessionId as string).length).toBeGreaterThan(0);
  });

  it('persists the minted clientSessionId to sessionIdStorage on construct', async () => {
    const { fetch: fetchImpl } = makeFetch({ textBody: '' });
    const store = new Map<string, string>();
    const storage = makeStorage(store);
    createDefaultTransport({
      baseUrl: 'http://127.0.0.1:4317',
      pairingToken: 'tok',
      fetch: fetchImpl,
      generateSessionId: () => 'cs-minted-on-construct',
      sessionIdStorage: storage,
    });
    expect(store.get('agent-devtools:clientSessionId')).toBe('cs-minted-on-construct');
  });

  it('reuses a persisted clientSessionId on a new transport instance (page reload)', async () => {
    const { fetch: fetchImpl, captured } = makeFetch({ textBody: '' });
    // Tab survived a reload — sessionStorage already holds the prior id.
    const store = new Map<string, string>([['agent-devtools:clientSessionId', 'cs-reloaded-tab']]);
    const storage = makeStorage(store);
    const transport = createDefaultTransport({
      baseUrl: 'http://127.0.0.1:4317',
      pairingToken: 'tok',
      fetch: fetchImpl,
      // Even if a generator is supplied, the persisted id must win — the
      // generator is only used when the storage slot is empty.
      generateSessionId: () => 'cs-should-not-be-used',
      sessionIdStorage: storage,
    });
    await transport.send(basePayload());
    const body = JSON.parse(captured[0]?.init.body as string) as { clientSessionId: string };
    expect(body.clientSessionId).toBe('cs-reloaded-tab');
  });

  it('two transport instances backed by the same storage share the clientSessionId', async () => {
    const { fetch: fetchImpl, captured } = makeFetch({ textBody: '' });
    const store = new Map<string, string>();
    const storage = makeStorage(store);
    let counter = 0;
    const generateSessionId = (): string => `cs-${++counter}`;
    const t1 = createDefaultTransport({
      baseUrl: 'http://127.0.0.1:4317',
      pairingToken: 'tok',
      fetch: fetchImpl,
      generateSessionId,
      sessionIdStorage: storage,
    });
    const t2 = createDefaultTransport({
      baseUrl: 'http://127.0.0.1:4317',
      pairingToken: 'tok',
      fetch: fetchImpl,
      generateSessionId,
      sessionIdStorage: storage,
    });
    await t1.send(basePayload());
    await t2.send(basePayload());
    const ids = captured.map(
      (r) => (JSON.parse(r.init.body as string) as { clientSessionId: string }).clientSessionId,
    );
    // Both transports must end up on the id minted by the first one —
    // otherwise a tab reload would still hit a fresh ACP session.
    expect(ids).toEqual(['cs-1', 'cs-1']);
    expect(counter).toBe(1);
  });

  it('skips persistence when sessionIdStorage is null and mints fresh per instance', async () => {
    const { fetch: fetchImpl, captured } = makeFetch({ textBody: '' });
    let counter = 0;
    const generateSessionId = (): string => `cs-mint-${++counter}`;
    const t1 = createDefaultTransport({
      baseUrl: 'http://127.0.0.1:4317',
      pairingToken: 'tok',
      fetch: fetchImpl,
      generateSessionId,
      sessionIdStorage: null,
    });
    const t2 = createDefaultTransport({
      baseUrl: 'http://127.0.0.1:4317',
      pairingToken: 'tok',
      fetch: fetchImpl,
      generateSessionId,
      sessionIdStorage: null,
    });
    await t1.send(basePayload());
    await t2.send(basePayload());
    const ids = captured.map(
      (r) => (JSON.parse(r.init.body as string) as { clientSessionId: string }).clientSessionId,
    );
    expect(ids).toEqual(['cs-mint-1', 'cs-mint-2']);
  });

  it('honors a custom sessionIdStorageKey', async () => {
    const { fetch: fetchImpl } = makeFetch({ textBody: '' });
    const store = new Map<string, string>();
    const storage = makeStorage(store);
    createDefaultTransport({
      baseUrl: 'http://127.0.0.1:4317',
      pairingToken: 'tok',
      fetch: fetchImpl,
      generateSessionId: () => 'cs-keyed',
      sessionIdStorage: storage,
      sessionIdStorageKey: 'custom:key',
    });
    expect(store.get('custom:key')).toBe('cs-keyed');
    expect(store.get('agent-devtools:clientSessionId')).toBeUndefined();
  });

  it('tolerates a Storage backend whose getItem throws (e.g. blocked sandbox)', async () => {
    const { fetch: fetchImpl, captured } = makeFetch({ textBody: '' });
    const storage: Storage = {
      get length(): number {
        return 0;
      },
      clear(): void {},
      getItem(): string | null {
        throw new Error('blocked');
      },
      key(): string | null {
        return null;
      },
      removeItem(): void {},
      setItem(): void {
        throw new Error('blocked');
      },
    };
    const transport = createDefaultTransport({
      baseUrl: 'http://127.0.0.1:4317',
      pairingToken: 'tok',
      fetch: fetchImpl,
      generateSessionId: () => 'cs-fallback',
      sessionIdStorage: storage,
    });
    await transport.send(basePayload());
    const body = JSON.parse(captured[0]?.init.body as string) as { clientSessionId: string };
    expect(body.clientSessionId).toBe('cs-fallback');
  });

  it('strips trailing slashes from baseUrl', async () => {
    const { fetch: fetchImpl, captured } = makeFetch({ textBody: '' });
    const transport = createDefaultTransport({
      baseUrl: 'http://127.0.0.1:4317///',
      pairingToken: 'tok',
      fetch: fetchImpl,
    });
    await transport.send(basePayload());
    expect(captured[0]?.url).toBe('http://127.0.0.1:4317/v1/agent/stream');
  });

  it('resetSession() rotates the clientSessionId for the next send', async () => {
    const { fetch: fetchImpl, captured } = makeFetch({ textBody: '' });
    let counter = 0;
    const generateSessionId = (): string => `cs-${++counter}`;
    const transport = createDefaultTransport({
      baseUrl: 'http://127.0.0.1:4317',
      pairingToken: 'tok',
      fetch: fetchImpl,
      generateSessionId,
      sessionIdStorage: null,
    });
    await transport.send(basePayload());
    transport.resetSession?.();
    await transport.send(basePayload());
    const ids = captured.map(
      (r) => (JSON.parse(r.init.body as string) as { clientSessionId: string }).clientSessionId,
    );
    // First send used cs-1 (initial mint), second send used cs-2 (post-reset mint).
    expect(ids).toEqual(['cs-1', 'cs-2']);
  });

  it('resetSession() overwrites the persisted slot so a reload picks up the rotated id', async () => {
    const { fetch: fetchImpl } = makeFetch({ textBody: '' });
    const backing = new Map<string, string>();
    const storage = makeStorage(backing);
    let counter = 0;
    const generateSessionId = (): string => `cs-${++counter}`;
    const transport = createDefaultTransport({
      baseUrl: 'http://127.0.0.1:4317',
      pairingToken: 'tok',
      fetch: fetchImpl,
      generateSessionId,
      sessionIdStorage: storage,
    });
    expect(backing.get('agent-devtools:clientSessionId')).toBe('cs-1');
    transport.resetSession?.();
    expect(backing.get('agent-devtools:clientSessionId')).toBe('cs-2');
  });

  it('resetSession() tolerates a Storage backend whose setItem throws', async () => {
    const { fetch: fetchImpl, captured } = makeFetch({ textBody: '' });
    let setItemCount = 0;
    const storage: Storage = {
      get length(): number {
        return 0;
      },
      clear(): void {},
      getItem(): string | null {
        return null;
      },
      key(): string | null {
        return null;
      },
      removeItem(): void {},
      setItem(): void {
        setItemCount += 1;
        // First call (initial mint) succeeds via the catch in the impl;
        // throw on every call to assert the resetSession path also tolerates it.
        throw new Error('quota');
      },
    };
    let counter = 0;
    const generateSessionId = (): string => `cs-${++counter}`;
    const transport = createDefaultTransport({
      baseUrl: 'http://127.0.0.1:4317',
      pairingToken: 'tok',
      fetch: fetchImpl,
      generateSessionId,
      sessionIdStorage: storage,
    });
    // Initial mint already attempted setItem (throwing) — impl swallowed it.
    expect(setItemCount).toBeGreaterThan(0);
    expect(() => transport.resetSession?.()).not.toThrow();
    // Next send still uses the rotated in-memory id.
    await transport.send(basePayload());
    const body = JSON.parse(captured[0]?.init.body as string) as { clientSessionId: string };
    expect(body.clientSessionId).toBe('cs-2');
  });

  it('feeds parsed SSE events into the message store', async () => {
    const store = createMessageStore();
    const body = streamFrom([
      'event: text-delta\ndata: {"blockId":"b1","text":"Hel"}\n\n',
      'event: text-delta\ndata: {"blockId":"b1","text":"lo!"}\n\n',
      'event: text-stop\ndata: {"blockId":"b1"}\n\n',
      'event: done\ndata: {}\n\n',
    ]);
    const { fetch: fetchImpl } = makeFetch({ body });
    const transport = createDefaultTransport({
      baseUrl: 'http://127.0.0.1:4317',
      pairingToken: 'tok',
      fetch: fetchImpl,
    });

    await transport.send(basePayload({ store }));

    const items = store.getItems();
    expect(items).toHaveLength(1);
    const item = items[0];
    expect(item?.kind).toBe('assistant-text');
    if (item?.kind === 'assistant-text') {
      expect(item.text).toBe('Hello!');
      expect(item.streaming).toBe(false);
    }
  });

  it('handles SSE events split across chunk boundaries', async () => {
    const store = createMessageStore();
    const body = streamFrom(['event: text-del', 'ta\ndata: {"blockId":"b1","text":"hi"}\n\n']);
    const { fetch: fetchImpl } = makeFetch({ body });
    const transport = createDefaultTransport({
      baseUrl: 'http://127.0.0.1:4317',
      pairingToken: 'tok',
      fetch: fetchImpl,
    });

    await transport.send(basePayload({ store }));

    const item = store.getItems()[0];
    expect(item?.kind).toBe('assistant-text');
    if (item?.kind === 'assistant-text') {
      expect(item.text).toBe('hi');
    }
  });

  it('drops unknown SSE events silently', async () => {
    const store = createMessageStore();
    const body = streamFrom([
      'event: who-knows\ndata: {"x":1}\n\n',
      'event: text-delta\ndata: {"blockId":"b1","text":"ok"}\n\n',
    ]);
    const { fetch: fetchImpl } = makeFetch({ body });
    const transport = createDefaultTransport({
      baseUrl: 'http://127.0.0.1:4317',
      pairingToken: 'tok',
      fetch: fetchImpl,
    });

    await transport.send(basePayload({ store }));

    const items = store.getItems();
    expect(items).toHaveLength(1);
    expect(items[0]?.kind).toBe('assistant-text');
  });

  it('throws with the server-provided error detail on a non-OK response', async () => {
    const { fetch: fetchImpl } = makeFetch({
      status: 401,
      textBody: JSON.stringify({ error: 'invalid pairing token' }),
    });
    const transport = createDefaultTransport({
      baseUrl: 'http://127.0.0.1:4317',
      pairingToken: 'wrong',
      fetch: fetchImpl,
    });

    await expect(transport.send(basePayload())).rejects.toThrow(
      /agent server responded 401: invalid pairing token/,
    );
  });

  it('throws on non-OK without a parseable JSON body, surfacing the raw text', async () => {
    const { fetch: fetchImpl } = makeFetch({ status: 500, textBody: 'kaboom' });
    const transport = createDefaultTransport({
      baseUrl: 'http://127.0.0.1:4317',
      pairingToken: 'tok',
      fetch: fetchImpl,
    });

    await expect(transport.send(basePayload())).rejects.toThrow(
      /agent server responded 500: kaboom/,
    );
  });

  it('throws when the response has no body', async () => {
    const { fetch: fetchImpl } = makeFetch({ body: null });
    const transport = createDefaultTransport({
      baseUrl: 'http://127.0.0.1:4317',
      pairingToken: 'tok',
      fetch: fetchImpl,
    });

    await expect(transport.send(basePayload())).rejects.toThrow(/empty body/);
  });

  it('stops reading the stream when the signal aborts', async () => {
    const store = createMessageStore();
    const controller = new AbortController();
    // Owned outside the stream constructor so its setter is statically visible.
    let releaseSecond: () => void = () => undefined;
    const second = new Promise<void>((res) => {
      releaseSecond = res;
    });
    const body = new ReadableStream<Uint8Array>({
      start(streamController): void {
        const encoder = new TextEncoder();
        streamController.enqueue(
          encoder.encode('event: text-delta\ndata: {"blockId":"b1","text":"first"}\n\n'),
        );
        // Defer the second chunk until the test aborts so the pump loop
        // sees the aborted signal on its next iteration. The pump cancels
        // the reader on abort, which closes the controller — guard so this
        // late enqueue doesn't surface as an unhandled rejection.
        void second.then(() => {
          try {
            streamController.enqueue(
              encoder.encode('event: text-delta\ndata: {"blockId":"b1","text":"second"}\n\n'),
            );
            streamController.close();
          } catch {
            /* stream already canceled by the pump */
          }
        });
      },
    });
    const { fetch: fetchImpl } = makeFetch({ body });
    const transport = createDefaultTransport({
      baseUrl: 'http://127.0.0.1:4317',
      pairingToken: 'tok',
      fetch: fetchImpl,
    });

    const sendPromise = transport.send(basePayload({ store, signal: controller.signal }));
    // Let the pump consume the first chunk before aborting.
    await new Promise((r) => setTimeout(r, 10));
    controller.abort();
    releaseSecond();
    await sendPromise;

    const items = store.getItems();
    const text = items[0]?.kind === 'assistant-text' ? items[0].text : '';
    expect(text).toBe('first');
  });
});

function makeJsonFetch(options: {
  readonly status?: number;
  readonly body?: unknown;
  readonly textBody?: string;
}): { fetch: typeof fetch; captured: CapturedRequest[] } {
  const captured: CapturedRequest[] = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    captured.push({ url: String(input), init: init ?? {} });
    const status = options.status ?? 200;
    const responseInit: ResponseInit = {
      status,
      headers: { 'content-type': 'application/json' },
    };
    const bodyText =
      options.textBody !== undefined
        ? options.textBody
        : options.body !== undefined
          ? JSON.stringify(options.body)
          : '';
    return new Response(bodyText, responseInit);
  }) as unknown as typeof fetch;
  return { fetch: fetchImpl, captured };
}

describe('createHandoffRequester', () => {
  it('POSTs to /v1/agent/handoff with bearer auth and the conversation payload', async () => {
    const { fetch: fetchImpl, captured } = makeJsonFetch({
      body: {
        file: '/tmp/agent-devtools-handoff-x.md',
        command: 'claude --append-system-prompt-file /tmp/x.md',
      },
    });
    const requestHandoff = createHandoffRequester({
      baseUrl: 'http://127.0.0.1:4317',
      pairingToken: 'tok-abc',
      fetch: fetchImpl,
    });

    const result = await requestHandoff({
      conversation: [
        { role: 'user', text: 'why is the button red' },
        { role: 'assistant', text: 'it inherits .danger' },
      ],
      picked: null,
      pageContext: null,
      permissionMode: 'acceptEdits',
    });

    expect(captured).toHaveLength(1);
    const req = captured[0];
    if (!req) throw new Error('no captured request');
    expect(req.url).toBe('http://127.0.0.1:4317/v1/agent/handoff');
    expect(req.init.method).toBe('POST');
    const headers = req.init.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer tok-abc');
    expect(headers['content-type']).toBe('application/json');
    expect(headers.accept).toBe('application/json');
    const body = JSON.parse(req.init.body as string) as Record<string, unknown>;
    expect(body.conversation).toEqual([
      { role: 'user', text: 'why is the button red' },
      { role: 'assistant', text: 'it inherits .danger' },
    ]);
    expect(body.permissionMode).toBe('acceptEdits');
    // null picked / pageContext are omitted from the wire body so the
    // server's "skip section when empty" logic isn't tripped by literal
    // nulls.
    expect(body).not.toHaveProperty('picked');
    expect(body).not.toHaveProperty('pageContext');
    expect(result).toEqual({
      file: '/tmp/agent-devtools-handoff-x.md',
      command: 'claude --append-system-prompt-file /tmp/x.md',
    });
  });

  it('forwards picked + pageContext + permissionMode when supplied', async () => {
    const { fetch: fetchImpl, captured } = makeJsonFetch({
      body: { file: '/tmp/x.md', command: 'cmd' },
    });
    const requestHandoff = createHandoffRequester({
      baseUrl: 'http://127.0.0.1:4317',
      pairingToken: 'tok',
      fetch: fetchImpl,
    });
    await requestHandoff({
      conversation: [{ role: 'user', text: 'hi' }],
      picked: {
        tagName: 'BUTTON',
        componentName: 'PrimaryButton',
        selector: 'button.primary',
        outerHTML: '<button class="primary"></button>',
        attributes: { class: 'primary' },
        componentChain: [],
      },
      pageContext: {
        schemaVersion: PAGE_CONTEXT_SCHEMA_VERSION,
        capturedAt: 0,
        url: 'http://example.com/',
        route: { pathname: '/', search: '', hash: '' },
        pageFiles: [],
        errors: [],
      },
      permissionMode: 'bypassPermissions',
    });
    const body = JSON.parse(captured[0]?.init.body as string) as Record<string, unknown>;
    expect(body.picked).toMatchObject({ tagName: 'BUTTON', componentName: 'PrimaryButton' });
    expect(body.pageContext).toMatchObject({ url: 'http://example.com/' });
    expect(body.permissionMode).toBe('bypassPermissions');
  });

  it('strips trailing slashes from baseUrl', async () => {
    const { fetch: fetchImpl, captured } = makeJsonFetch({
      body: { file: '/tmp/x.md', command: 'cmd' },
    });
    const requestHandoff = createHandoffRequester({
      baseUrl: 'http://127.0.0.1:4317///',
      pairingToken: 'tok',
      fetch: fetchImpl,
    });
    await requestHandoff({ conversation: [] });
    expect(captured[0]?.url).toBe('http://127.0.0.1:4317/v1/agent/handoff');
  });

  it('throws with the server-provided error detail on a non-OK response', async () => {
    const { fetch: fetchImpl } = makeJsonFetch({
      status: 401,
      textBody: JSON.stringify({ error: 'invalid pairing token' }),
    });
    const requestHandoff = createHandoffRequester({
      baseUrl: 'http://127.0.0.1:4317',
      pairingToken: 'wrong',
      fetch: fetchImpl,
    });
    await expect(requestHandoff({ conversation: [] })).rejects.toThrow(
      /agent server responded 401: invalid pairing token/,
    );
  });

  it('throws when the server returns a malformed artifact', async () => {
    const { fetch: fetchImpl } = makeJsonFetch({ body: { file: 123 } });
    const requestHandoff = createHandoffRequester({
      baseUrl: 'http://127.0.0.1:4317',
      pairingToken: 'tok',
      fetch: fetchImpl,
    });
    await expect(requestHandoff({ conversation: [] })).rejects.toThrow(
      /malformed handoff artifact/,
    );
  });

  it('forwards the AbortSignal to fetch when supplied', async () => {
    const { fetch: fetchImpl, captured } = makeJsonFetch({
      body: { file: '/tmp/x.md', command: 'cmd' },
    });
    const requestHandoff = createHandoffRequester({
      baseUrl: 'http://127.0.0.1:4317',
      pairingToken: 'tok',
      fetch: fetchImpl,
    });
    const controller = new AbortController();
    await requestHandoff({ conversation: [], signal: controller.signal });
    expect(captured[0]?.init.signal).toBe(controller.signal);
  });
});
