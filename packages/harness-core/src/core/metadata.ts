/**
 * Run-level Metadata Helpers
 *
 * Strategies make multiple LLM calls per run; the route consumer wants
 * one number for total tokens. `accumulateUsage` folds each call's usage
 * into a running total, returning `undefined` only when no provider in
 * the run reported usage at all (so consumers can distinguish "no data"
 * from "zero tokens").
 */

import type { TokenUsage } from '../llm/types.js';

/**
 * Add `next` into `acc`. Either operand may be undefined; absent fields
 * are skipped, not zero-filled, so a provider that omits `inputTokens`
 * doesn't pollute the accumulated total with phantom zeros.
 */
export function accumulateUsage(
  acc: TokenUsage | undefined,
  next: TokenUsage | undefined,
): TokenUsage | undefined {
  if (!next) return acc;
  if (!acc) return { ...next };
  const sumField = (a: number | undefined, b: number | undefined): number | undefined => {
    if (a == null && b == null) return undefined;
    return (a ?? 0) + (b ?? 0);
  };
  const inputTokens = sumField(acc.inputTokens, next.inputTokens);
  const outputTokens = sumField(acc.outputTokens, next.outputTokens);
  const totalTokens = sumField(acc.totalTokens, next.totalTokens);
  return {
    ...(inputTokens !== undefined && { inputTokens }),
    ...(outputTokens !== undefined && { outputTokens }),
    ...(totalTokens !== undefined && { totalTokens }),
  };
}
