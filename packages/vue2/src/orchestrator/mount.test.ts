import { afterEach, describe, expect, it } from 'vitest';
import { mountAgentDevtoolsVue2 } from './mount.js';

describe('mountAgentDevtoolsVue2', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it('throws when NODE_ENV is production', () => {
    process.env.NODE_ENV = 'production';
    expect(() => mountAgentDevtoolsVue2()).toThrow(/must not run in production/);
  });
});
