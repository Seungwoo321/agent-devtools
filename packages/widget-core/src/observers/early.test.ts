import { describe, expect, it, vi } from 'vitest';
import { EARLY_ERRORS_GLOBAL, buildEarlyErrorTrapScript, drainEarlyErrors } from './early.js';
import type { ErrorRecord } from './types.js';

interface ListenerEntry {
  fn: (event: unknown) => void;
  capture: boolean;
}

interface FakeWindow {
  addEventListener(type: string, fn: (event: unknown) => void, capture?: boolean): void;
  removeEventListener(type: string, fn: (event: unknown) => void, capture?: boolean): void;
  dispatch(type: string, event: unknown): void;
  listenerCount(type: string): number;
  [key: string]: unknown;
}

/**
 * Bare-bones window stand-in: enough surface for the early trap to register,
 * dispatch, and dispose listeners. We sidestep jsdom on purpose so the trap
 * is exercised in the same minimalist environment a tiny classic script sees
 * during the host's first paint — before any framework runtime has booted.
 */
function makeFakeWindow(): FakeWindow {
  const listeners = new Map<string, Set<ListenerEntry>>();
  const win: FakeWindow = {
    addEventListener(type, fn, capture): void {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)?.add({ fn, capture: Boolean(capture) });
    },
    removeEventListener(type, fn, capture): void {
      const set = listeners.get(type);
      if (!set) return;
      for (const entry of Array.from(set)) {
        if (entry.fn === fn && entry.capture === Boolean(capture)) set.delete(entry);
      }
    },
    dispatch(type, event): void {
      const set = listeners.get(type);
      if (!set) return;
      for (const entry of Array.from(set)) entry.fn(event);
    },
    listenerCount(type): number {
      return listeners.get(type)?.size ?? 0;
    },
  };
  return win;
}

function installTrap(win: FakeWindow): void {
  const script = buildEarlyErrorTrapScript();
  // The script is authored as a classic IIFE that references `window`. We
  // evaluate it in a sandbox where `window` is bound to our fake, so the
  // trap installs against the fake without touching the test runner globals.
  new Function('window', script)(win);
}

describe('buildEarlyErrorTrapScript', () => {
  it('returns a string that references the shared global key and both event types', () => {
    const src = buildEarlyErrorTrapScript();
    expect(typeof src).toBe('string');
    expect(src).toContain(EARLY_ERRORS_GLOBAL);
    expect(src).toContain('addEventListener("error"');
    expect(src).toContain('addEventListener("unhandledrejection"');
  });

  it('installs a global with records[] and dispose()', () => {
    const win = makeFakeWindow();
    installTrap(win);
    const slot = win[EARLY_ERRORS_GLOBAL] as { records: unknown; dispose: unknown };
    expect(Array.isArray(slot.records)).toBe(true);
    expect(typeof slot.dispose).toBe('function');
    expect(win.listenerCount('error')).toBe(1);
    expect(win.listenerCount('unhandledrejection')).toBe(1);
  });

  it('captures window error events with message + stack', () => {
    const win = makeFakeWindow();
    installTrap(win);
    win.dispatch('error', { message: 'boom', error: { stack: 'Error: boom\n    at x' } });
    const records = (win[EARLY_ERRORS_GLOBAL] as { records: ErrorRecord[] }).records;
    expect(records).toHaveLength(1);
    expect(records[0]?.kind).toBe('window-error');
    expect(records[0]?.message).toBe('boom');
    expect(records[0]?.stack).toBe('Error: boom\n    at x');
  });

  it('falls back to "window error" when the event has no message', () => {
    const win = makeFakeWindow();
    installTrap(win);
    win.dispatch('error', {});
    const records = (win[EARLY_ERRORS_GLOBAL] as { records: ErrorRecord[] }).records;
    expect(records[0]?.message).toBe('window error');
  });

  it('formats Error-shaped rejection reasons as "Name: message" with stack', () => {
    const win = makeFakeWindow();
    installTrap(win);
    win.dispatch('unhandledrejection', {
      reason: { name: 'TypeError', message: 'nope', stack: 'TypeError: nope\n    at y' },
    });
    const records = (win[EARLY_ERRORS_GLOBAL] as { records: ErrorRecord[] }).records;
    expect(records[0]?.kind).toBe('unhandled-rejection');
    expect(records[0]?.message).toBe('TypeError: nope');
    expect(records[0]?.stack).toBe('TypeError: nope\n    at y');
  });

  it('handles string rejection reasons', () => {
    const win = makeFakeWindow();
    installTrap(win);
    win.dispatch('unhandledrejection', { reason: 'plain string' });
    const records = (win[EARLY_ERRORS_GLOBAL] as { records: ErrorRecord[] }).records;
    expect(records[0]?.message).toBe('plain string');
    expect(records[0]?.stack).toBeUndefined();
  });

  it('handles null/undefined rejection reasons with a sentinel message', () => {
    const win = makeFakeWindow();
    installTrap(win);
    win.dispatch('unhandledrejection', { reason: null });
    win.dispatch('unhandledrejection', { reason: undefined });
    const records = (win[EARLY_ERRORS_GLOBAL] as { records: ErrorRecord[] }).records;
    expect(records).toHaveLength(2);
    expect(records[0]?.message).toBe('unhandled rejection (no reason)');
    expect(records[1]?.message).toBe('unhandled rejection (no reason)');
  });

  it('JSON-stringifies plain-object rejection reasons', () => {
    const win = makeFakeWindow();
    installTrap(win);
    win.dispatch('unhandledrejection', { reason: { code: 42, scope: 'boot' } });
    const records = (win[EARLY_ERRORS_GLOBAL] as { records: ErrorRecord[] }).records;
    expect(records[0]?.message).toBe('{"code":42,"scope":"boot"}');
  });

  it('caps the buffer at 100 records (oldest evicted)', () => {
    const win = makeFakeWindow();
    installTrap(win);
    for (let i = 0; i < 150; i += 1) {
      win.dispatch('error', { message: `e${i}` });
    }
    const records = (win[EARLY_ERRORS_GLOBAL] as { records: ErrorRecord[] }).records;
    expect(records).toHaveLength(100);
    expect(records[0]?.message).toBe('e50');
    expect(records[99]?.message).toBe('e149');
  });

  it('is idempotent — a second install does not duplicate listeners', () => {
    const win = makeFakeWindow();
    installTrap(win);
    installTrap(win);
    expect(win.listenerCount('error')).toBe(1);
    expect(win.listenerCount('unhandledrejection')).toBe(1);
  });
});

