import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  defineNuxtModule: vi.fn(),
  addPlugin: vi.fn(),
  createResolver: vi.fn(() => ({
    resolve: (s: string) => `/abs${s.startsWith('.') ? s.slice(1) : '/' + s}`,
  })),
}));

vi.mock('@nuxt/kit', () => ({
  defineNuxtModule: (mod: { setup: (options: unknown, nuxt: unknown) => unknown }) => {
    mocks.defineNuxtModule(mod);
    return mod;
  },
  addPlugin: mocks.addPlugin,
  createResolver: mocks.createResolver,
}));

describe('nuxt module setup', () => {
  it('returns immediately without registering a plugin when nuxt.options.dev is false', async () => {
    mocks.addPlugin.mockClear();
    const { setup } = await import('./index.js');
    setup({ enabled: true }, { options: { dev: false } });
    expect(mocks.addPlugin).not.toHaveBeenCalled();
  });

  it('returns immediately without registering a plugin when enabled is false', async () => {
    mocks.addPlugin.mockClear();
    const { setup } = await import('./index.js');
    setup({ enabled: false }, { options: { dev: true } });
    expect(mocks.addPlugin).not.toHaveBeenCalled();
  });

  it('registers a client-mode plugin when dev is true and enabled is true', async () => {
    mocks.addPlugin.mockClear();
    const { setup } = await import('./index.js');
    setup({ enabled: true }, { options: { dev: true } });
    expect(mocks.addPlugin).toHaveBeenCalledTimes(1);
    expect(mocks.addPlugin).toHaveBeenCalledWith(expect.objectContaining({ mode: 'client' }));
  });
});
