import { createConsoleErrorObserver } from './console-error.js';
import { createNetworkObserver } from './network.js';
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
}

export function createErrorObserver(options: ErrorObserverOptions = {}): ErrorObserverHandle {
  const capacity = options.capacity ?? DEFAULT_CAPACITY;
  const buffer: ErrorRecord[] = [];
  const listeners = new Set<ErrorRecordListener>();

  function push(record: ErrorRecord): void {
    buffer.push(record);
    if (buffer.length > capacity) buffer.shift();
    for (const listener of listeners) {
      try {
        listener(record);
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
  };
}
