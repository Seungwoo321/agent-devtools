import { describe, it, expect } from 'vitest';
import { accumulateUsage } from './metadata.js';

describe('accumulateUsage', () => {
  it('returns the accumulator unchanged when next is undefined', () => {
    expect(accumulateUsage({ inputTokens: 1, totalTokens: 1 }, undefined)).toEqual({
      inputTokens: 1,
      totalTokens: 1,
    });
  });

  it('returns a clone of next when accumulator is undefined', () => {
    const next = { inputTokens: 5, outputTokens: 3, totalTokens: 8 };
    const result = accumulateUsage(undefined, next);
    expect(result).toEqual(next);
    expect(result).not.toBe(next); // clone, not reference
  });

  it('returns undefined when both are undefined', () => {
    expect(accumulateUsage(undefined, undefined)).toBeUndefined();
  });

  it('sums fields when both sides supply them', () => {
    const acc = { inputTokens: 10, outputTokens: 5, totalTokens: 15 };
    const next = { inputTokens: 20, outputTokens: 10, totalTokens: 30 };
    expect(accumulateUsage(acc, next)).toEqual({
      inputTokens: 30,
      outputTokens: 15,
      totalTokens: 45,
    });
  });

  it('treats missing fields as zero only when at least one side has it', () => {
    const acc = { inputTokens: 10 }; // no outputTokens, no totalTokens
    const next = { outputTokens: 5 }; // no inputTokens, no totalTokens
    // Each present-on-one-side field becomes that value; absent-on-both stays undefined
    expect(accumulateUsage(acc, next)).toEqual({
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: undefined,
    });
  });
});
