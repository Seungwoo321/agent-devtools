import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type {
  CanUseTool,
  Options as SdkOptions,
  PermissionResult,
  PermissionUpdate,
  Query as SdkQuery,
} from '@anthropic-ai/claude-agent-sdk';
import { createSdkProvider } from './sdk.js';
import type { PermissionPolicy } from './acp.js';
import { createWorkspace, type Workspace } from '../files/index.js';
import type { AgentRequestContext } from '../server/app.js';

// Minimal Query stub: an async generator with the control-method shape the
// SDK exposes. We don't exercise those methods here — the provider only uses
// the AsyncIterable protocol — so they're stubbed for type compatibility.
function makeQuery(
  events: unknown[],
  opts: { throws?: unknown; supportedCommands?: () => Promise<unknown> } = {},
): SdkQuery {
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
    supportedCommands: opts.supportedCommands ?? (() => Promise.resolve([])),
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
      // System init triggers the available_commands_update (empty here — the
      // default makeQuery stub resolves supportedCommands() to []).
      {
        type: 'acp.session_update',
        update: { sessionUpdate: 'available_commands_update', availableCommands: [] },
      },
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

  describe('available_commands_update', () => {
    function commandEnvelopes(out: unknown[]): unknown[] {
      return out.filter(
        (e) =>
          typeof e === 'object' &&
          e !== null &&
          (e as { update?: { sessionUpdate?: string } }).update?.sessionUpdate ===
            'available_commands_update',
      );
    }

    it('emits exactly one envelope sourced from supportedCommands() on init', async () => {
      const messages = [
        { type: 'system', subtype: 'init', slash_commands: ['compact'] },
        { type: 'result', subtype: 'success', stop_reason: 'end_turn' },
      ];
      const query = vi.fn(() =>
        makeQuery(messages, {
          supportedCommands: () =>
            Promise.resolve([
              { name: 'compact', description: 'Compact the conversation', argumentHint: '[focus]' },
              { name: 'clear', description: 'Clear history', argumentHint: '' },
            ]),
        }),
      );
      const provider = createSdkProvider({ query });

      const out = await collect(provider({ prompt: 'p' }, makeCtx()));
      const commands = commandEnvelopes(out);
      expect(commands).toEqual([
        {
          type: 'acp.session_update',
          update: {
            sessionUpdate: 'available_commands_update',
            availableCommands: [
              {
                name: 'compact',
                description: 'Compact the conversation',
                input: { hint: '[focus]' },
              },
              { name: 'clear', description: 'Clear history' },
            ],
          },
        },
      ]);
    });

    it('falls back to init slash_commands names when supportedCommands() rejects', async () => {
      const messages = [
        { type: 'system', subtype: 'init', slash_commands: ['compact', 'clear'] },
        { type: 'result', subtype: 'success', stop_reason: 'end_turn' },
      ];
      const query = vi.fn(() =>
        makeQuery(messages, {
          supportedCommands: () => Promise.reject(new Error('control channel closed')),
        }),
      );
      const provider = createSdkProvider({ query });

      const out = await collect(provider({ prompt: 'p' }, makeCtx()));
      expect(commandEnvelopes(out)).toEqual([
        {
          type: 'acp.session_update',
          update: {
            sessionUpdate: 'available_commands_update',
            availableCommands: [
              { name: 'compact', description: '' },
              { name: 'clear', description: '' },
            ],
          },
        },
      ]);
    });

    it('emits the commands envelope at most once even with multiple init messages', async () => {
      const messages = [
        { type: 'system', subtype: 'init', slash_commands: ['compact'] },
        { type: 'system', subtype: 'init', slash_commands: ['compact'] },
        { type: 'result', subtype: 'success', stop_reason: 'end_turn' },
      ];
      const query = vi.fn(() =>
        makeQuery(messages, {
          supportedCommands: () =>
            Promise.resolve([{ name: 'compact', description: 'd', argumentHint: '' }]),
        }),
      );
      const provider = createSdkProvider({ query });

      const out = await collect(provider({ prompt: 'p' }, makeCtx()));
      expect(commandEnvelopes(out)).toHaveLength(1);
    });
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

  it('sends the claude_code preset and pinned setting sources for terminal parity', async () => {
    // Regression guard for the "400 role 'system' is not supported on this
    // model" error: omitting systemPrompt makes the SDK use its minimal
    // default instead of the full Claude Code prompt the terminal uses.
    let seen: { prompt: string; options?: SdkOptions } | undefined;
    const query = vi.fn((params: { prompt: string; options?: SdkOptions }) => {
      seen = params;
      return makeQuery([{ type: 'result' }]);
    });
    const provider = createSdkProvider({ query });

    await collect(provider({ prompt: 'hello' }, makeCtx()));

    expect(seen?.options?.systemPrompt).toEqual({ type: 'preset', preset: 'claude_code' });
    expect(seen?.options?.settingSources).toEqual(['user', 'project', 'local']);
  });

  it('forwards a context model to the SDK options', async () => {
    let seen: SdkOptions | undefined;
    const query = vi.fn((params: { prompt: string; options?: SdkOptions }) => {
      seen = params.options;
      return makeQuery([{ type: 'result' }]);
    });
    const provider = createSdkProvider({ query });

    await collect(provider({ prompt: 'p' }, makeCtx({ model: 'opus' })));

    expect(seen?.model).toBe('opus');
  });

  it('omits model from the SDK options when the context carries none', async () => {
    let seen: SdkOptions | undefined;
    const query = vi.fn((params: { prompt: string; options?: SdkOptions }) => {
      seen = params.options;
      return makeQuery([{ type: 'result' }]);
    });
    const provider = createSdkProvider({ query });

    await collect(provider({ prompt: 'p' }, makeCtx()));

    expect(seen?.model).toBeUndefined();
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

  describe('canUseTool wiring', () => {
    const SAFE_POLICY: PermissionPolicy = {
      fileEdit: 'auto',
      bash: 'ask',
      webFetch: 'ask',
      mcpTool: 'ask',
    };
    const OPEN_POLICY: PermissionPolicy = {
      fileEdit: 'auto',
      bash: 'auto',
      webFetch: 'auto',
      mcpTool: 'auto',
    };

    async function captureCanUseTool(
      ctx: AgentRequestContext,
      providerOptions: { permissionPolicy?: Partial<PermissionPolicy> } = {},
    ): Promise<CanUseTool | undefined> {
      let seen: SdkOptions | undefined;
      const query = vi.fn((params: { prompt: string; options?: SdkOptions }) => {
        seen = params.options;
        return makeQuery([{ type: 'result' }]);
      });
      const provider = createSdkProvider({ query, ...providerOptions });
      await collect(provider({ prompt: 'p' }, ctx));
      return seen?.canUseTool;
    }

    const NOOP_OPTIONS = {
      signal: new AbortController().signal,
      suggestions: [] as PermissionUpdate[],
      toolUseID: 'tu-1',
    };

    it("does NOT install canUseTool when permissionMode is 'bypassPermissions'", async () => {
      const canUseTool = await captureCanUseTool(makeCtx({ permissionMode: 'bypassPermissions' }));
      expect(canUseTool).toBeUndefined();
    });

    it('installs canUseTool for non-bypass modes so per-tool policy can deny', async () => {
      const canUseTool = await captureCanUseTool(makeCtx({ permissionMode: 'acceptEdits' }));
      expect(canUseTool).toBeDefined();
    });

    it('safe-read tools (Read/Glob/Grep) are always allowed regardless of policy', async () => {
      const canUseTool = await captureCanUseTool(
        makeCtx({ permissionMode: 'acceptEdits', permissionPolicy: SAFE_POLICY }),
      );
      expect(canUseTool).toBeDefined();
      for (const tool of ['Read', 'Glob', 'Grep', 'WebSearch'] as const) {
        const result: PermissionResult = await canUseTool!(tool, { path: '/x' }, NOOP_OPTIONS);
        expect(result.behavior).toBe('allow');
      }
    });

    it("file-edit tools allow under safe defaults because fileEdit defaults to 'auto'", async () => {
      const canUseTool = await captureCanUseTool(
        makeCtx({ permissionMode: 'acceptEdits', permissionPolicy: SAFE_POLICY }),
      );
      const result = await canUseTool!('Edit', { file_path: '/x' }, NOOP_OPTIONS);
      expect(result.behavior).toBe('allow');
    });

    it("bash/web-fetch/MCP default to 'ask' under safe defaults — denied without interrupt", async () => {
      const canUseTool = await captureCanUseTool(
        makeCtx({ permissionMode: 'acceptEdits', permissionPolicy: SAFE_POLICY }),
      );
      for (const tool of ['Bash', 'WebFetch', 'mcp__server__tool'] as const) {
        const result = await canUseTool!(tool, {}, NOOP_OPTIONS);
        expect(result.behavior).toBe('deny');
        if (result.behavior === 'deny') {
          expect(result.message).toMatch(new RegExp(tool.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
          expect(result.interrupt).toBeUndefined();
        }
      }
    });

    it("'deny' resolution denies with interrupt=true so the agent halts rather than retrying", async () => {
      const denyAll: PermissionPolicy = {
        fileEdit: 'deny',
        bash: 'deny',
        webFetch: 'deny',
        mcpTool: 'deny',
      };
      const canUseTool = await captureCanUseTool(
        makeCtx({ permissionMode: 'acceptEdits', permissionPolicy: denyAll }),
      );
      const result = await canUseTool!('Edit', { file_path: '/x' }, NOOP_OPTIONS);
      expect(result.behavior).toBe('deny');
      if (result.behavior === 'deny') {
        expect(result.interrupt).toBe(true);
      }
    });

    it('request-scoped permissionPolicy overrides the provider creation-time default', async () => {
      // Provider was created with safe defaults (bash: 'ask') but the request
      // context flips to OPEN_POLICY (bash: 'auto'); the override must win.
      const canUseTool = await captureCanUseTool(
        makeCtx({ permissionMode: 'acceptEdits', permissionPolicy: OPEN_POLICY }),
        { permissionPolicy: SAFE_POLICY },
      );
      const result = await canUseTool!('Bash', { command: 'ls' }, NOOP_OPTIONS);
      expect(result.behavior).toBe('allow');
    });

    it('falls back to safe defaults when neither provider nor request supplies a policy', async () => {
      const canUseTool = await captureCanUseTool(makeCtx({ permissionMode: 'acceptEdits' }));
      const bash = await canUseTool!('Bash', { command: 'ls' }, NOOP_OPTIONS);
      expect(bash.behavior).toBe('deny');
      const edit = await canUseTool!('Edit', { file_path: '/x' }, NOOP_OPTIONS);
      expect(edit.behavior).toBe('allow');
    });
  });
});
