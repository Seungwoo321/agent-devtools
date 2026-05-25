import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withAgentDevtools } from './config.js';

type AliasMap = Record<string, string | false | string[]>;
type WebpackConfig = { resolve?: { alias?: AliasMap } };
type WebpackCtx = { dev: boolean; isServer: boolean };
type ConfigWithWebpack = {
  webpack: (config: WebpackConfig, ctx: WebpackCtx) => WebpackConfig;
};

const STRIPPED_MODULES = [
  '@agent-devtools/react',
  '@agent-devtools/core',
  '@agent-devtools/harness-core',
];

describe('withAgentDevtools', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('omits env injection in production but always installs the webpack alias', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const result = withAgentDevtools(
      { reactStrictMode: true, env: { EXISTING: 'value' } },
      { baseUrl: 'http://127.0.0.1:4317', pairingToken: 'tok' },
    ) as unknown as ConfigWithWebpack & Record<string, unknown>;
    expect(result.env).toEqual({ EXISTING: 'value' });
    expect(typeof result.webpack).toBe('function');
    expect(result.reactStrictMode).toBe(true);
  });

  it('omits env injection when explicitly disabled but still installs the alias', () => {
    vi.stubEnv('NODE_ENV', 'development');
    const result = withAgentDevtools(
      { reactStrictMode: true },
      { enabled: false },
    ) as unknown as ConfigWithWebpack & Record<string, unknown>;
    expect(result.env).toBeUndefined();
    expect(typeof result.webpack).toBe('function');
  });

  it('adds the enabled env flag in development', () => {
    vi.stubEnv('NODE_ENV', 'development');
    const result = withAgentDevtools({ reactStrictMode: true }) as Record<string, unknown>;
    expect(result.env).toMatchObject({ AGENT_DEVTOOLS_NEXT_PAGES_ENABLED: 'true' });
    expect(result.reactStrictMode).toBe(true);
  });

  it('propagates baseUrl and pairingToken into env', () => {
    vi.stubEnv('NODE_ENV', 'development');
    const result = withAgentDevtools(
      {},
      { baseUrl: 'http://127.0.0.1:4317', pairingToken: 'tok-abc' },
    ) as Record<string, unknown>;
    expect(result.env).toMatchObject({
      AGENT_DEVTOOLS_NEXT_PAGES_ENABLED: 'true',
      AGENT_DEVTOOLS_NEXT_PAGES_BASE_URL: 'http://127.0.0.1:4317',
      AGENT_DEVTOOLS_NEXT_PAGES_PAIRING_TOKEN: 'tok-abc',
    });
  });

  it('preserves pre-existing env entries when merging', () => {
    vi.stubEnv('NODE_ENV', 'development');
    const result = withAgentDevtools({ env: { EXISTING_KEY: 'keep-me' } }) as Record<
      string,
      unknown
    >;
    expect(result.env).toMatchObject({
      EXISTING_KEY: 'keep-me',
      AGENT_DEVTOOLS_NEXT_PAGES_ENABLED: 'true',
    });
  });

  it('ignores non-string env values from the input config', () => {
    vi.stubEnv('NODE_ENV', 'development');
    const result = withAgentDevtools({
      env: { GOOD: 'yes', BAD: 42 as unknown as string },
    }) as { env: Record<string, string> };
    expect(result.env).toMatchObject({ GOOD: 'yes', AGENT_DEVTOOLS_NEXT_PAGES_ENABLED: 'true' });
    expect(result.env.BAD).toBeUndefined();
  });

  it('webpack alias maps every widget chain module to false when ctx.dev is false', () => {
    vi.stubEnv('NODE_ENV', 'development');
    const result = withAgentDevtools({}) as unknown as ConfigWithWebpack;
    const input: WebpackConfig = {};
    const output = result.webpack(input, { dev: false, isServer: false });
    const alias = output.resolve?.alias as AliasMap;
    for (const mod of STRIPPED_MODULES) {
      expect(alias[mod]).toBe(false);
    }
  });

  it('webpack alias is skipped when ctx.dev is true so the widget loads in dev', () => {
    vi.stubEnv('NODE_ENV', 'development');
    const result = withAgentDevtools({}) as unknown as ConfigWithWebpack;
    const input: WebpackConfig = {};
    const output = result.webpack(input, { dev: true, isServer: false });
    expect(output.resolve?.alias).toBeUndefined();
  });

  it('composes with a pre-existing webpack function rather than replacing it', () => {
    vi.stubEnv('NODE_ENV', 'development');
    const userWebpack = vi.fn((config: WebpackConfig) => ({
      ...config,
      resolve: { alias: { 'user-only-key': '/abs/user-only' } as AliasMap },
    }));
    const result = withAgentDevtools({ webpack: userWebpack }) as unknown as ConfigWithWebpack;
    const output = result.webpack({}, { dev: false, isServer: false });
    expect(userWebpack).toHaveBeenCalledTimes(1);
    const alias = output.resolve?.alias as AliasMap;
    expect(alias['user-only-key']).toBe('/abs/user-only');
    expect(alias['@agent-devtools/react']).toBe(false);
  });
});
