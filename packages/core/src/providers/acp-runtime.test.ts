/**
 * Runtime-level tests for the ACP child pool. The default runtime owns
 * (a) child-process lifetime, (b) the in-process `(clientSessionId →
 * acpSessionId)` map, and (c) the on-disk session store wiring. The
 * existing `acp.test.ts` covers the provider above the runtime with a
 * fake `AcpRuntime`; this file covers the runtime itself with a fake
 * *agent* on the other end of the wire (real ACP JSON-RPC, in-memory
 * stream pair).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AgentSideConnection,
  ndJsonStream,
  PROTOCOL_VERSION,
  type Agent,
  type AuthenticateRequest,
  type AuthenticateResponse,
  type CancelNotification,
  type InitializeRequest,
  type InitializeResponse,
  type LoadSessionRequest,
  type LoadSessionResponse,
  type NewSessionRequest,
  type NewSessionResponse,
  type PromptRequest,
  type PromptResponse,
  type SetSessionConfigOptionRequest,
  type SetSessionConfigOptionResponse,
  type SetSessionModeRequest,
  type SetSessionModeResponse,
  type SetSessionModelRequest,
  type SetSessionModelResponse,
} from '@agentclientprotocol/sdk';
import { createDefaultAcpRuntime, type AcpSpawnHandle } from './acp-runtime.js';
import type { AcpEvent, AcpRunParams } from './acp.js';
import type { AcpSessionStore } from './acp-session-store.js';

/* ------------------------------------------------------------------ */
/*                      Stream + fake-agent harness                    */
/* ------------------------------------------------------------------ */

/**
 * Build a connected pair of byte streams in memory. Returns the two
 * halves: one for the client side (what `spawnAgent` returns) and one
 * for the fake-agent side (what we wrap with `AgentSideConnection`).
 */
function pairedStreams(): {
  clientSide: { writable: WritableStream<Uint8Array>; readable: ReadableStream<Uint8Array> };
  agentSide: { writable: WritableStream<Uint8Array>; readable: ReadableStream<Uint8Array> };
} {
  const clientToAgent = new TransformStream<Uint8Array, Uint8Array>();
  const agentToClient = new TransformStream<Uint8Array, Uint8Array>();
  return {
    clientSide: {
      writable: clientToAgent.writable,
      readable: agentToClient.readable,
    },
    agentSide: {
      writable: agentToClient.writable,
      readable: clientToAgent.readable,
    },
  };
}

interface FakeAgentOptions {
  /** What to report from `initialize`. Default: loadSession=true. */
  loadSessionCapability?: boolean;
  /** Override how `loadSession` responds (default: succeed). */
  loadSession?: (req: LoadSessionRequest) => Promise<LoadSessionResponse>;
  /** Override how `newSession` responds (default: sequential ids). */
  newSession?: (req: NewSessionRequest) => Promise<NewSessionResponse>;
  /** Override how `unstable_setSessionModel` responds (default: succeed). */
  setSessionModel?: (req: SetSessionModelRequest) => Promise<SetSessionModelResponse>;
  /**
   * When set, the agent emits an `available_commands_update` notification
   * for each minted session right after `newSession` resolves — mirroring
   * the real Claude Code agent, which advertises commands on session
   * creation without any prompt. The delay simulates the observed ~6–7s
   * async arrival; default 0 (synchronous-ish) so tests stay fast.
   */
  commandsOnNewSession?: {
    commands: ReadonlyArray<{ name: string; description: string; input?: { hint: string } | null }>;
    delayMs?: number;
  };
}

interface FakeAgentRecorder {
  initializeCalls: InitializeRequest[];
  newSessionCalls: NewSessionRequest[];
  loadSessionCalls: LoadSessionRequest[];
  promptCalls: PromptRequest[];
  cancelCalls: CancelNotification[];
  setModelCalls: SetSessionModelRequest[];
}

interface FakeAgentHarness {
  handle: AcpSpawnHandle;
  recorder: FakeAgentRecorder;
  /** Resolve when the agent side's underlying processing loop closes. */
  shutdown(): Promise<void>;
}

