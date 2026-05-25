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
    expect(mountSpy).toHaveBeenCalledWith(options);
  });

  it('uses an empty options object when no argument is passed', () => {
    vi.stubEnv('NODE_ENV', 'development');
    mountAgentDevtoolsNextPages();
    expect(mountSpy).toHaveBeenCalledWith({});
  });

  it('throws when invoked with NODE_ENV set to production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(() => mountAgentDevtoolsNextPages()).toThrow(/must not run in production/);
    expect(mountSpy).not.toHaveBeenCalled();
  });
});
