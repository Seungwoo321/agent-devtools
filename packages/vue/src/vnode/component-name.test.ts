import { describe, expect, it } from 'vitest';
import { resolveComponentName } from './component-name.js';
import type { ComponentInstanceLike } from './types.js';

function instance(type: unknown): ComponentInstanceLike {
  const base: { uid: number; parent: null; type?: ComponentInstanceLike['type'] } = {
    uid: 1,
    parent: null,
  };
  if (type !== undefined && type !== null) {
    base.type = type as ComponentInstanceLike['type'];
  }
  return base as ComponentInstanceLike;
}

describe('resolveComponentName', () => {
  it('returns "Unknown" for null / undefined', () => {
    expect(resolveComponentName(null)).toBe('Unknown');
    expect(resolveComponentName(undefined)).toBe('Unknown');
  });

  it('returns "Unknown" when type is missing', () => {
    expect(resolveComponentName(instance(null))).toBe('Unknown');
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

  it('falls back to __file basename without .vue extension', () => {
    expect(resolveComponentName(instance({ __file: '/abs/path/Counter.vue' }))).toBe('Counter');
  });

  it('handles backslash-separated __file paths', () => {
    expect(resolveComponentName(instance({ __file: 'C:\\app\\Header.vue' }))).toBe('Header');
  });

  it('uses function.name for setup functions', () => {
    function CustomButton(): null {
      return null;
    }
    expect(resolveComponentName(instance(CustomButton))).toBe('CustomButton');
  });

  it('returns "Unknown" for anonymous functions', () => {
    const anon = (): null => null;
    Object.defineProperty(anon, 'name', { value: '' });
    expect(resolveComponentName(instance(anon))).toBe('Unknown');
  });
});
