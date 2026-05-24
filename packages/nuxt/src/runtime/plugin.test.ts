import { describe, expect, it, vi, beforeEach } from 'vitest';

const mountMock = vi.hoisted(() => vi.fn());

vi.mock('@agent-devtools/vue', () => ({
  mountAgentDevtoolsVue: mountMock,
}));

(globalThis as unknown as { defineNuxtPlugin: (fn: unknown) => unknown }).defineNuxtPlugin = (
  fn: unknown,
) => fn;

describe('runtime/plugin', () => {
  beforeEach(() => {
    mountMock.mockReset();
    vi.resetModules();
  });

  it('mounts the Vue adapter when a document is available', async () => {
    const plugin = (await import('./plugin.js')).default as () => void;
    plugin();
    expect(mountMock).toHaveBeenCalledTimes(1);
  });

  it('skips mounting when document is undefined (SSR pass)', async () => {
    const originalDocument = globalThis.document;
    Reflect.deleteProperty(globalThis, 'document');
    try {
      const plugin = (await import('./plugin.js')).default as () => void;
      plugin();
      expect(mountMock).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(globalThis, 'document', {
        value: originalDocument,
        writable: true,
        configurable: true,
      });
    }
  });
});
