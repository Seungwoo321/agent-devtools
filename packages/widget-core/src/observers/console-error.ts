import { extractStack, formatArgs } from './format.js';
import type { ErrorRecord } from './types.js';

/**
 * Monkey-patch `console.error` to also emit a record. The original
 * implementation is preserved and called with the original arguments — we
 * never swallow output. Calling `stop()` restores the previous
 * `console.error` reference unconditionally (matches the picker's
 * single-use lifecycle).
 */

export interface ConsoleErrorObserverOptions {
  /** Console object to patch. Defaults to `globalThis.console`. */
  console?: Console;
  /** Receives each captured record. */
  onRecord: (record: ErrorRecord) => void;
}

export interface ConsoleErrorObserverHandle {
  start(): void;
  stop(): void;
}

export function createConsoleErrorObserver(
  options: ConsoleErrorObserverOptions,
): ConsoleErrorObserverHandle {
  const target = options.console ?? globalThis.console;
  let originalError: typeof target.error | null = null;

  function patchedError(this: Console, ...args: unknown[]): void {
    try {
      const stack = extractStack(args);
      const record: ErrorRecord = {
        kind: 'console-error',
        timestamp: Date.now(),
        message: formatArgs(args),
        ...(stack !== undefined && { stack }),
      };
      options.onRecord(record);
    } catch {
      // Never let observer failure break console.error itself.
    }
    if (originalError) originalError.apply(this, args);
  }

  return {
    start(): void {
      if (originalError) return;
      originalError = target.error;
      target.error = patchedError;
    },
    stop(): void {
      if (!originalError) return;
      target.error = originalError;
      originalError = null;
    },
  };
}
