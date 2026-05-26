import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mountSpy = vi.fn((opts: unknown) => ({ destroy: vi.fn(), options: opts }));

vi.mock('@agent-devtools/react', () => ({
  mountAgentDevtools: (opts: unknown) => mountSpy(opts),
}));

import { mountAgentDevtoolsNextPages } from './mount.js';

describe('mountAgentDevtoolsNextPages', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    mountSpy.mockClear();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('forwards its options to mountAgentDevtools from @agent-devtools/react', () => {
    vi.stubEnv('NODE_ENV', 'development');
    const options = { describePicked: () => ({}) as never };
    mountAgentDevtoolsNextPages(options);
    expect(mountSpy).toHaveBeenCalledWith({
      ...options,
      resolveRouteFile: expect.any(Function),
    });
  });

  it('uses an empty options object when no argument is passed', () => {
    vi.stubEnv('NODE_ENV', 'development');
    mountAgentDevtoolsNextPages();
    expect(mountSpy).toHaveBeenCalledWith({
      resolveRouteFile: expect.any(Function),
    });
  });

  it("threads next-pages' resolveNextPagesRouteFile by default", () => {
    vi.stubEnv('NODE_ENV', 'development');
    type NextWindow = Window & { next?: { router?: { pathname?: string } } };
    (window as NextWindow).next = { router: { pathname: '/blog/[slug]' } };
    try {
      mountAgentDevtoolsNextPages();
      const call = mountSpy.mock.calls[0]?.[0] as
        | { resolveRouteFile?: () => string | undefined }
        | undefined;
      expect(call?.resolveRouteFile?.()).toBe('pages/blog/[slug]');
    } finally {
      delete (window as NextWindow).next;
    }
  });

  it('lets a caller-provided resolveRouteFile take precedence', () => {
    vi.stubEnv('NODE_ENV', 'development');
    const custom = (): string => 'custom/route.tsx';
    mountAgentDevtoolsNextPages({ resolveRouteFile: custom });
    const call = mountSpy.mock.calls[0]?.[0] as
      | { resolveRouteFile?: () => string | undefined }
      | undefined;
    expect(call?.resolveRouteFile).toBe(custom);
  });

  it('throws when invoked with NODE_ENV set to production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(() => mountAgentDevtoolsNextPages()).toThrow(/must not run in production/);
    expect(mountSpy).not.toHaveBeenCalled();
  });
});
