import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Options as SdkOptions, Query as SdkQuery } from '@anthropic-ai/claude-agent-sdk';
import { createSdkProvider } from './sdk.js';
import { createWorkspace, type Workspace } from '../files/index.js';
import type { AgentRequestContext } from '../server/app.js';

// Minimal Query stub: an async generator with the control-method shape the
// SDK exposes. We don't exercise those methods here — the provider only uses
// the AsyncIterable protocol — so they're stubbed for type compatibility.
function makeQuery(events: unknown[], opts: { throws?: unknown } = {}): SdkQuery {
  async function* gen(): AsyncGenerator<unknown, void> {
    for (const e of events) yield e;
    if (opts.throws) throw opts.throws;
  }
  const iter = gen();
  return Object.assign(iter, {
    interrupt: () => Promise.resolve(),
    setPermissionMode: () => Promise.resolve(),
    setModel: () => Promise.resolve(),
    setMaxThinkingTokens: () => Promise.resolve(),
    mergeSettings: () => Promise.resolve(),
    supportedCommands: () => Promise.resolve([]),
    supportedModels: () => Promise.resolve([]),
  }) as unknown as SdkQuery;
}

function makeCtx(
  partial: Partial<AgentRequestContext> = {},
): AgentRequestContext & { abort: () => void } {
  const controller = new AbortController();
  return {
    signal: controller.signal,
    permissionMode: 'acceptEdits',
    ...partial,
    abort: () => controller.abort(),
  } as AgentRequestContext & { abort: () => void };
}

async function collect<T>(iter: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const v of iter) out.push(v);
  return out;
}

