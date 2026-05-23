import type { ServerResponse } from 'node:http';

export interface SseEvent {
  /** SSE event name (omitted → "message"). */
  event?: string;
  /** Payload — serialised with JSON.stringify unless already a string. */
  data: unknown;
  /** Optional event id (for reconnection — not implemented yet). */
  id?: string;
}

export interface SseWriter {
  write: (event: SseEvent) => void;
  comment: (text: string) => void;
  end: () => void;
  readonly closed: boolean;
}

const SSE_HEADERS: Record<string, string> = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no',
};

/**
 * Promote a Node ServerResponse into an SSE stream:
 *   - sets the spec headers
 *   - flushes immediately
 *   - returns a writer that emits framed events until closed
 *
 * If the response/connection is already closed, calls are no-ops.
 */
export function startSse(res: ServerResponse): SseWriter {
  if (!res.headersSent) {
    res.writeHead(200, SSE_HEADERS);
  }
  res.flushHeaders();

  let closed = false;
  res.once('close', () => {
    closed = true;
  });

  return {
    get closed() {
      return closed || res.writableEnded;
    },
    write(event: SseEvent) {
      if (closed || res.writableEnded) return;
      res.write(formatSseEvent(event));
    },
    comment(text: string) {
      if (closed || res.writableEnded) return;
      const safe = text.replace(/\r?\n/g, ' ');
      res.write(`: ${safe}\n\n`);
    },
    end() {
      if (closed || res.writableEnded) return;
      res.end();
    },
  };
}

export function formatSseEvent(event: SseEvent): string {
  const lines: string[] = [];
  if (event.id !== undefined) lines.push(`id: ${event.id}`);
  if (event.event !== undefined) lines.push(`event: ${event.event}`);
  const payload = typeof event.data === 'string' ? event.data : JSON.stringify(event.data);
  for (const dataLine of payload.split(/\r?\n/)) {
    lines.push(`data: ${dataLine}`);
  }
  return `${lines.join('\n')}\n\n`;
}

export interface PumpOptions {
  /** Signal to abort iteration externally (e.g. server shutdown). */
  signal?: AbortSignal;
  /** Map domain stream items to SSE events (default: `{ event: 'message', data: item }`). */
  toEvent?: (item: unknown) => SseEvent;
  /**
   * Milliseconds of iterable silence before a `: keepalive` SSE comment is
   * emitted to defeat intermediate idle-timeout closers (proxies, tunnels,
   * load balancers). Default `20_000`. Pass `0` to disable heartbeats —
   * only useful in tests where the iterable is synchronous.
   */
  heartbeatMs?: number;
}

const DEFAULT_HEARTBEAT_MS = 20_000;

/**
 * Pipe an async-iterable of domain events into the SSE writer.
 *
 * Cancels the iterable when the client disconnects (writer.closed) or when
 * `options.signal` aborts. Always closes the SSE stream at the end.
 *
 * While the iterable is silent, a `: keepalive` comment is written every
 * `heartbeatMs` so the underlying TCP connection sees periodic traffic and
 * any proxy in the middle does not close it as idle. The SSE parser on the
 * client side ignores comment lines, so heartbeats are invisible to widget
 * consumers — they exist purely to keep network plumbing awake during long
 * model thinking phases.
 */
export async function pumpToSse<T>(
  writer: SseWriter,
  iterable: AsyncIterable<T>,
  options: PumpOptions = {},
): Promise<void> {
  const toEvent = options.toEvent ?? ((item) => ({ event: 'message', data: item }));
  const heartbeatMs = options.heartbeatMs ?? DEFAULT_HEARTBEAT_MS;
  const iterator = iterable[Symbol.asyncIterator]();

  const abort = (): void => {
    void iterator.return?.(undefined);
  };
  options.signal?.addEventListener('abort', abort, { once: true });

  // Keep the in-flight `iterator.next()` across heartbeat ticks so an event
  // that arrives mid-tick is not lost when the timer races ahead of it.
  let pendingNext: Promise<IteratorResult<T>> | null = null;
  try {
    while (!writer.closed) {
      if (!pendingNext) pendingNext = iterator.next();

      if (heartbeatMs <= 0) {
        const { value, done } = await pendingNext;
        pendingNext = null;
        if (done) break;
        writer.write(toEvent(value));
        continue;
      }

      let timerId: ReturnType<typeof setTimeout> | undefined;
      const heartbeat = new Promise<'tick'>((resolve) => {
        timerId = setTimeout(() => resolve('tick'), heartbeatMs);
      });
      const winner = await Promise.race([
        pendingNext.then((r) => ({ kind: 'next' as const, r })),
        heartbeat.then(() => ({ kind: 'tick' as const })),
      ]);
      if (timerId !== undefined) clearTimeout(timerId);

      if (winner.kind === 'tick') {
        if (!writer.closed) writer.comment('keepalive');
        continue;
      }
      pendingNext = null;
      if (winner.r.done) break;
      writer.write(toEvent(winner.r.value));
    }
  } finally {
    options.signal?.removeEventListener('abort', abort);
    writer.end();
    await iterator.return?.(undefined).catch(() => undefined);
  }
}
