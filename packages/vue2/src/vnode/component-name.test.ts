import { describe, expect, it } from 'vitest';
import { resolveComponentName } from './component-name.js';
import type { Vue2ComponentInstance, Vue2ComponentOptions } from './types.js';

function instance(opts: Vue2ComponentOptions | undefined): Vue2ComponentInstance {
  const base: { _uid: number; $parent: null; $options?: Vue2ComponentOptions } = {
    _uid: 1,
    $parent: null,
  };
  if (opts !== undefined) base.$options = opts;
  return base as Vue2ComponentInstance;
}

describe('resolveComponentName', () => {
  it('returns "Unknown" for null / undefined', () => {
    expect(resolveComponentName(null)).toBe('Unknown');
    expect(resolveComponentName(undefined)).toBe('Unknown');
  });

  it('returns "Unknown" when $options is missing', () => {
    expect(resolveComponentName(instance(undefined))).toBe('Unknown');
  });

  it('prefers explicit name option', () => {
    expect(resolveComponentName(instance({ name: 'Demo', __name: 'Other' }))).toBe('Demo');
  });

  it('falls back to __name when name is absent', () => {
    expect(resolveComponentName(instance({ __name: 'SfcName' }))).toBe('SfcName');
  });

  it('falls back to displayName when name and __name are absent', () => {
    expect(resolveComponentName(instance({ displayName: 'Display' }))).toBe('Display');
  });

  it('falls back to _componentTag when name family is absent', () => {
    expect(resolveComponentName(instance({ _componentTag: 'my-widget' }))).toBe('my-widget');
  });

  it('falls back to __file basename without .vue extension', () => {
    expect(resolveComponentName(instance({ __file: '/abs/path/Counter.vue' }))).toBe('Counter');
  });

  it('handles backslash-separated __file paths', () => {
    expect(resolveComponentName(instance({ __file: 'C:\\app\\Header.vue' }))).toBe('Header');
  });
});
