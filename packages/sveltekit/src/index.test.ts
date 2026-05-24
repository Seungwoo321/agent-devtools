import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mountAgentDevtoolsSvelteKit } from './index.js';

const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
});

describe('mountAgentDevtoolsSvelteKit', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('throws when NODE_ENV is production', () => {
    process.env.NODE_ENV = 'production';
    expect(() => mountAgentDevtoolsSvelteKit()).toThrow(/must not run in production/);
  });

  it('mounts a closed shadow widget in development', () => {
    process.env.NODE_ENV = 'development';
    const handle = mountAgentDevtoolsSvelteKit();
    expect(handle).toBeDefined();
    expect(typeof handle.destroy).toBe('function');
    handle.destroy();
  });
});
