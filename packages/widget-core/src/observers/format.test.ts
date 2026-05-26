import { describe, expect, it } from 'vitest';
import { extractStack, formatArgs } from './format.js';

describe('formatArgs', () => {
  it('formats primitives joined by spaces', () => {
    expect(formatArgs(['a', 1, true])).toBe('a 1 true');
  });

  it('formats null / undefined verbatim', () => {
    expect(formatArgs([null, undefined])).toBe('null undefined');
  });

  it('uses `name: message` for Error instances', () => {
    expect(formatArgs([new TypeError('boom')])).toBe('TypeError: boom');
  });

  it('formats plain objects via JSON', () => {
    expect(formatArgs([{ a: 1, b: 'x' }])).toBe('{"a":1,"b":"x"}');
  });

  it('handles circular objects without throwing', () => {
    const a: { self?: unknown } = {};
    a.self = a;
    expect(formatArgs([a])).toMatch(/Circular/);
  });

  it('truncates very long strings', () => {
    const long = 'x'.repeat(2000);
    const out = formatArgs([long]);
    expect(out.length).toBeLessThan(1000);
    expect(out.endsWith('…')).toBe(true);
  });

  it('stringifies BigInt safely', () => {
    expect(formatArgs([{ n: 10n }])).toBe('{"n":"10"}');
  });

  it("returns '[Function name]' for named functions", () => {
    function foo(): void {}
    expect(formatArgs([foo])).toBe('[Function foo]');
  });

  it('handles symbols', () => {
    expect(formatArgs([Symbol('x')])).toBe('Symbol(x)');
  });
});

describe('extractStack', () => {
  it('returns the stack of the first Error in the args', () => {
    const err = new Error('boom');
    expect(extractStack(['hello', err])).toBe(err.stack);
  });

  it('returns undefined when no Error is present', () => {
    expect(extractStack(['hello', 42])).toBeUndefined();
  });
});
