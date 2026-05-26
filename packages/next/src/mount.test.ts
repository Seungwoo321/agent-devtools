import { describe, expect, it, vi } from 'vitest';

const mountSpy = vi.fn((opts: unknown) => ({ destroy: vi.fn(), options: opts }));

vi.mock('@agent-devtools/react', () => ({
  mountAgentDevtools: (opts: unknown) => mountSpy(opts),
}));

import { mountAgentDevtoolsNext } from './mount.js';

describe('mountAgentDevtoolsNext', () => {
  it('forwards its options to mountAgentDevtools from @agent-devtools/react', () => {
    const options = { describePicked: () => ({}) as never };
    mountAgentDevtoolsNext(options);
    expect(mountSpy).toHaveBeenCalledWith({
      ...options,
      resolveRouteFile: expect.any(Function),
    });
  });

  it('uses an empty options object when no argument is passed', () => {
    mountSpy.mockClear();
    mountAgentDevtoolsNext();
    expect(mountSpy).toHaveBeenCalledWith({
      resolveRouteFile: expect.any(Function),
    });
  });

  it('threads the App Router pathname mapping as the default resolveRouteFile', () => {
    mountSpy.mockClear();
    mountAgentDevtoolsNext();
    const call = mountSpy.mock.calls[0]?.[0] as
      | { resolveRouteFile?: (pathname: string) => string | undefined }
      | undefined;
    expect(call?.resolveRouteFile?.('/about')).toBe('app/about/page.tsx');
    expect(call?.resolveRouteFile?.('/')).toBe('app/page.tsx');
  });

  it('lets a caller-provided resolveRouteFile take precedence', () => {
    mountSpy.mockClear();
    const custom = (): string => 'custom/route.tsx';
    mountAgentDevtoolsNext({ resolveRouteFile: custom });
    const call = mountSpy.mock.calls[0]?.[0] as
      | { resolveRouteFile?: () => string | undefined }
      | undefined;
    expect(call?.resolveRouteFile).toBe(custom);
  });
});