function startFakeAgent(options: FakeAgentOptions = {}): FakeAgentHarness {
  const { clientSide, agentSide } = pairedStreams();

  const recorder: FakeAgentRecorder = {
    initializeCalls: [],
    newSessionCalls: [],
    loadSessionCalls: [],
    promptCalls: [],
    cancelCalls: [],
    setModelCalls: [],
  };

  let sessionCounter = 0;
  const defaultLoadSession: NonNullable<FakeAgentOptions['loadSession']> = async () => ({
    modes: null,
    availableCommands: null,
  });
  const defaultNewSession: NonNullable<FakeAgentOptions['newSession']> = async () => {
    sessionCounter += 1;
    return {
      sessionId: `acp-session-${sessionCounter}`,
      modes: null,
      availableCommands: null,
    };
  };

  const defaultSetSessionModel: NonNullable<FakeAgentOptions['setSessionModel']> = async () => ({});

  const loadSessionImpl = options.loadSession ?? defaultLoadSession;
  const newSessionImpl = options.newSession ?? defaultNewSession;
  const setSessionModelImpl = options.setSessionModel ?? defaultSetSessionModel;
  const loadSessionCapability = options.loadSessionCapability ?? true;
  const commandsOnNewSession = options.commandsOnNewSession;

  // Box so the agent methods can reach the connection (for emitting
  // notifications) without a reassigned `let` in TDZ during construction.
  const connRef: { value: AgentSideConnection | undefined } = { value: undefined };

  const agent: Agent = {
    async initialize(params: InitializeRequest): Promise<InitializeResponse> {
      recorder.initializeCalls.push(params);
      return {
        protocolVersion: PROTOCOL_VERSION,
        agentCapabilities: {
          loadSession: loadSessionCapability,
        },
        authMethods: [],
      };
    },
    async authenticate(_params: AuthenticateRequest): Promise<AuthenticateResponse> {
      return {};
    },
    async newSession(params: NewSessionRequest): Promise<NewSessionResponse> {
      recorder.newSessionCalls.push(params);
      const response = await newSessionImpl(params);
      if (commandsOnNewSession) {
        const emit = (): void => {
          void connRef.value?.sessionUpdate({
            sessionId: response.sessionId,
            update: {
              sessionUpdate: 'available_commands_update',
              availableCommands: [...commandsOnNewSession.commands],
            },
          });
        };
        // Emit on a macrotask so the `newSession` response is delivered and
        // the client has registered the session before the notification
        // arrives — mirroring the real agent, which advertises commands only
        // after the session exists. `delayMs` lengthens this to simulate the
        // observed multi-second cold-start arrival.
        setTimeout(emit, commandsOnNewSession.delayMs ?? 0);
      }
      return response;
    },
    async loadSession(params: LoadSessionRequest): Promise<LoadSessionResponse> {
      recorder.loadSessionCalls.push(params);
      return loadSessionImpl(params);
    },
    async prompt(params: PromptRequest): Promise<PromptResponse> {
      recorder.promptCalls.push(params);
      return { stopReason: 'end_turn' };
    },
    async cancel(params: CancelNotification): Promise<void> {
      recorder.cancelCalls.push(params);
    },
    async setSessionMode(_params: SetSessionModeRequest): Promise<SetSessionModeResponse> {
      return {};
    },
    async setSessionConfigOption(
      _params: SetSessionConfigOptionRequest,
    ): Promise<SetSessionConfigOptionResponse> {
      return { configOptions: [] };
    },
    async unstable_setSessionModel(
      params: SetSessionModelRequest,
    ): Promise<SetSessionModelResponse> {
      recorder.setModelCalls.push(params);
      return setSessionModelImpl(params);
    },
  };

  // Wire up an AgentSideConnection on the agent side of the pair.
  const stream = ndJsonStream(agentSide.writable, agentSide.readable);
  // The connection starts processing eagerly once constructed. We retain it
  // so the agent methods can emit `sessionUpdate` notifications to the client.
  connRef.value = new AgentSideConnection(() => agent, stream);

  let exitedResolve: () => void = () => undefined;
  const exited = new Promise<void>((resolve) => {
    exitedResolve = resolve;
  });

  const handle: AcpSpawnHandle = {
    writable: clientSide.writable,
    readable: clientSide.readable,
    kill: () => {
      exitedResolve();
    },
    exited,
  };

  return {
    handle,
    recorder,
    async shutdown() {
      exitedResolve();
      try {
        await clientSide.writable.close();
      } catch {
        // already closed
      }
    },
  };
}

