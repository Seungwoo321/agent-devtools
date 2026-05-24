import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mountAgentDevtoolsAngular } from './mount.js';

const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
});

describe('mountAgentDevtoolsAngular', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('throws when NODE_ENV is production', () => {
    process.env.NODE_ENV = 'production';
    expect(() => mountAgentDevtoolsAngular()).toThrow(/must not run in production/);
  });

  it('mounts a closed shadow widget in development', () => {
    process.env.NODE_ENV = 'development';
    const handle = mountAgentDevtoolsAngular();
    expect(handle).toBeDefined();
    expect(typeof handle.destroy).toBe('function');
    handle.destroy();
  });
});
