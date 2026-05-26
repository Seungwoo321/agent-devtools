import { describe, expect, it, vi } from 'vitest';

const mountSpy = vi.fn();

vi.mock('@agent-devtools/vue2', () => ({
  mountAgentDevtoolsVue2: (opts: unknown) => mountSpy(opts),
}));

import plugin, { resolveNuxt2RouteFile } from './plugin.js';

describe('nuxt2 client plugin', () => {
  it('mounts the widget when document is available', () => {
    mountSpy.mockClear();
    plugin();
    expect(mountSpy).toHaveBeenCalledTimes(1);
    const opts = mountSpy.mock.calls[0]?.[0] as
      | { resolveRouteFile?: (pathname: string) => string | undefined }
      | undefined;
    expect(typeof opts?.resolveRouteFile).toBe('function');
  });

  it('short-circuits when document is undefined (SSR runs)', () => {
    mountSpy.mockClear();
    const originalDocument = globalThis.document;
    // @ts-expect-error simulate Nuxt 2 SSR environment by removing document
    delete globalThis.document;
    try {
      plugin();
      expect(mountSpy).not.toHaveBeenCalled();
    } finally {
      globalThis.document = originalDocument;
    }
  });
});

describe('resolveNuxt2RouteFile', () => {
  it('maps the root path to pages/index.vue', () => {
    expect(resolveNuxt2RouteFile('/')).toBe('pages/index.vue');
  });

  it('maps the empty string to pages/index.vue as a defensive default', () => {
    expect(resolveNuxt2RouteFile('')).toBe('pages/index.vue');
  });

  it('maps a static one-segment path to pages/<segment>.vue', () => {
    expect(resolveNuxt2RouteFile('/about')).toBe('pages/about.vue');
  });

  it('maps a nested path to the matching pages/*.vue file', () => {
    expect(resolveNuxt2RouteFile('/blog/hello')).toBe('pages/blog/hello.vue');
  });

  it('preserves dynamic-looking segments without inferring underscores', () => {
    // Nuxt 2 dynamic routes use `_slug.vue` directory metadata that the
    // runtime URL does not carry; we emit the materialised path and let
    // the agent grep `pages/**` when the file is parameterised.
    expect(resolveNuxt2RouteFile('/posts/123')).toBe('pages/posts/123.vue');
  });

  it('trims a trailing slash before joining the extension', () => {
    expect(resolveNuxt2RouteFile('/settings/')).toBe('pages/settings.vue');
  });

  it('returns undefined when the input is not a string', () => {
    expect(resolveNuxt2RouteFile(42 as unknown as string)).toBeUndefined();
  });
});
