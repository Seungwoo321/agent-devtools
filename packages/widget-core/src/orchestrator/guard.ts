/**
 * Layer 1 of the runtime-resilience design: widget-internal throw containment.
 *
 * The widget UI is plain DOM — there is no React error boundary above it, so
 * a throw inside an event handler (composer submit, picker overlay, launcher
 * click, keydown) would bubble to the browser's default handler and either
 * lock the surface (no further interactions) or get swallowed silently
 * depending on how the host wired its own error machinery. Either way, the
 * devtool would visibly stall and the user would have no clue why.
 *
 * The guard wraps boundary callbacks. When the wrapped fn throws (sync) or
 * rejects (async), we:
 *
 *   1. capture the throw into the observer as a `widget-internal` record,
 *      so it shows up in the same surface the host's runtime errors do —
 *      the agent gets one unified evidence stream;
 *   2. swallow it at the boundary so the widget stays responsive — the next
 *      click, the next keystroke, still works;
 *   3. tag the record with a label (e.g. "composer.onSubmit") so the agent
 *      can tell which boundary failed without having to parse the stack.
 *
 * The guard intentionally does NOT try to "recover" the failed action —
 * recovery is the caller's responsibility (and almost always means "show
 * the error inline, let the user retry"). The guard's job is bounded:
 * keep the failure from cascading out of the boundary.
 *
 * Failing in the guard itself is the worst possible outcome — it would
 * eat the throw silently AND not record it. Every step inside is
 * defensively wrapped so ingest errors, label coercion errors, etc. cannot
 * propagate. If the underlying observer is gone (post-destroy), we fall
 * back to console so the throw still leaves a trace.
 */
import type { ErrorRecord } from '../observers/types.js';

/** Public seam — the observer's `ingest(record)` method matches this. */
export type IngestFn = (record: ErrorRecord) => void;

export interface WidgetGuardOptions {
  /** Where caught throws go — typically `observer.ingest`. */
  ingest: IngestFn;
  /**
   * Console used for last-resort logging if ingest itself throws. Injected
   * for test isolation; defaults to the global console.
   */
  console?: Pick<Console, 'error'>;
}

export interface WidgetGuardHandle {
  /**
   * Wrap a synchronous boundary callback. Returns a new fn with the same
   * signature; throws are captured + recorded + swallowed.
   */
  guard<T extends (...args: never[]) => unknown>(fn: T, label: string): T;
  /**
   * Wrap an async (or possibly-async) boundary callback. Both sync throws
   * during fn invocation and rejected promises are captured.
   */
  guardAsync<T extends (...args: never[]) => unknown>(fn: T, label: string): T;
  /**
   * Record a throw directly without wrapping anything — for places that
   * already have their own try/catch but want to share the same evidence
   * path (e.g. a destroy() teardown).
   */
  capture(error: unknown, label: string): void;
}

export function createWidgetGuard(options: WidgetGuardOptions): WidgetGuardHandle {
  const con = options.console ?? console;

  function recordThrow(error: unknown, label: string): void {
    const record = buildRecord(error, label);
    try {
      options.ingest(record);
    } catch (ingestErr) {
      // Ingest itself failed — emit to console as last resort so the throw
      // is at least visible to a developer poking devtools.
      try {
        con.error('[agent-devtools] widget guard could not record throw', {
          label,
          original: error,
          ingestError: ingestErr,
        });
      } catch {
        // Even console failed — give up silently. We must not rethrow from
        // the guard or the boundary we were protecting would re-break.
      }
    }
  }

  return {
    guard<T extends (...args: never[]) => unknown>(fn: T, label: string): T {
      const wrapped = (...args: never[]): unknown => {
        try {
          return fn(...args);
        } catch (err) {
          recordThrow(err, label);
          return undefined;
        }
      };
      return wrapped as T;
    },
    guardAsync<T extends (...args: never[]) => unknown>(fn: T, label: string): T {
      const wrapped = (...args: never[]): unknown => {
        let result: unknown;
        try {
          result = fn(...args);
        } catch (err) {
          recordThrow(err, label);
          return undefined;
        }
        if (isPromiseLike(result)) {
          return result.then(
            (value) => value,
            (err: unknown) => {
              recordThrow(err, label);
              return undefined;
            },
          );
        }
        return result;
      };
      return wrapped as T;
    },
    capture(error, label): void {
      recordThrow(error, label);
    },
  };
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof (value as { then?: unknown }).then === 'function'
  );
}

function buildRecord(error: unknown, label: string): ErrorRecord {
  const safeLabel = typeof label === 'string' && label.length > 0 ? label : 'widget';
  let message: string;
  let stack: string | undefined;
  if (error instanceof Error) {
    const name = typeof error.name === 'string' && error.name.length > 0 ? error.name : 'Error';
    message = `[${safeLabel}] ${name}: ${error.message}`;
    if (typeof error.stack === 'string' && error.stack.length > 0) stack = error.stack;
  } else if (typeof error === 'string') {
    message = `[${safeLabel}] ${error}`;
  } else if (error === null || error === undefined) {
    message = `[${safeLabel}] threw a non-error value`;
  } else {
    let serialized: string;
    try {
      serialized = JSON.stringify(error);
    } catch {
      serialized = String(error);
    }
    message = `[${safeLabel}] ${serialized ?? String(error)}`;
  }
  const record: ErrorRecord = {
    kind: 'widget-internal',
    timestamp: Date.now(),
    message,
  };
  if (stack !== undefined) record.stack = stack;
  return record;
}
