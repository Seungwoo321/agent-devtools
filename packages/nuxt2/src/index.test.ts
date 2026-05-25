import { describe, expect, it, vi } from 'vitest';
import nuxt2Module, { setup, type Nuxt2ModuleContainer } from './index.js';

function makeContainer(dev: boolean): {
  container: Nuxt2ModuleContainer;
  addPlugin: ReturnType<typeof vi.fn>;
} {
  const addPlugin = vi.fn();
  const container: Nuxt2ModuleContainer = {
    options: { dev },
    addPlugin,
  };
  return { container, addPlugin };
}

describe('nuxt2 module setup', () => {
  it('returns without registering a plugin when nuxt.options.dev is false', () => {
    const { container, addPlugin } = makeContainer(false);
    setup.call(container, { enabled: true });
    expect(addPlugin).not.toHaveBeenCalled();
  });

  it('returns without registering a plugin when enabled is false', () => {
    const { container, addPlugin } = makeContainer(true);
    setup.call(container, { enabled: false });
    expect(addPlugin).not.toHaveBeenCalled();
  });

  it('registers a client-only plugin when dev is true and enabled is true', () => {
    const { container, addPlugin } = makeContainer(true);
    setup.call(container, { enabled: true });
    expect(addPlugin).toHaveBeenCalledTimes(1);
    const arg = addPlugin.mock.calls[0]![0] as {
      src: string;
      mode: string;
      fileName: string;
    };
    expect(arg.mode).toBe('client');
    expect(arg.fileName).toBe('agent-devtools.client.js');
    expect(arg.src).toMatch(/runtime\/plugin\.js$/);
  });
});

describe('nuxt2 module default export', () => {
  it('exposes the agent-devtools/nuxt2 meta name', () => {
    expect(nuxt2Module.meta.name).toBe('@agent-devtools/nuxt2');
  });

  it('invokes setup with the module options when called as a Nuxt 2 module function', () => {
    const { container, addPlugin } = makeContainer(true);
    nuxt2Module.call(container);
    expect(addPlugin).toHaveBeenCalledTimes(1);
  });

  it('respects an explicit enabled=false option', () => {
    const { container, addPlugin } = makeContainer(true);
    nuxt2Module.call(container, { enabled: false });
    expect(addPlugin).not.toHaveBeenCalled();
  });
});
