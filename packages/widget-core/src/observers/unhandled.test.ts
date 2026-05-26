import { describe, expect, it, vi } from 'vitest';
import { createUnhandledObserver } from './unhandled.js';
import type { ErrorRecord } from './types.js';

type Handler = (event: Event) => void;

function fakeWindow(): {
  win: Window;
  listeners: Map<string, Handler>;
} {
  const listeners = new Map<string, Handler>();
  const win = {
    addEventListener: vi.fn((type: string, fn: Handler): void => {
      listeners.set(type, fn);
    }),
    removeEventListener: vi.fn((type: string): void => {
      listeners.delete(type);
    }),
  } as unknown as Window;
  return { win, listeners };
}

describe('createUnhandledObserver', () => {
  it('records an unhandled promise rejection (Error reason)', () => {
    const { win, listeners } = fakeWindow();
    const records: ErrorRecord[] = [];
    const obs = createUnhandledObserver({ window: win, onRecord: (r) => records.push(r) });
    obs.start();
    const reason = new TypeError('promise died');
    listeners.get('unhandledrejection')?.({ reason } as unknown as Event);
    expect(records[0]).toMatchObject({
      kind: 'unhandled-rejection',
      message: 'TypeError: promise died',
      stack: reason.stack,
    });
  });

  it('records a string reason', () => {
    const { win, listeners } = fakeWindow();
    const records: ErrorRecord[] = [];
    const obs = createUnhandledObserver({ window: win, onRecord: (r) => records.push(r) });
    obs.start();
    listeners.get('unhandledrejection')?.({ reason: 'oh no' } as unknown as Event);
    expect(records[0]?.message).toBe('oh no');
  });

  it('records an object reason via JSON', () => {
    const { win, listeners } = fakeWindow();
    const records: ErrorRecord[] = [];
    const obs = createUnhandledObserver({ window: win, onRecord: (r) => records.push(r) });
    obs.start();
    listeners.get('unhandledrejection')?.({ reason: { code: 42 } } as unknown as Event);
    expect(records[0]?.message).toBe('{"code":42}');
  });

  it('records null/undefined reason without crashing', () => {
    const { win, listeners } = fakeWindow();
    const records: ErrorRecord[] = [];
    const obs = createUnhandledObserver({ window: win, onRecord: (r) => records.push(r) });
    obs.start();
    listeners.get('unhandledrejection')?.({ reason: null } as unknown as Event);
    expect(records[0]?.message).toMatch(/no reason/);
  });

  it('records window-level synchronous errors', () => {
    const { win, listeners } = fakeWindow();
    const records: ErrorRecord[] = [];
    const obs = createUnhandledObserver({ window: win, onRecord: (r) => records.push(r) });
    obs.start();
    const error = new Error('uncaught');
    listeners.get('error')?.({ message: 'uncaught', error } as unknown as Event);
    expect(records[0]).toMatchObject({
      kind: 'window-error',
      message: 'uncaught',
      stack: error.stack,
    });
  });

  it('detaches listeners on stop()', () => {
    const { win, listeners } = fakeWindow();
    const obs = createUnhandledObserver({ window: win, onRecord: () => undefined });
    obs.start();
    obs.stop();
    expect(listeners.size).toBe(0);
  });

  it('is idempotent on start() and stop()', () => {
    const { win, listeners } = fakeWindow();
    const obs = createUnhandledObserver({ window: win, onRecord: () => undefined });
    obs.start();
    obs.start();
    expect(listeners.size).toBe(2);
    obs.stop();
    obs.stop();
    expect(listeners.size).toBe(0);
  });
});
