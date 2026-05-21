import { describe, expect, it, vi } from 'vitest';
import { createErrorObserver } from './observer.js';
import type { ErrorRecord } from './types.js';

function fakeWindow(): Window {
  return {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as Window;
}

function fakeConsole(): Console {
  return { error: vi.fn() } as unknown as Console;
}

function fakeFetch(): typeof fetch {
  return vi.fn(() =>
    Promise.resolve({ ok: true, status: 200 } as Response),
  ) as unknown as typeof fetch;
}

describe('createErrorObserver', () => {
  it('captures records from console.error', () => {
    const con = fakeConsole();
    const obs = createErrorObserver({
      console: con,
      window: fakeWindow(),
      globalObject: { fetch: fakeFetch() },
    });
    obs.start();
    con.error('failed');
    expect(obs.getRecords()).toHaveLength(1);
    expect(obs.getRecords()[0]?.kind).toBe('console-error');
    obs.stop();
  });

  it('evicts oldest record when capacity is exceeded (FIFO)', () => {
    const con = fakeConsole();
    const obs = createErrorObserver({
      console: con,
      window: fakeWindow(),
      globalObject: { fetch: fakeFetch() },
      capacity: 3,
    });
    obs.start();
    con.error('a');
    con.error('b');
    con.error('c');
    con.error('d');
    expect(obs.getRecords().map((r) => r.message)).toEqual(['b', 'c', 'd']);
    obs.stop();
  });

  it('returns a defensive copy from getRecords()', () => {
    const con = fakeConsole();
    const obs = createErrorObserver({
      console: con,
      window: fakeWindow(),
      globalObject: { fetch: fakeFetch() },
    });
    obs.start();
    con.error('a');
    const snapshot = obs.getRecords();
    snapshot.length = 0;
    expect(obs.getRecords()).toHaveLength(1);
    obs.stop();
  });

  it('clear() wipes the buffer', () => {
    const con = fakeConsole();
    const obs = createErrorObserver({
      console: con,
      window: fakeWindow(),
      globalObject: { fetch: fakeFetch() },
    });
    obs.start();
    con.error('a');
    obs.clear();
    expect(obs.getRecords()).toEqual([]);
    obs.stop();
  });

  it('notifies subscribers in order and respects unsubscribe', () => {
    const con = fakeConsole();
    const obs = createErrorObserver({
      console: con,
      window: fakeWindow(),
      globalObject: { fetch: fakeFetch() },
    });
    obs.start();
    const seen: ErrorRecord[] = [];
    const unsub = obs.subscribe((r) => seen.push(r));
    con.error('a');
    unsub();
    con.error('b');
    expect(seen.map((r) => r.message)).toEqual(['a']);
    obs.stop();
  });

  it("a faulty subscriber doesn't prevent others from running", () => {
    const con = fakeConsole();
    const obs = createErrorObserver({
      console: con,
      window: fakeWindow(),
      globalObject: { fetch: fakeFetch() },
    });
    obs.start();
    obs.subscribe(() => {
      throw new Error('subscriber crashed');
    });
    let goodCalls = 0;
    obs.subscribe(() => {
      goodCalls += 1;
    });
    expect(() => con.error('a')).not.toThrow();
    expect(goodCalls).toBe(1);
    obs.stop();
  });

  it('does not capture after stop()', () => {
    const con = fakeConsole();
    const obs = createErrorObserver({
      console: con,
      window: fakeWindow(),
      globalObject: { fetch: fakeFetch() },
    });
    obs.start();
    obs.stop();
    con.error('after stop');
    expect(obs.getRecords()).toEqual([]);
  });

  it('is idempotent on start() and stop()', () => {
    const con = fakeConsole();
    const obs = createErrorObserver({
      console: con,
      window: fakeWindow(),
      globalObject: { fetch: fakeFetch() },
    });
    obs.start();
    obs.start();
    con.error('a');
    expect(obs.getRecords()).toHaveLength(1);
    obs.stop();
    obs.stop();
  });
});