/* ------------------------------------------------------------------ */
/*                          Test helpers                               */
/* ------------------------------------------------------------------ */

function makeRunParams(overrides: Partial<AcpRunParams> = {}): AcpRunParams {
  return {
    prompt: 'hello',
    cwd: '/workspace',
    clientSessionId: 'cs-1',
    permissionMode: 'acceptEdits',
    signal: new AbortController().signal,
    ...overrides,
  };
}

async function collect(iter: AsyncIterable<AcpEvent>): Promise<AcpEvent[]> {
  const out: AcpEvent[] = [];
  for await (const event of iter) out.push(event);
  return out;
}

function makeInMemoryStore(): AcpSessionStore & {
  state: Map<string, string>;
  getCalls: Array<[string, string]>;
  setCalls: Array<[string, string, string]>;
  deleteCalls: Array<[string, string]>;
} {
  const state = new Map<string, string>();
  const key = (cwd: string, cs: string): string => `${cwd} ${cs}`;
  const getCalls: Array<[string, string]> = [];
  const setCalls: Array<[string, string, string]> = [];
  const deleteCalls: Array<[string, string]> = [];
  return {
    state,
    getCalls,
    setCalls,
    deleteCalls,
    async get(cwd, cs) {
      getCalls.push([cwd, cs]);
      return state.get(key(cwd, cs));
    },
    async set(cwd, cs, acp) {
      setCalls.push([cwd, cs, acp]);
      state.set(key(cwd, cs), acp);
    },
    async delete(cwd, cs) {
      deleteCalls.push([cwd, cs]);
      state.delete(key(cwd, cs));
    },
  };
}

/* ------------------------------------------------------------------ */
/*                              Tests                                  */
/* ------------------------------------------------------------------ */

