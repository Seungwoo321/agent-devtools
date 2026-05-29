import { createConsoleErrorObserver } from './console-error.js';
import { drainEarlyErrors } from './early.js';
import { createNetworkObserver } from './network.js';
import { redactRecord } from './redact.js';
import { createUnhandledObserver } from './unhandled.js';
import type { ErrorRecord, ErrorRecordListener } from './types.js';

const DEFAULT_CAPACITY = 100;

/**
 * Aggregator that combines the three observers (console-error,
 * unhandled-rejection / window-error, fetch failure) behind a single
 * `start/stop` lifecycle and a bounded ring buffer.
 *
 * `getRecords()` returns a defensive copy — the internal buffer is mutable
 * and we don't want consumers to accidentally extend its lifetime by
 * reading a live reference.
 */

export interface ErrorObserverOptions {
  /** Window for unhandledrejection / error listeners. */
  window?: Window;
  /** Console object to patch. */
  console?: Console;
  /** Global host for `fetch`. */
  globalObject?: { fetch: typeof fetch };
  /** Ring buffer capacity. Default 100. Oldest records evict first. */
  capacity?: number;
}

export interface ErrorObserverHandle {
  start(): void;
  stop(): void;
  getRecords(): ErrorRecord[];
  clear(): void;
  /** Subscribe to records as they arrive; returns an unsubscribe fn. */
  subscribe(listener: ErrorRecordListener): () => void;
  /**
   * Inject a record from a non-listener source — the widget-internal guard
   * (orchestrator/guard.ts) routes its caught throws through here so they
   * share the same redact + buffer + subscriber path as native captures.
   * Safe to call at any time; no-op semantically equivalent to a sub-observer
   * push.
   */
  ingest(record: ErrorRecord): void;
}

export function createErrorObserver(options: ErrorObserverOptions = {}): ErrorObserverHandle {
  const capacity = options.capacity ?? DEFAULT_CAPACITY;
  const buffer: ErrorRecord[] = [];
  const listeners = new Set<ErrorRecordListener>();

  function push(record: ErrorRecord): void {
    // Single redaction choke point — sub-observers emit raw records and we
    // mask them here before the record is buffered, returned by
    // `getRecords()`, or delivered to a subscriber. Keeps the privacy
    // guarantee in one place rather than scattered across each source.
    const safe = redactRecord(record);
    buffer.push(safe);
    if (buffer.length > capacity) buffer.shift();
    for (const listener of listeners) {
      try {
        listener(safe);
      } catch {
        // a faulty subscriber must not break observation
      }
    }
  }

  const consoleObs = createConsoleErrorObserver({
    ...(options.console !== undefined && { console: options.console }),
    onRecord: push,
  });
  const unhandledObs = createUnhandledObserver({
    ...(options.window !== undefined && { window: options.window }),
    onRecord: push,
  });
  const networkObs = createNetworkObserver({
    ...(options.globalObject !== undefined && { globalObject: options.globalObject }),
    onRecord: push,
  });

  let started = false;

  return {
    start(): void {
      if (started) return;
      started = true;
      consoleObs.start();
      unhandledObs.start();
      networkObs.start();
      // Pull anything the L0 early trap caught BEFORE this observer existed
      // (host bundle parse errors, top-level await rejections, the host's
      // first synchronous render throw). The trap is then disposed, so from
      // this point forward the sub-observers own the same event streams.
      // Tolerant of a missing window or missing trap (older bundler).
      drainEarlyErrors(push, options.window);
    },
    stop(): void {
      if (!started) return;
      started = false;
      consoleObs.stop();
      unhandledObs.stop();
      networkObs.stop();
    },
    getRecords(): ErrorRecord[] {
      return buffer.slice();
    },
    clear(): void {
      buffer.length = 0;
    },
    subscribe(listener: ErrorRecordListener): () => void {
      listeners.add(listener);
      return (): void => {
        listeners.delete(listener);
      };
    },
    ingest(record: ErrorRecord): void {
      push(record);
    },
  };
}
