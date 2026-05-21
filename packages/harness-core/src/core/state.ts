/**
 * Loop State Construction
 *
 * The `LoopState` type itself lives in `types.ts` (so `OperationDomain`
 * can reference it without a forward import). This module owns the
 * factory that turns an `AgentInput` into a fresh state object.
 */

import type { AgentInput, AgentOptions, LoopState } from './types.js';

/**
 * Recommended `phase` values for generation-style strategies.
 * `LoopState.phase` is typed as `string` so operation domains can use
 * their own vocabulary (e.g. `'tool_round_3'`).
 */
export type LoopPhase =
  | 'analyze'
  | 'plan'
  | 'generate'
  | 'validate'
  | 'render'
  | 'complete'
  | 'error';

const MAX_ITERATIONS_LIMIT = 20;
const DEFAULT_MAX_ITERATIONS = 3;

/**
 * Create an initial loop state from the given input.
 */
export function createLoopState(input: AgentInput, defaultIterations?: number): LoopState {
  const opts: AgentOptions = input.options ?? {};
  const requested =
    opts.maxIterations ?? opts.maxRetries ?? defaultIterations ?? DEFAULT_MAX_ITERATIONS;
  const maxIterations = Math.min(requested, MAX_ITERATIONS_LIMIT);

  return {
    phase: 'analyze',
    inputType: input.type,
    input: input.content,
    imageMimeType: input.imageMimeType,
    analysis: null,
    plan: null,
    code: null,
    html: null,
    validation: null,
    parseError: null,
    error: null,
    iteration: 0,
    maxIterations,
    startTime: Date.now(),
    messages: [],
  };
}
