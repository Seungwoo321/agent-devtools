import { describe, expect, it, vi } from 'vitest';
import { createConsoleErrorObserver } from './console-error.js';
import type { ErrorRecord } from './types.js';

function fakeConsole(): Console {
  return {
    error: vi.fn(),
  } as unknown as Console;
}

describe('createConsoleErrorObserver', () => {
  it('emits a record for each console.error call', () => {
    const con = fakeConsole();
    const records: ErrorRecord[] = [];
    const obs = createConsoleErrorObserver({ console: con, onRecord: (r) => records.push(r) });
    obs.start();
    con.error('something failed');
    expect(records).toHaveLength(1);
    expect(records[0]?.kind).toBe('console-error');
    expect(records[0]?.message).toBe('something failed');
    obs.stop();
  });

  it('preserves the original console.error call after patching', () => {
    const original = vi.fn();
    const con = { error: original } as unknown as Console;
    const obs = createConsoleErrorObserver({ console: con, onRecord: () => undefined });
    obs.start();
    con.error('hi', 1);
    expect(original).toHaveBeenCalledWith('hi', 1);
    obs.stop();
  });

  it('attaches Error stack to the record', () => {
    const con = fakeConsole();
    const records: ErrorRecord[] = [];
    const obs = createConsoleErrorObserver({ console: con, onRecord: (r) => records.push(r) });
    const err = new Error('boom');
    obs.start();
    con.error('caught', err);
    expect(records[0]?.stack).toBe(err.stack);
    obs.stop();
  });

  it('restores the original console.error on stop', () => {
    const original = vi.fn();
    const con = { error: original } as unknown as Console;
    const obs = createConsoleErrorObserver({ console: con, onRecord: () => undefined });
    obs.start();
    obs.stop();
    expect(con.error).toBe(original);
  });

  it('is idempotent: start() twice does not double-wrap', () => {
    const con = fakeConsole();
    const records: ErrorRecord[] = [];
    const obs = createConsoleErrorObserver({ console: con, onRecord: (r) => records.push(r) });
    obs.start();
    obs.start();
    con.error('once');
    expect(records).toHaveLength(1);
    obs.stop();
  });

  it('never throws if onRecord throws — original console.error still fires', () => {
    const originalError = vi.fn();
    const con = { error: originalError } as unknown as Console;
    const obs = createConsoleErrorObserver({
      console: con,
      onRecord: () => {
        throw new Error('listener crashed');
      },
    });
    obs.start();
    expect(() => con.error('safe')).not.toThrow();
    expect(originalError).toHaveBeenCalledWith('safe');
    obs.stop();
  });
});
