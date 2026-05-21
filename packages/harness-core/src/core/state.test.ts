import { describe, it, expect } from 'vitest';
import { createLoopState } from './state.js';

describe('createLoopState', () => {
  const baseInput = { type: 'text' as const, content: 'hello' };

  it('initialises generation slots as null', () => {
    const state = createLoopState(baseInput);
    expect(state.analysis).toBeNull();
    expect(state.plan).toBeNull();
    expect(state.code).toBeNull();
    expect(state.html).toBeNull();
    expect(state.validation).toBeNull();
    expect(state.parseError).toBeNull();
    expect(state.error).toBeNull();
  });

  it('starts in the analyze phase with iteration 0', () => {
    const state = createLoopState(baseInput);
    expect(state.phase).toBe('analyze');
    expect(state.iteration).toBe(0);
    expect(state.messages).toEqual([]);
  });

  it('honours the explicit maxIterations option', () => {
    const state = createLoopState({ ...baseInput, options: { maxIterations: 7 } });
    expect(state.maxIterations).toBe(7);
  });

  it('falls back to defaultIterations when no option is given', () => {
    const state = createLoopState(baseInput, 5);
    expect(state.maxIterations).toBe(5);
  });

  it('falls back to the deprecated maxRetries when maxIterations is absent', () => {
    const state = createLoopState({ ...baseInput, options: { maxRetries: 4 } });
    expect(state.maxIterations).toBe(4);
  });

  it('caps iterations at the internal limit', () => {
    const state = createLoopState({ ...baseInput, options: { maxIterations: 999 } });
    expect(state.maxIterations).toBe(20);
  });

  it('preserves image input metadata', () => {
    const state = createLoopState({
      type: 'image',
      content: 'base64data',
      imageMimeType: 'image/png',
    });
    expect(state.inputType).toBe('image');
    expect(state.input).toBe('base64data');
    expect(state.imageMimeType).toBe('image/png');
  });
});
