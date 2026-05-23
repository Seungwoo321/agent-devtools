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
    expect(mountSpy).toHaveBeenCalledWith(options);
  });

  it('uses an empty options object when no argument is passed', () => {
    mountSpy.mockClear();
    mountAgentDevtoolsNext();
    expect(mountSpy).toHaveBeenCalledWith({});
  });
});
