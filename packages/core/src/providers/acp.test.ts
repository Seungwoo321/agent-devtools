import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAcpProvider, type AcpEvent, type AcpRuntime, type PermissionPolicy } from './acp.js';
import { createWorkspace, type Workspace } from '../files/index.js';
import type { AgentRequestContext, PermissionMode } from '../server/app.js';

function makeWorkspace(): Workspace {
  const dir = mkdtempSync(join(tmpdir(), 'acp-provider-'));
  return Object.assign(createWorkspace(dir), {
    [Symbol.dispose]: () => rmSync(dir, { recursive: true, force: true }),
  });
}

function makeCtx(
  partial: Partial<AgentRequestContext> = {},
): AgentRequestContext & { abort: () => void } {
  const controller = new AbortController();
  return {
    signal: controller.signal,
    permissionMode: 'acceptEdits' as PermissionMode,
    ...partial,
    abort: () => controller.abort(),
  } as AgentRequestContext & { abort: () => void };
}

function makeRuntime(events: AcpEvent[]): AcpRuntime {
  return {
    run: async function* run(): AsyncIterable<AcpEvent> {
      for (const e of events) yield e;
    },
  };
}

async function collect<T>(iter: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const v of iter) out.push(v);
  return out;
}

describe('createAcpProvider', () => {
  it('refuses to run without a workspace and surfaces a config error', async () => {
    const provider = createAcpProvider({ runtime: makeRuntime([]) });
    const out = await collect(provider({ prompt: 'p' }, makeCtx()));
    expect(out).toHaveLength(1);
    const [event] = out;
    expect((event as { type: string }).type).toBe('acp.error');
    expect((event as { error: { name: string } }).error.name).toBe('AcpConfigurationError');
  });

  it('translates a notification event into an acp.session_update domain event', async () => {
    const ws = makeWorkspace();
    try {
      const provider = createAcpProvider({
        runtime: makeRuntime([
          {
            kind: 'notification',
            sessionUpdate: {
              sessionUpdate: 'agent_message_chunk',
              content: { type: 'text', text: 'hi' },
            },
          },
        ]),
      });
      const out = await collect(provider({ prompt: 'p' }, makeCtx({ workspace: ws })));
      expect(out).toEqual([
        {
          type: 'acp.session_update',
          update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'hi' } },
        },
      ]);
    } finally {
      (ws as Workspace & { [Symbol.dispose]: () => void })[Symbol.dispose]();
    }
  });

  it('translates a result event with usage into acp.result', async () => {
    const ws = makeWorkspace();
    try {
      const provider = createAcpProvider({
        runtime: makeRuntime([
          {
            kind: 'result',
            stopReason: 'end_turn',
            usage: { inputTokens: 12, outputTokens: 7, totalTokens: 19 },
          },
        ]),
      });
      const out = await collect(provider({ prompt: 'p' }, makeCtx({ workspace: ws })));
      expect(out).toEqual([
        {
          type: 'acp.result',
          stopReason: 'end_turn',
          usage: { inputTokens: 12, outputTokens: 7, totalTokens: 19 },
        },
      ]);
    } finally {
      (ws as Workspace & { [Symbol.dispose]: () => void })[Symbol.dispose]();
    }
  });

  it('omits usage from acp.result when the runtime did not report it', async () => {
    const ws = makeWorkspace();
    try {
      const provider = createAcpProvider({
        runtime: makeRuntime([{ kind: 'result', stopReason: 'end_turn' }]),
      });
      const out = await collect(provider({ prompt: 'p' }, makeCtx({ workspace: ws })));
      expect(out).toEqual([{ type: 'acp.result', stopReason: 'end_turn' }]);
    } finally {
      (ws as Workspace & { [Symbol.dispose]: () => void })[Symbol.dispose]();
    }
  });

  it('translates a runtime error event into an acp.error envelope', async () => {
    const ws = makeWorkspace();
    try {
      const provider = createAcpProvider({
        runtime: makeRuntime([
          { kind: 'error', error: { name: 'TransportError', message: 'pipe broke' } },
        ]),
      });
      const out = await collect(provider({ prompt: 'p' }, makeCtx({ workspace: ws })));
      expect(out).toEqual([
        { type: 'acp.error', error: { name: 'TransportError', message: 'pipe broke' } },
      ]);
    } finally {
      (ws as Workspace & { [Symbol.dispose]: () => void })[Symbol.dispose]();
    }
  });

  it('forwards the resolved cwd, prompt, permissionMode, clientSessionId and signal to the runtime', async () => {
    const ws = makeWorkspace();
    try {
      const seen: Array<Record<string, unknown>> = [];
      const runtime: AcpRuntime = {
        run: async function* (params): AsyncIterable<AcpEvent> {
          seen.push({
            prompt: params.prompt,
            cwd: params.cwd,
            permissionMode: params.permissionMode,
            clientSessionId: params.clientSessionId,
            context: params.context,
            hasSignal: params.signal instanceof AbortSignal,
          });
          yield { kind: 'result', stopReason: 'end_turn' };
        },
      };
      const provider = createAcpProvider({ runtime });

      await collect(
        provider(
          {
            prompt: 'fix the button',
            clientSessionId: 'cs-from-widget',
            context: { picked: { tagName: 'BUTTON' } },
          },
          makeCtx({ workspace: ws, permissionMode: 'bypassPermissions' }),
        ),
      );
      expect(seen).toEqual([
        {
          prompt: 'fix the button',
          cwd: ws.root,
          permissionMode: 'bypassPermissions',
          clientSessionId: 'cs-from-widget',
          context: { picked: { tagName: 'BUTTON' } },
          hasSignal: true,
        },
      ]);
    } finally {
      (ws as Workspace & { [Symbol.dispose]: () => void })[Symbol.dispose]();
    }
  });

  it('mints a fallback clientSessionId when the request omits one', async () => {
    const ws = makeWorkspace();
    try {
      const seen: Array<string | undefined> = [];
      const runtime: AcpRuntime = {
        run: async function* (params): AsyncIterable<AcpEvent> {
          seen.push(params.clientSessionId);
          yield { kind: 'result', stopReason: 'end_turn' };
        },
      };
      const provider = createAcpProvider({
        runtime,
        generateSessionId: () => 'fallback-cs',
      });

      await collect(provider({ prompt: 'p' }, makeCtx({ workspace: ws })));
      expect(seen).toEqual(['fallback-cs']);
    } finally {
      (ws as Workspace & { [Symbol.dispose]: () => void })[Symbol.dispose]();
    }
  });

  it('omits context from runtime params when the request omits it', async () => {
    const ws = makeWorkspace();
    try {
      let seenContext: unknown = 'not-called';
      let contextWasInParams = true;
      const runtime: AcpRuntime = {
        run: async function* (params): AsyncIterable<AcpEvent> {
          seenContext = params.context;
          contextWasInParams = 'context' in params;
          yield { kind: 'result', stopReason: 'end_turn' };
        },
      };
      const provider = createAcpProvider({ runtime });
      await collect(provider({ prompt: 'p' }, makeCtx({ workspace: ws })));
      expect(seenContext).toBeUndefined();
      expect(contextWasInParams).toBe(false);
    } finally {
      (ws as Workspace & { [Symbol.dispose]: () => void })[Symbol.dispose]();
    }
  });

  it('forwards a context model to the runtime params', async () => {
    const ws = makeWorkspace();
    try {
      const seen: Array<string | undefined> = [];
      const runtime: AcpRuntime = {
        run: async function* (params): AsyncIterable<AcpEvent> {
          seen.push(params.model);
          yield { kind: 'result', stopReason: 'end_turn' };
        },
      };
      const provider = createAcpProvider({ runtime });
      await collect(provider({ prompt: 'p' }, makeCtx({ workspace: ws, model: 'opus' })));
      expect(seen).toEqual(['opus']);
    } finally {
      (ws as Workspace & { [Symbol.dispose]: () => void })[Symbol.dispose]();
    }
  });

  it('omits model from runtime params when the context carries none', async () => {
    const ws = makeWorkspace();
    try {
      let seenModel: unknown = 'not-called';
      let modelWasInParams = true;
      const runtime: AcpRuntime = {
        run: async function* (params): AsyncIterable<AcpEvent> {
          seenModel = params.model;
          modelWasInParams = 'model' in params;
          yield { kind: 'result', stopReason: 'end_turn' };
        },
      };
      const provider = createAcpProvider({ runtime });
      await collect(provider({ prompt: 'p' }, makeCtx({ workspace: ws })));
      expect(seenModel).toBeUndefined();
      expect(modelWasInParams).toBe(false);
    } finally {
      (ws as Workspace & { [Symbol.dispose]: () => void })[Symbol.dispose]();
    }
  });

  it('lets a request-scoped permissionPolicy override the provider default', async () => {
    const ws = makeWorkspace();
    try {
      const seen: Array<Partial<PermissionPolicy> | undefined> = [];
      const runtime: AcpRuntime = {
        run: async function* (params): AsyncIterable<AcpEvent> {
          seen.push(params.permissionPolicy);
          yield { kind: 'result', stopReason: 'end_turn' };
        },
      };
      const providerDefault: PermissionPolicy = {
        fileEdit: 'auto',
        bash: 'ask',
        webFetch: 'ask',
        mcpTool: 'ask',
      };
      const requestOverride: PermissionPolicy = {
        fileEdit: 'auto',
        bash: 'auto',
        webFetch: 'auto',
        mcpTool: 'auto',
      };
      const provider = createAcpProvider({ runtime, permissionPolicy: providerDefault });

      await collect(
        provider({ prompt: 'p' }, makeCtx({ workspace: ws, permissionPolicy: requestOverride })),
      );
      expect(seen).toEqual([requestOverride]);
    } finally {
      (ws as Workspace & { [Symbol.dispose]: () => void })[Symbol.dispose]();
    }
  });

  it('falls back to the provider default permissionPolicy when the request omits it', async () => {
    const ws = makeWorkspace();
    try {
      const seen: Array<Partial<PermissionPolicy> | undefined> = [];
      const runtime: AcpRuntime = {
        run: async function* (params): AsyncIterable<AcpEvent> {
          seen.push(params.permissionPolicy);
          yield { kind: 'result', stopReason: 'end_turn' };
        },
      };
      const providerDefault: PermissionPolicy = {
        fileEdit: 'auto',
        bash: 'deny',
        webFetch: 'deny',
        mcpTool: 'deny',
      };
      const provider = createAcpProvider({ runtime, permissionPolicy: providerDefault });

      await collect(provider({ prompt: 'p' }, makeCtx({ workspace: ws })));
      expect(seen).toEqual([providerDefault]);
    } finally {
      (ws as Workspace & { [Symbol.dispose]: () => void })[Symbol.dispose]();
    }
  });

  it('catches a synchronous runtime throw and surfaces it as an error event', async () => {
    const ws = makeWorkspace();
    try {
      const runtime: AcpRuntime = {
        run: function run(): AsyncIterable<AcpEvent> {
          // eslint-disable-next-line require-yield
          return (async function* () {
            throw new Error('spawn failed');
          })();
        },
      };
      const provider = createAcpProvider({ runtime });
      const out = await collect(provider({ prompt: 'p' }, makeCtx({ workspace: ws })));
      expect(out).toEqual([
        { type: 'acp.error', error: { name: 'Error', message: 'spawn failed' } },
      ]);
    } finally {
      (ws as Workspace & { [Symbol.dispose]: () => void })[Symbol.dispose]();
    }
  });
});