describe('createDefaultAcpRuntime — session-store wiring', () => {
  const harnesses: Array<{ shutdown(): Promise<void> }> = [];
  const runtimes: Array<{ shutdownAll(): Promise<void> }> = [];

  afterEach(async () => {
    await Promise.allSettled(runtimes.map((r) => r.shutdownAll()));
    runtimes.length = 0;
    await Promise.allSettled(harnesses.map((h) => h.shutdown()));
    harnesses.length = 0;
    vi.restoreAllMocks();
  });

  async function setup(
    storeOption: AcpSessionStore | null | undefined,
    fakeAgentOptions: FakeAgentOptions = {},
  ): Promise<{
    runtime: ReturnType<typeof createDefaultAcpRuntime>;
    harness: FakeAgentHarness;
  }> {
    const harness = startFakeAgent(fakeAgentOptions);
    harnesses.push(harness);
    const runtime = createDefaultAcpRuntime({
      spawnAgent: () => harness.handle,
      // Tests don't actually spawn a child — `exited` resolves
      // immediately at shutdown, so we just need a small grace value
      // to avoid lingering 2-second waits if anything goes wrong.
      killGracePeriodMs: 50,
      ...(storeOption !== undefined && { sessionStore: storeOption }),
    });
    runtimes.push(runtime);
    return { runtime, harness };
  }

  it('on second use of the same clientSessionId after a fresh runtime, calls loadSession (not newSession)', async () => {
    const store = makeInMemoryStore();

    // First runtime "instance" (simulates dev-server boot #1).
    {
      const { runtime, harness } = await setup(store);
      const events = await collect(runtime.run(makeRunParams()));
      expect(events.some((e) => e.kind === 'error')).toBe(false);
      expect(harness.recorder.newSessionCalls).toHaveLength(1);
      expect(harness.recorder.loadSessionCalls).toHaveLength(0);
      expect(store.setCalls).toHaveLength(1);
      expect(store.setCalls[0]).toEqual(['/workspace', 'cs-1', 'acp-session-1']);
      await runtime.shutdownAll();
    }

    // Second runtime "instance" (simulates dev-server reboot — same store).
    {
      const { runtime, harness } = await setup(store);
      const events = await collect(runtime.run(makeRunParams()));
      expect(events.some((e) => e.kind === 'error')).toBe(false);

      // Critical: reboot must NOT mint a new session — it must load the stored one.
      expect(harness.recorder.newSessionCalls).toHaveLength(0);
      expect(harness.recorder.loadSessionCalls).toHaveLength(1);
      expect(harness.recorder.loadSessionCalls[0]).toMatchObject({
        cwd: '/workspace',
        sessionId: 'acp-session-1',
        mcpServers: [],
      });

      // The prompt must have been routed to the resumed session id, not a fresh one.
      expect(harness.recorder.promptCalls).toHaveLength(1);
      expect(harness.recorder.promptCalls[0]?.sessionId).toBe('acp-session-1');
    }
  });

  it('falls back to newSession AND prunes the store when loadSession rejects', async () => {
    const store = makeInMemoryStore();
    await store.set('/workspace', 'cs-1', 'acp-stale');

    const { runtime, harness } = await setup(store, {
      loadSession: async () => {
        throw new Error('session not found');
      },
    });

    const events = await collect(runtime.run(makeRunParams()));
    expect(events.some((e) => e.kind === 'error')).toBe(false);

    expect(harness.recorder.loadSessionCalls).toHaveLength(1);
    expect(harness.recorder.newSessionCalls).toHaveLength(1);

    // The stale entry was deleted...
    expect(store.deleteCalls).toContainEqual(['/workspace', 'cs-1']);
    // ...and then the freshly-minted session was written.
    const finalAcp = store.state.get('/workspace cs-1');
    expect(finalAcp).toBe('acp-session-1');
  });

  it('ignores the store entirely when the agent does not advertise loadSession', async () => {
    const store = makeInMemoryStore();
    await store.set('/workspace', 'cs-1', 'acp-from-old-boot');

    const { runtime, harness } = await setup(store, {
      loadSessionCapability: false,
    });

    const events = await collect(runtime.run(makeRunParams()));
    expect(events.some((e) => e.kind === 'error')).toBe(false);

    // No loadSession call ever — capability gate honored.
    expect(harness.recorder.loadSessionCalls).toHaveLength(0);
    // And no store.get either: even consulting the store is pointless if
    // we cannot use the result, and we want to avoid hiding a stale entry
    // forever for a capability-less agent.
    expect(store.getCalls).toHaveLength(0);

    // The runtime still mints a fresh session as if there were no store.
    expect(harness.recorder.newSessionCalls).toHaveLength(1);
  });

  it('sessionStore: null disables persistence entirely', async () => {
    const store = makeInMemoryStore();

    const { runtime, harness } = await setup(null);
    const events = await collect(runtime.run(makeRunParams()));
    expect(events.some((e) => e.kind === 'error')).toBe(false);

    // newSession should have been used, and the test-double store
    // (which the runtime never received) sees zero traffic.
    expect(harness.recorder.newSessionCalls).toHaveLength(1);
    expect(store.getCalls).toHaveLength(0);
    expect(store.setCalls).toHaveLength(0);
    expect(store.deleteCalls).toHaveLength(0);
  });

  it('keeps the command-lister session ephemeral — never consults the store or calls loadSession', async () => {
    const store = makeInMemoryStore();
    // A stale command-lister entry left by a previous boot. It can never be
    // resumed (the lister never has a transcript), so the runtime must ignore
    // it instead of attempting a loadSession that always fails with -32002.
    // Seed the underlying map directly so the recorder reflects only the
    // runtime's own store traffic, not this setup.
    store.state.set('/workspace __agent-devtools:command-lister__', 'acp-stale-lister');

    const { runtime, harness } = await setup(store, {
      commandsOnNewSession: { commands: [{ name: 'foo', description: 'bar' }] },
    });

    const commands = await runtime.listCommands({
      cwd: '/workspace',
      signal: new AbortController().signal,
    });

    expect(commands.map((c) => c.name)).toContain('foo');
    // No resume attempt for the reserved key — it mints a fresh session...
    expect(harness.recorder.loadSessionCalls).toHaveLength(0);
    expect(harness.recorder.newSessionCalls).toHaveLength(1);
    // ...and the store is never touched for the command-lister key.
    expect(store.getCalls).not.toContainEqual(['/workspace', '__agent-devtools:command-lister__']);
    expect(store.setCalls.some(([, cs]) => cs === '__agent-devtools:command-lister__')).toBe(false);
    // The stale entry is left as-is (not deleted) — we simply don't read it.
    expect(store.deleteCalls).toHaveLength(0);
  });

  it('in-process cache hit short-circuits the store on the second run within one runtime', async () => {
    const store = makeInMemoryStore();
    const { runtime, harness } = await setup(store);

    await collect(runtime.run(makeRunParams()));
    await collect(runtime.run(makeRunParams()));

    // Only one newSession across both runs (the in-memory cache hit
    // serves the second prompt).
    expect(harness.recorder.newSessionCalls).toHaveLength(1);
    // The store was consulted exactly once — on the first miss.
    expect(store.getCalls).toHaveLength(1);
    // And we only wrote once (the freshly-minted session).
    expect(store.setCalls).toHaveLength(1);
  });
});

