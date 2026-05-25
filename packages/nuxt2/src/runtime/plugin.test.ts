import { describe, expect, it, vi } from 'vitest';

const mountSpy = vi.fn();

vi.mock('@agent-devtools/vue2', () => ({
  mountAgentDevtoolsVue2: (opts: unknown) => mountSpy(opts),
}));

import plugin from './plugin.js';

describe('nuxt2 client plugin', () => {
  it('mounts the widget when document is available', () => {
    mountSpy.mockClear();
    plugin();
    expect(mountSpy).toHaveBeenCalledTimes(1);
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
