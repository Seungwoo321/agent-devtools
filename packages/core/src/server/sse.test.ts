import { afterEach, describe, expect, it } from 'vitest';
import { request, type IncomingMessage } from 'node:http';
import { formatSseEvent, pumpToSse, startSse, type SseEvent, type SseWriter } from './sse.js';
import { startServer, type StartedServer } from './server.js';

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (cleanups.length > 0) {
    const fn = cleanups.pop();
    if (fn) await fn().catch(() => undefined);
  }
});

async function startServerWith(
  driver: (writer: SseWriter, ctx: { signal: AbortSignal }) => Promise<void> | void,
): Promise<StartedServer> {
  const started = await startServer(
    async (req, res) => {
      const writer = startSse(res);
      const controller = new AbortController();
      req.once('close', () => controller.abort());
      await driver(writer, { signal: controller.signal });
    },
    { port: 0 },
  );
  cleanups.push(() => started.close());
  return started;
}

async function readAll(res: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of res) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

function get(url: string): {
  response: Promise<IncomingMessage>;
  abort: () => void;
} {
  let abortFn = (): void => undefined;
  const response = new Promise<IncomingMessage>((resolve, reject) => {
    const req = request(url, (res) => resolve(res));
    abortFn = () => req.destroy();
    req.once('error', reject);
    req.end();
  });
  return { response, abort: () => abortFn() };
}

describe('formatSseEvent', () => {
  it('frames a string payload as a single data line', () => {
    expect(formatSseEvent({ event: 'message', data: 'hello' })).toBe(
      'event: message\ndata: hello\n\n',
    );
  });

  it('JSON-stringifies non-string payloads', () => {
    expect(formatSseEvent({ event: 'progress', data: { step: 'analyze', i: 1 } })).toBe(
      'event: progress\ndata: {"step":"analyze","i":1}\n\n',
    );
  });

  it('splits multi-line string payloads into multiple data lines', () => {
    expect(formatSseEvent({ event: 'log', data: 'a\nb\nc' })).toBe(
      'event: log\ndata: a\ndata: b\ndata: c\n\n',
    );
  });

  it('emits id line when provided', () => {
    expect(formatSseEvent({ id: '42', event: 'tick', data: 'ok' })).toBe(
      'id: 42\nevent: tick\ndata: ok\n\n',
    );
  });

  it('omits event line when event field is undefined', () => {
    expect(formatSseEvent({ data: 'raw' })).toBe('data: raw\n\n');
  });
});

describe('startSse (end-to-end)', () => {
  it('sets spec headers and streams framed events', async () => {
    const app = await startServerWith((writer) => {
      writer.write({ event: 'tick', data: { n: 1 } });
      writer.write({ event: 'tick', data: { n: 2 } });
      writer.comment('keepalive');
      writer.end();
    });
    const { response } = get(app.url);
    const res = await response;
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('text/event-stream; charset=utf-8');
    expect(res.headers['cache-control']).toBe('no-cache, no-transform');
    expect(res.headers['connection']).toBe('keep-alive');
    const text = await readAll(res);
    expect(text).toContain('event: tick\ndata: {"n":1}\n\n');
    expect(text).toContain('event: tick\ndata: {"n":2}\n\n');
    expect(text).toContain(': keepalive\n\n');
  });

  it('marks writer.closed after end() and ignores subsequent writes', async () => {
    let postEndCount = 0;
    const app = await startServerWith((writer) => {
      writer.write({ event: 'a', data: '1' });
      writer.end();
      writer.write({ event: 'b', data: '2' });
      postEndCount = writer.closed ? 1 : 0;
    });
    const { response } = get(app.url);
    const res = await response;
    const text = await readAll(res);
    expect(text).toContain('event: a\ndata: 1\n\n');
    expect(text).not.toContain('event: b');
    expect(postEndCount).toBe(1);
  });
});

describe('pumpToSse (end-to-end)', () => {
  it('forwards each yielded item as an SSE message and closes the stream', async () => {
    const app = await startServerWith(async (writer) => {
      async function* source(): AsyncGenerator<unknown> {
        yield { step: 'analyze' };
        yield { step: 'generate' };
        yield { step: 'complete' };
      }
      await pumpToSse(writer, source());
    });
    const { response } = get(app.url);
    const res = await response;
    const text = await readAll(res);
    expect(text).toMatch(/event: message\ndata: \{"step":"analyze"\}/);
    expect(text).toMatch(/event: message\ndata: \{"step":"generate"\}/);
    expect(text).toMatch(/event: message\ndata: \{"step":"complete"\}/);
  });

  it('uses a custom toEvent mapper when provided', async () => {
    const app = await startServerWith(async (writer) => {
      async function* source(): AsyncGenerator<{ type: string; v: number }> {
        yield { type: 'progress', v: 1 };
        yield { type: 'complete', v: 2 };
      }
      const toEvent = (item: unknown): SseEvent => {
        const ev = item as { type: string; v: number };
        return { event: ev.type, data: { v: ev.v } };
      };
      await pumpToSse(writer, source(), { toEvent });
    });
    const { response } = get(app.url);
    const res = await response;
    const text = await readAll(res);
    expect(text).toMatch(/event: progress\ndata: \{"v":1\}/);
    expect(text).toMatch(/event: complete\ndata: \{"v":2\}/);
  });

  it('cancels iteration via finally when the client disconnects', async () => {
    let cancelled = false;
    const cancelObserved = new Promise<void>((resolve) => {
      const orig = (): void => {
        cancelled = true;
        resolve();
      };
      (globalThis as Record<string, unknown>).__sseCancelSignal = orig;
    });
    const app = await startServerWith(async (writer, { signal }) => {
      async function* source(): AsyncGenerator<number, void, void> {
        try {
          for (let i = 0; i < 1000; i += 1) {
            await new Promise((r) => setTimeout(r, 5));
            yield i;
          }
        } finally {
          const cb = (globalThis as Record<string, unknown>).__sseCancelSignal as () => void;
          cb();
        }
      }
      await pumpToSse(writer, source(), { signal });
    });

    const { response, abort } = get(app.url);
    await response;
    await new Promise((r) => setTimeout(r, 30));
    abort();
    await cancelObserved;
    expect(cancelled).toBe(true);
  });
});