describe('createDefaultAcpRuntime — model selection', () => {
  const harnesses: Array<{ shutdown(): Promise<void> }> = [];
  const runtimes: Array<{ shutdownAll(): Promise<void> }> = [];

  afterEach(async () => {
    await Promise.allSettled(runtimes.map((r) => r.shutdownAll()));
    runtimes.length = 0;
    await Promise.allSettled(harnesses.map((h) => h.shutdown()));
    harnesses.length = 0;
    vi.restoreAllMocks();
  });

  function setup(fakeAgentOptions: FakeAgentOptions = {}): {
    runtime: ReturnType<typeof createDefaultAcpRuntime>;
    harness: FakeAgentHarness;
  } {
    const harness = startFakeAgent(fakeAgentOptions);
    harnesses.push(harness);
    const runtime = createDefaultAcpRuntime({
      spawnAgent: () => harness.handle,
      killGracePeriodMs: 50,
      // Persistence is irrelevant to model selection; disable it so these
      // tests exercise the in-process path only.
      sessionStore: null,
    });
    runtimes.push(runtime);
    return { runtime, harness };
  }

  it('applies the requested model via session/set_model before prompting', async () => {
    const { runtime, harness } = setup();
    const events = await collect(runtime.run(makeRunParams({ model: 'opus' })));
    expect(events.some((e) => e.kind === 'error')).toBe(false);

    expect(harness.recorder.setModelCalls).toHaveLength(1);
    expect(harness.recorder.setModelCalls[0]).toEqual({
      sessionId: 'acp-session-1',
      modelId: 'opus',
    });
    // The model is set before the prompt is dispatched.
    expect(harness.recorder.promptCalls).toHaveLength(1);
    expect(harness.recorder.promptCalls[0]?.sessionId).toBe('acp-session-1');
  });

  it('never calls session/set_model when no model is requested', async () => {
    const { runtime, harness } = setup();
    const events = await collect(runtime.run(makeRunParams()));
    expect(events.some((e) => e.kind === 'error')).toBe(false);

    expect(harness.recorder.setModelCalls).toHaveLength(0);
    expect(harness.recorder.promptCalls).toHaveLength(1);
  });

  it('skips the redundant set_model round-trip when the model is unchanged across turns', async () => {
    const { runtime, harness } = setup();

    await collect(runtime.run(makeRunParams({ model: 'sonnet' })));
    await collect(runtime.run(makeRunParams({ model: 'sonnet' })));

    // Same session reused across both turns, but set_model fired only once.
    expect(harness.recorder.newSessionCalls).toHaveLength(1);
    expect(harness.recorder.setModelCalls).toHaveLength(1);
    expect(harness.recorder.promptCalls).toHaveLength(2);
  });

  it('re-applies set_model when the requested model changes between turns', async () => {
    const { runtime, harness } = setup();

    await collect(runtime.run(makeRunParams({ model: 'sonnet' })));
    await collect(runtime.run(makeRunParams({ model: 'opus' })));

    expect(harness.recorder.setModelCalls).toHaveLength(2);
    expect(harness.recorder.setModelCalls.map((c) => c.modelId)).toEqual(['sonnet', 'opus']);
  });

  it('surfaces an error event and aborts the turn when set_model rejects', async () => {
    const { runtime, harness } = setup({
      setSessionModel: async () => {
        throw new Error('unknown model alias');
      },
    });

    const events = await collect(runtime.run(makeRunParams({ model: 'bogus' })));

    // The agent's rejection surfaces as an error event. The exact message is
    // determined by the JSON-RPC transport (which masks application throws as
    // "Internal error"), so we only assert that an error with a message is
    // surfaced — not its text.
    const error = events.find((e) => e.kind === 'error');
    expect(error).toBeDefined();
    expect((error as Extract<AcpEvent, { kind: 'error' }>).error.message.length).toBeGreaterThan(0);

    // The prompt must NOT have been dispatched on the wrong model.
    expect(harness.recorder.promptCalls).toHaveLength(0);
  });
});

