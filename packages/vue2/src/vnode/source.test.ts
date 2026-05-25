import { describe, expect, it } from 'vitest';
import { resolveInstanceSource } from './source.js';
import type { Vue2ComponentInstance, Vue2ComponentOptions } from './types.js';

function instance(opts: Vue2ComponentOptions | undefined): Vue2ComponentInstance {
  const base: { _uid: number; $parent: null; $options?: Vue2ComponentOptions } = {
    _uid: 1,
    $parent: null,
  };
  if (opts !== undefined) base.$options = opts;
  return base as Vue2ComponentInstance;
}

describe('resolveInstanceSource', () => {
  it('returns undefined when instance is null', () => {
    expect(resolveInstanceSource(null)).toBeUndefined();
    expect(resolveInstanceSource(undefined)).toBeUndefined();
  });

  it('returns undefined when $options is missing', () => {
    expect(resolveInstanceSource(instance(undefined))).toBeUndefined();
  });

  it('returns undefined when __file is absent', () => {
    expect(resolveInstanceSource(instance({ name: 'NoFile' }))).toBeUndefined();
  });

  it('extracts an absolute __file as-is', () => {
    const src = resolveInstanceSource(instance({ __file: '/abs/path/App.vue' }));
    expect(src).toEqual({ fileName: '/abs/path/App.vue', lineNumber: 1 });
  });

  it('strips http(s) origin and cache-busting query', () => {
    const src = resolveInstanceSource(
      instance({ __file: 'http://localhost:5173/src/App.vue?t=1234567' }),
    );
    expect(src).toEqual({ fileName: 'src/App.vue', lineNumber: 1 });
  });

  it('extracts the path from file:// URLs', () => {
    const src = resolveInstanceSource(instance({ __file: 'file:///abs/path/App.vue' }));
    expect(src).toEqual({ fileName: '/abs/path/App.vue', lineNumber: 1 });
  });

  it('handles @fs/ Vite prefix as absolute', () => {
    const src = resolveInstanceSource(
      instance({ __file: 'http://localhost:5173/@fs/abs/path/App.vue' }),
    );
    expect(src).toEqual({ fileName: '/abs/path/App.vue', lineNumber: 1 });
  });

  it('strips ?query / #hash from bare paths', () => {
    const src = resolveInstanceSource(instance({ __file: 'src/App.vue?t=1' }));
    expect(src).toEqual({ fileName: 'src/App.vue', lineNumber: 1 });
  });
});
