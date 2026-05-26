import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mountSpy = vi.fn();
const transportSpy = vi.fn((args: unknown) => ({ kind: 'transport', args }));

vi.mock('@agent-devtools/react', () => ({
  mountAgentDevtools: (options: unknown) => mountSpy(options),
  createDefaultTransport: (args: unknown) => transportSpy(args),
}));

describe('bootstrapAgentDevtools', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.resetModules();
    mountSpy.mockReset();
    transportSpy.mockClear();
    delete process.env.AGENT_DEVTOOLS_NEXT_ENABLED;
    delete process.env.AGENT_DEVTOOLS_NEXT_BASE_URL;
    delete process.env.AGENT_DEVTOOLS_NEXT_PAIRING_TOKEN;
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('mounts the widget when the env flag, base URL, and token are present in dev', async () => {
    process.env.NODE_ENV = 'development';
    process.env.AGENT_DEVTOOLS_NEXT_ENABLED = 'true';
    process.env.AGENT_DEVTOOLS_NEXT_BASE_URL = 'http://127.0.0.1:4317';
    process.env.AGENT_DEVTOOLS_NEXT_PAIRING_TOKEN = 'tok-1';

    const { bootstrapAgentDevtools } = await import('./bootstrap.js');
    bootstrapAgentDevtools();

    expect(transportSpy).toHaveBeenCalledWith({
      baseUrl: 'http://127.0.0.1:4317',
      pairingToken: 'tok-1',
    });
    expect(mountSpy).toHaveBeenCalledTimes(1);
    const mountArgs = mountSpy.mock.calls[0]?.[0] as
      | { resolveRouteFile?: (pathname: string) => string | undefined }
      | undefined;
    expect(typeof mountArgs?.resolveRouteFile).toBe('function');
    expect(mountArgs?.resolveRouteFile?.('/dashboard')).toBe('app/dashboard/page.tsx');
  });

  it('skips mounting in production even when the env flag is set', async () => {
    process.env.NODE_ENV = 'production';
    process.env.AGENT_DEVTOOLS_NEXT_ENABLED = 'true';
    process.env.AGENT_DEVTOOLS_NEXT_BASE_URL = 'http://127.0.0.1:4317';
    process.env.AGENT_DEVTOOLS_NEXT_PAIRING_TOKEN = 'tok-1';

    const { bootstrapAgentDevtools } = await import('./bootstrap.js');
    bootstrapAgentDevtools();

    expect(mountSpy).not.toHaveBeenCalled();
  });

  it('skips mounting when the enabled flag is missing', async () => {
    process.env.NODE_ENV = 'development';
    process.env.AGENT_DEVTOOLS_NEXT_BASE_URL = 'http://127.0.0.1:4317';
    process.env.AGENT_DEVTOOLS_NEXT_PAIRING_TOKEN = 'tok-1';

    const { bootstrapAgentDevtools } = await import('./bootstrap.js');
    bootstrapAgentDevtools();

    expect(mountSpy).not.toHaveBeenCalled();
  });

  it('skips mounting when neither option nor env provides a base URL', async () => {
    process.env.NODE_ENV = 'development';
    process.env.AGENT_DEVTOOLS_NEXT_ENABLED = 'true';
    process.env.AGENT_DEVTOOLS_NEXT_PAIRING_TOKEN = 'tok-1';

    const { bootstrapAgentDevtools } = await import('./bootstrap.js');
    bootstrapAgentDevtools();

    expect(mountSpy).not.toHaveBeenCalled();
  });

  it('prefers caller-provided overrides over env variables', async () => {
    process.env.NODE_ENV = 'development';
    process.env.AGENT_DEVTOOLS_NEXT_ENABLED = 'true';
    process.env.AGENT_DEVTOOLS_NEXT_BASE_URL = 'http://127.0.0.1:4317';
    process.env.AGENT_DEVTOOLS_NEXT_PAIRING_TOKEN = 'env-token';

    const { bootstrapAgentDevtools } = await import('./bootstrap.js');
    bootstrapAgentDevtools({
      baseUrl: 'http://127.0.0.1:9999',
      pairingToken: 'caller-token',
    });

    expect(transportSpy).toHaveBeenCalledWith({
      baseUrl: 'http://127.0.0.1:9999',
      pairingToken: 'caller-token',
    });
  });

  it('is idempotent across repeated calls in the same client session', async () => {
    process.env.NODE_ENV = 'development';
    process.env.AGENT_DEVTOOLS_NEXT_ENABLED = 'true';
    process.env.AGENT_DEVTOOLS_NEXT_BASE_URL = 'http://127.0.0.1:4317';
    process.env.AGENT_DEVTOOLS_NEXT_PAIRING_TOKEN = 'tok-1';

    const { bootstrapAgentDevtools } = await import('./bootstrap.js');
    bootstrapAgentDevtools();
    bootstrapAgentDevtools();
    bootstrapAgentDevtools();

    expect(mountSpy).toHaveBeenCalledTimes(1);
  });
});