describe('createSdkProvider', () => {
  it('translates SDK messages into the ACP envelope wire format', async () => {
    const messages = [
      // System init carries no user-visible content; drops.
      { type: 'system', subtype: 'init' },
      // Assistant text → agent_message_chunk envelope.
      {
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'hi' }] },
      },
      // Terminal result → acp.result.
      { type: 'result', subtype: 'success', stop_reason: 'end_turn', result: 'OK' },
    ];
    const query = vi.fn(() => makeQuery(messages));
    const provider = createSdkProvider({ query });

    const out = await collect(provider({ prompt: 'p' }, makeCtx()));
    expect(out).toEqual([
      {
        type: 'acp.session_update',
        update: {
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text: 'hi' },
        },
      },
      { type: 'acp.result', stopReason: 'end_turn' },
    ]);
    expect(query).toHaveBeenCalledOnce();
  });

  it('passes prompt, permissionMode and an AbortController to the SDK', async () => {
    let seen: { prompt: string; options?: SdkOptions } | undefined;
    const query = vi.fn((params: { prompt: string; options?: SdkOptions }) => {
      seen = params;
      return makeQuery([{ type: 'result' }]);
    });
    const provider = createSdkProvider({ query });

    await collect(provider({ prompt: 'hello' }, makeCtx({ permissionMode: 'plan' })));

    expect(seen?.prompt).toBe('hello');
    expect(seen?.options?.permissionMode).toBe('plan');
    expect(seen?.options?.abortController).toBeInstanceOf(AbortController);
  });

  it("sets allowDangerouslySkipPermissions when permissionMode is 'bypassPermissions'", async () => {
    let seen: SdkOptions | undefined;
    const query = vi.fn((params: { prompt: string; options?: SdkOptions }) => {
      seen = params.options;
      return makeQuery([{ type: 'result' }]);
    });
    const provider = createSdkProvider({ query });

    await collect(provider({ prompt: 'p' }, makeCtx({ permissionMode: 'bypassPermissions' })));

    expect(seen?.permissionMode).toBe('bypassPermissions');
    expect(seen?.allowDangerouslySkipPermissions).toBe(true);
  });

  it('does NOT set allowDangerouslySkipPermissions for non-bypass modes', async () => {
    let seen: SdkOptions | undefined;
    const query = vi.fn((params: { prompt: string; options?: SdkOptions }) => {
      seen = params.options;
      return makeQuery([{ type: 'result' }]);
    });
    const provider = createSdkProvider({ query });

    await collect(provider({ prompt: 'p' }, makeCtx({ permissionMode: 'acceptEdits' })));

    expect(seen?.allowDangerouslySkipPermissions).toBeUndefined();
  });

  it('forwards the workspace root as cwd when a workspace is supplied', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'sdk-provider-ws-'));
    let workspace: Workspace | undefined;
    try {
      workspace = createWorkspace(tmp);
      let seen: SdkOptions | undefined;
      const query = vi.fn((params: { prompt: string; options?: SdkOptions }) => {
        seen = params.options;
        return makeQuery([{ type: 'result' }]);
      });
      const provider = createSdkProvider({ query });
      await collect(provider({ prompt: 'p' }, makeCtx({ workspace })));
      expect(seen?.cwd).toBe(workspace.root);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('omits cwd when no workspace is configured', async () => {
    let seen: SdkOptions | undefined;
    const query = vi.fn((params: { prompt: string; options?: SdkOptions }) => {
      seen = params.options;
      return makeQuery([{ type: 'result' }]);
    });
    const provider = createSdkProvider({ query });
    await collect(provider({ prompt: 'p' }, makeCtx()));
    expect(seen?.cwd).toBeUndefined();
  });

  it('forwards pathToClaudeCodeExecutable when configured', async () => {
    let seen: SdkOptions | undefined;
    const query = vi.fn((params: { prompt: string; options?: SdkOptions }) => {
      seen = params.options;
      return makeQuery([{ type: 'result' }]);
    });
    const provider = createSdkProvider({
      query,
      pathToClaudeCodeExecutable: '/opt/bin/claude',
    });
    await collect(provider({ prompt: 'p' }, makeCtx()));
    expect(seen?.pathToClaudeCodeExecutable).toBe('/opt/bin/claude');
  });

  it('aborts the SDK abortController when the request signal aborts', async () => {
    let capturedController: AbortController | undefined;
    const query = vi.fn((params: { prompt: string; options?: SdkOptions }) => {
      capturedController = params.options?.abortController;
      // Long-running stub that yields one translatable event (so the
      // provider's first envelope reaches the consumer) then waits — we
      // need the provider alive when ctx.abort() fires so the listener
      // forwards the signal to the captured controller.
      async function* gen(): AsyncGenerator<unknown, void> {
        yield {
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'first' }] },
        };
        await new Promise((r) => setTimeout(r, 50));
      }
      const iter = gen();
      return Object.assign(iter, {
        interrupt: () => Promise.resolve(),
        setPermissionMode: () => Promise.resolve(),
        setModel: () => Promise.resolve(),
        setMaxThinkingTokens: () => Promise.resolve(),
        mergeSettings: () => Promise.resolve(),
        supportedCommands: () => Promise.resolve([]),
        supportedModels: () => Promise.resolve([]),
      }) as unknown as SdkQuery;
    });
    const provider = createSdkProvider({ query });
    const ctx = makeCtx();

    const iter = provider({ prompt: 'p' }, ctx)[Symbol.asyncIterator]();
    await iter.next(); // pull one envelope
    ctx.abort();
    await iter.next().catch(() => undefined);

    expect(capturedController?.signal.aborted).toBe(true);
  });

  it('emits an acp.error envelope when query() throws synchronously', async () => {
    const query = vi.fn(() => {
      throw new Error('boom');
    });
    const provider = createSdkProvider({ query });
    const out = await collect(provider({ prompt: 'p' }, makeCtx()));
    expect(out).toEqual([{ type: 'acp.error', error: { name: 'Error', message: 'boom' } }]);
  });

  it('emits an acp.error envelope when the stream throws mid-iteration', async () => {
    // The leading `system` message is translated into [] (no user-visible
    // content), so only the post-throw error envelope reaches the wire.
    const query = vi.fn(() => makeQuery([{ type: 'system' }], { throws: new Error('rate limit') }));
    const provider = createSdkProvider({ query });
    const out = await collect(provider({ prompt: 'p' }, makeCtx()));
    expect(out).toEqual([{ type: 'acp.error', error: { name: 'Error', message: 'rate limit' } }]);
  });
});