describe('createDefaultAcpRuntime — listCommands (model-free)', () => {
  const harnesses: Array<{ shutdown(): Promise<void> }> = [];
  const runtimes: Array<{ shutdownAll(): Promise<void> }> = [];

  afterEach(async () => {
    await Promise.allSettled(runtimes.map((r) => r.shutdownAll()));
    runtimes.length = 0;
    await Promise.allSettled(harnesses.map((h) => h.shutdown()));
    harnesses.length = 0;
    vi.restoreAllMocks();
  });

  function setup(fakeAgentOptions: FakeAgentOptions = {}): {
    runtime: ReturnType<typeof createDefaultAcpRuntime>;
    harness: FakeAgentHarness;
  } {
    const harness = startFakeAgent(fakeAgentOptions);
    harnesses.push(harness);
    const runtime = createDefaultAcpRuntime({
      spawnAgent: () => harness.handle,
      killGracePeriodMs: 50,
      sessionStore: null,
    });
    runtimes.push(runtime);
    return { runtime, harness };
  }

  const advertised = [
    { name: 'plan', description: 'Create a plan', input: { hint: '<goal>' } },
    { name: 'review', description: 'Review the diff', input: null },
  ];

  it('captures the agent-advertised commands after newSession (no prompt sent)', async () => {
    const { runtime, harness } = setup({ commandsOnNewSession: { commands: advertised } });
    const commands = await runtime.listCommands({
      cwd: '/workspace',
      signal: new AbortController().signal,
    });
    expect(commands).toEqual([
      { name: 'plan', description: 'Create a plan', input: { hint: '<goal>' } },
      { name: 'review', description: 'Review the diff' },
    ]);
    // A model turn was never engaged — listing is purely a control path.
    expect(harness.recorder.promptCalls).toHaveLength(0);
    // It uses a dedicated session, separate from any conversation session.
    expect(harness.recorder.newSessionCalls).toHaveLength(1);
  });

  it('waits for a delayed advertisement (commands arrive after newSession resolves)', async () => {
    const { runtime } = setup({
      commandsOnNewSession: { commands: advertised, delayMs: 40 },
    });
    const commands = await runtime.listCommands({
      cwd: '/workspace',
      signal: new AbortController().signal,
    });
    expect(commands.map((c) => c.name)).toEqual(['plan', 'review']);
  });

  it('reuses one session across repeated list calls for the same cwd', async () => {
    const { runtime, harness } = setup({ commandsOnNewSession: { commands: advertised } });
    await runtime.listCommands({ cwd: '/workspace', signal: new AbortController().signal });
    await runtime.listCommands({ cwd: '/workspace', signal: new AbortController().signal });
    // The lister session is reused — only one newSession across both calls.
    expect(harness.recorder.newSessionCalls).toHaveLength(1);
  });

  it('returns [] when the agent never advertises commands (no prompt forced)', async () => {
    const { runtime, harness } = setup({
      // No commandsOnNewSession — the agent stays silent.
    });
    const ac = new AbortController();
    // Abort quickly so we don't sit through the runtime's internal timeout.
    setTimeout(() => ac.abort(), 30);
    const commands = await runtime.listCommands({ cwd: '/workspace', signal: ac.signal });
    expect(commands).toEqual([]);
    // Critically: we never sent a prompt to coax commands out of the agent.
    expect(harness.recorder.promptCalls).toHaveLength(0);
  });

  it('returns [] when the caller signal is already aborted', async () => {
    const { runtime } = setup({ commandsOnNewSession: { commands: advertised, delayMs: 1000 } });
    const ac = new AbortController();
    ac.abort();
    const commands = await runtime.listCommands({ cwd: '/workspace', signal: ac.signal });
    expect(commands).toEqual([]);
  });
});
