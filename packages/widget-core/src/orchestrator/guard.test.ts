import { describe, expect, it, vi } from 'vitest';
import { createWidgetGuard } from './guard.js';
import type { ErrorRecord } from '../observers/types.js';

function makeGuard(): {
  guard: ReturnType<typeof createWidgetGuard>;
  records: ErrorRecord[];
  ingest: ReturnType<typeof vi.fn>;
  consoleErr: ReturnType<typeof vi.fn>;
} {
  const records: ErrorRecord[] = [];
  const ingest = vi.fn((r: ErrorRecord) => {
    records.push(r);
  });
  const consoleErr = vi.fn();
  const guard = createWidgetGuard({ ingest, console: { error: consoleErr } });
  return { guard, records, ingest, consoleErr };
}

describe('createWidgetGuard / guard (sync)', () => {
  it('passes through the return value when fn does not throw', () => {
    const { guard } = makeGuard();
    const wrapped = guard.guard((a: number, b: number) => a + b, 'sum');
    expect(wrapped(2, 3)).toBe(5);
  });

  it('captures Error throws as widget-internal records with the label prefix', () => {
    const { guard, records } = makeGuard();
    const wrapped = guard.guard(() => {
      throw new TypeError('nope');
    }, 'composer.onSubmit');
    expect(wrapped()).toBeUndefined();
    expect(records).toHaveLength(1);
    expect(records[0]?.kind).toBe('widget-internal');
    expect(records[0]?.message).toBe('[composer.onSubmit] TypeError: nope');
    expect(records[0]?.stack).toMatch(/TypeError: nope/);
  });

  it('captures string throws', () => {
    const { guard, records } = makeGuard();
    guard.guard(() => {
      throw 'string thrown';
    }, 'picker.onPick')();
    expect(records[0]?.message).toBe('[picker.onPick] string thrown');
    expect(records[0]?.stack).toBeUndefined();
  });

  it('captures null / undefined throws with a sentinel', () => {
    const { guard, records } = makeGuard();
    guard.guard(() => {
      throw null;
    }, 'launcher.onClick')();
    expect(records[0]?.message).toBe('[launcher.onClick] threw a non-error value');
  });

  it('JSON-stringifies plain-object throws', () => {
    const { guard, records } = makeGuard();
    guard.guard(() => {
      throw { code: 7, why: 'bad' };
    }, 'keydown')();
    expect(records[0]?.message).toBe('[keydown] {"code":7,"why":"bad"}');
  });

  it('falls back to a default label when label is empty', () => {
    const { guard, records } = makeGuard();
    guard.guard(() => {
      throw new Error('boom');
    }, '')();
    expect(records[0]?.message).toBe('[widget] Error: boom');
  });
});

describe('createWidgetGuard / guardAsync', () => {
  it('passes through a resolved promise value', async () => {
    const { guard } = makeGuard();
    const wrapped = guard.guardAsync(async (n: number) => n * 2, 'asyncOk');
    await expect(wrapped(5)).resolves.toBe(10);
  });

  it('captures a rejected promise without throwing', async () => {
    const { guard, records } = makeGuard();
    const wrapped = guard.guardAsync(async () => {
      throw new Error('async fail');
    }, 'composer.handleSubmit');
    await expect(wrapped()).resolves.toBeUndefined();
    expect(records).toHaveLength(1);
    expect(records[0]?.message).toBe('[composer.handleSubmit] Error: async fail');
  });

  it('captures a synchronous throw inside an async-wrapped fn', async () => {
    const { guard, records } = makeGuard();
    const wrapped = guard.guardAsync(() => {
      throw new Error('sync inside async');
    }, 'handleHandoff');
    const result = wrapped();
    // sync throw is caught before promise chain; returns undefined directly
    expect(result).toBeUndefined();
    expect(records[0]?.message).toContain('sync inside async');
  });

  it('passes through a non-promise return value (caller might be sync)', () => {
    const { guard } = makeGuard();
    const wrapped = guard.guardAsync((n: number) => n + 1, 'maybeSync');
    expect(wrapped(4)).toBe(5);
  });
});

describe('createWidgetGuard / capture', () => {
  it('records a throw without wrapping anything', () => {
    const { guard, records } = makeGuard();
    guard.capture(new Error('teardown failed'), 'destroy');
    expect(records).toHaveLength(1);
    expect(records[0]?.message).toBe('[destroy] Error: teardown failed');
  });
});

describe('createWidgetGuard / ingest failure containment', () => {
  it('does not rethrow when ingest itself throws — falls back to console', () => {
    const consoleErr = vi.fn();
    const guard = createWidgetGuard({
      ingest: () => {
        throw new Error('observer dead');
      },
      console: { error: consoleErr },
    });
    expect(() =>
      guard.guard(() => {
        throw new Error('original');
      }, 'x')(),
    ).not.toThrow();
    expect(consoleErr).toHaveBeenCalledOnce();
    const [tag, payload] = consoleErr.mock.calls[0] ?? [];
    expect(tag).toContain('agent-devtools');
    expect(payload).toMatchObject({ label: 'x' });
  });

  it('silently gives up when even console.error throws', () => {
    const guard = createWidgetGuard({
      ingest: () => {
        throw new Error('observer dead');
      },
      console: {
        error: () => {
          throw new Error('console dead too');
        },
      },
    });
    expect(() =>
      guard.guard(() => {
        throw new Error('original');
      }, 'x')(),
    ).not.toThrow();
  });
});
