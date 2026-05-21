import { describe, it, expect } from 'vitest';
import { formatError, formatErrorWithPrefix, classifyStreamError } from './errors.js';
import { ProviderInputError } from '../llm/errors.js';

describe('formatError', () => {
  it('returns the message of an Error instance', () => {
    expect(formatError(new Error('boom'))).toBe('boom');
  });

  it('returns "Unknown error" for non-Error values', () => {
    expect(formatError('boom')).toBe('Unknown error');
    expect(formatError(undefined)).toBe('Unknown error');
    expect(formatError(null)).toBe('Unknown error');
    expect(formatError({ message: 'x' })).toBe('Unknown error');
  });
});

describe('formatErrorWithPrefix', () => {
  it('joins prefix and Error message with a colon', () => {
    expect(formatErrorWithPrefix('Analysis failed', new Error('bad input'))).toBe(
      'Analysis failed: bad input',
    );
  });

  it('falls back to "Unknown error" when input is not an Error', () => {
    expect(formatErrorWithPrefix('Stage', 'oops')).toBe('Stage: Unknown error');
  });
});

describe('classifyStreamError', () => {
  it('returns INVALID_INPUT for ProviderInputError', () => {
    const err = new ProviderInputError('Groq rejected (404): unknown model', 404, 'Groq');
    expect(classifyStreamError(err)).toBe('INVALID_INPUT');
  });

  it('returns LLM_ERROR for plain Errors (rate limit, 5xx, etc.)', () => {
    expect(classifyStreamError(new Error('Rate limited (429)'))).toBe('LLM_ERROR');
    expect(classifyStreamError(new Error('Cerebras API error 503: bad gateway'))).toBe('LLM_ERROR');
  });

  it('returns LLM_ERROR for non-Error values', () => {
    expect(classifyStreamError('string')).toBe('LLM_ERROR');
    expect(classifyStreamError(undefined)).toBe('LLM_ERROR');
  });
});
