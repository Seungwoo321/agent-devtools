import type { ErrorRecord } from './types.js';

/**
 * Capture two browser events that hold otherwise-invisible failures:
 *
 *   - `unhandledrejection` — a Promise rejected without a handler. Fires on
 *     window. Reason can be anything (Error, string, object).
 *   - `error` — a synchronous error escaped to the global scope (thrown
 *     outside any try/catch). The event exposes `message`, `error`,
 *     `filename`, `lineno`, `colno`.
 *
 * Both listeners are registered in the capture phase so application
 * `event.preventDefault()` handlers don't suppress them.
 */

export interface UnhandledObserverOptions {
  /** Window to listen on. Defaults to `globalThis.window`. */
  window?: Window;
  onRecord: (record: ErrorRecord) => void;
}

export interface UnhandledObserverHandle {
  start(): void;
  stop(): void;
}

export function createUnhandledObserver(
  options: UnhandledObserverOptions,
): UnhandledObserverHandle {
  const win = options.window ?? globalThis.window;
  let attached = false;

  const onRejection = (event: PromiseRejectionEvent): void => {
    const reason = event.reason;
    const record: ErrorRecord = {
      kind: 'unhandled-rejection',
      timestamp: Date.now(),
      message: messageFromReason(reason),
      ...(stackFromReason(reason) !== undefined && { stack: stackFromReason(reason) as string }),
    };
    options.onRecord(record);
  };

  const onError = (event: ErrorEvent): void => {
    const error = event.error;
    const record: ErrorRecord = {
      kind: 'window-error',
      timestamp: Date.now(),
      message: typeof event.message === 'string' ? event.message : 'window error',
      ...(error instanceof Error && typeof error.stack === 'string' && { stack: error.stack }),
    };
    options.onRecord(record);
  };

  return {
    start(): void {
      if (attached) return;
      attached = true;
      win.addEventListener('unhandledrejection', onRejection, true);
      win.addEventListener('error', onError, true);
    },
    stop(): void {
      if (!attached) return;
      attached = false;
      win.removeEventListener('unhandledrejection', onRejection, true);
      win.removeEventListener('error', onError, true);
    },
  };
}

function messageFromReason(reason: unknown): string {
  if (reason instanceof Error) return `${reason.name}: ${reason.message}`;
  if (typeof reason === 'string') return reason;
  if (reason === null || reason === undefined) return 'unhandled rejection (no reason)';
  try {
    return JSON.stringify(reason) ?? String(reason);
  } catch {
    return String(reason);
  }
}

function stackFromReason(reason: unknown): string | undefined {
  if (reason instanceof Error && typeof reason.stack === 'string') return reason.stack;
  return undefined;
}
