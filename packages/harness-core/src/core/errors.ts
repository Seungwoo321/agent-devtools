/**
 * Error Utilities
 *
 * Eliminates repeated error formatting patterns across the codebase.
 */

import { ProviderInputError } from '../llm/errors.js';
import type { StreamErrorCode } from './types.js';

/** Extract message from unknown error */
export function formatError(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

/** Format error with a contextual prefix */
export function formatErrorWithPrefix(prefix: string, error: unknown): string {
  return `${prefix}: ${formatError(error)}`;
}

/**
 * Classify a thrown error into a `StreamEvent.data.errorCode`. Strategies
 * use this in their catch blocks so the route doesn't have to parse
 * message strings to choose an HTTP status.
 *
 *   ProviderInputError → INVALID_INPUT (caller can fix the request)
 *   anything else      → LLM_ERROR    (auth, rate limit, 5xx, transient)
 *
 * Harness-side bugs that happen outside provider calls (e.g. domain
 * adapter throws) are still LLM_ERROR by default — bumping them to
 * INTERNAL_ERROR requires explicit classification at the call site.
 */
export function classifyStreamError(error: unknown): StreamErrorCode {
  if (error instanceof ProviderInputError) {
    return 'INVALID_INPUT';
  }
  return 'LLM_ERROR';
}