describe('drainEarlyErrors', () => {
  it('no-ops when win is missing or not an object', () => {
    const ingest = vi.fn();
    drainEarlyErrors(ingest, undefined);
    drainEarlyErrors(ingest, null);
    drainEarlyErrors(ingest, 42);
    expect(ingest).not.toHaveBeenCalled();
  });

  it('no-ops when the global slot is missing or not an object', () => {
    const ingest = vi.fn();
    drainEarlyErrors(ingest, {});
    drainEarlyErrors(ingest, { [EARLY_ERRORS_GLOBAL]: 'oops' });
    expect(ingest).not.toHaveBeenCalled();
  });

  it('disposes the trap, copies records, and ingests each one', () => {
    const win = makeFakeWindow();
    installTrap(win);
    win.dispatch('error', { message: 'boom' });
    win.dispatch('unhandledrejection', { reason: 'string' });
    const seen: ErrorRecord[] = [];
    drainEarlyErrors((r) => seen.push(r), win);
    expect(win.listenerCount('error')).toBe(0);
    expect(win.listenerCount('unhandledrejection')).toBe(0);
    expect(seen.map((r) => r.kind)).toEqual(['window-error', 'unhandled-rejection']);
  });

  it('is idempotent — a second drain finds nothing left to ingest', () => {
    const win = makeFakeWindow();
    installTrap(win);
    win.dispatch('error', { message: 'boom' });
    const ingest = vi.fn();
    drainEarlyErrors(ingest, win);
    drainEarlyErrors(ingest, win);
    expect(ingest).toHaveBeenCalledTimes(1);
  });

  it('tolerates a dispose() that throws', () => {
    const win = {
      [EARLY_ERRORS_GLOBAL]: {
        records: [{ kind: 'window-error', timestamp: 1, message: 'x' }],
        dispose: (): void => {
          throw new Error('dispose failed');
        },
      },
    };
    const seen: ErrorRecord[] = [];
    expect(() => drainEarlyErrors((r) => seen.push(r), win)).not.toThrow();
    expect(seen).toHaveLength(1);
  });

  it('drops records with unknown kinds and coerces missing fields', () => {
    const win = {
      [EARLY_ERRORS_GLOBAL]: {
        records: [
          { kind: 'window-error', timestamp: 100, message: 'ok' },
          { kind: 'mystery', timestamp: 200, message: 'skip me' },
          { kind: 'unhandled-rejection', message: 'no timestamp' },
          { kind: 'window-error', timestamp: 'nope', message: 'bad ts' },
          { kind: 'window-error', timestamp: 300 },
        ],
        dispose: (): void => undefined,
      },
    };
    const seen: ErrorRecord[] = [];
    drainEarlyErrors((r) => seen.push(r), win);
    expect(seen).toHaveLength(4);
    expect(seen.map((r) => r.kind)).toEqual([
      'window-error',
      'unhandled-rejection',
      'window-error',
      'window-error',
    ]);
    // missing timestamp coerced to a number (Date.now())
    expect(typeof seen[1]?.timestamp).toBe('number');
    // non-string message coerced to fallback
    expect(seen[3]?.message).toBe('early error');
  });

  it('omits stack when raw has no string stack', () => {
    const win = {
      [EARLY_ERRORS_GLOBAL]: {
        records: [
          { kind: 'window-error', timestamp: 1, message: 'no stack' },
          { kind: 'window-error', timestamp: 1, message: 'empty stack', stack: '' },
        ],
        dispose: (): void => undefined,
      },
    };
    const seen: ErrorRecord[] = [];
    drainEarlyErrors((r) => seen.push(r), win);
    expect(seen[0]?.stack).toBeUndefined();
    expect(seen[1]?.stack).toBeUndefined();
  });
});
