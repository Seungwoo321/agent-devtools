import { afterEach, describe, expect, it } from 'vitest';
import { createAgentDevtoolsHandle } from './hooks.js';

const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
});

function makeEvent(): { request: Request; url: URL } {
  return { request: new Request('http://localhost/'), url: new URL('http://localhost/') };
}

describe('createAgentDevtoolsHandle', () => {
  it('passes through in production via the no-op branch', async () => {
    process.env.NODE_ENV = 'production';
    const handle = createAgentDevtoolsHandle();
    const event = makeEvent();
    const response = new Response('ok');
    const result = await handle({ event, resolve: async () => response });
    expect(result).toBe(response);
  });

  it('passes through in development', async () => {
    process.env.NODE_ENV = 'development';
    const handle = createAgentDevtoolsHandle();
    const event = makeEvent();
    const response = new Response('dev');
    const result = await handle({ event, resolve: async () => response });
    expect(result).toBe(response);
  });

  it('respects explicit enabled override', async () => {
    process.env.NODE_ENV = 'production';
    const handle = createAgentDevtoolsHandle({ enabled: true });
    const event = makeEvent();
    const response = new Response('forced');
    const result = await handle({ event, resolve: async () => response });
    expect(result).toBe(response);
  });
});
