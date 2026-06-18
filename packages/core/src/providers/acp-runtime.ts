/**
 * Default ACP runtime: maintains a pool of long-lived ACP child processes
 * (one per workspace cwd) and reuses ACP sessions across HTTP turns so the
 * widget conversation has real history.
 *
 * Why a pool: each ACP child is heavyweight (we spawn the host `node`
 * running the `@agentclientprotocol/claude-agent-acp` adapter script,
 * which then initializes Claude Code internally). Spawning per HTTP turn
 * meant ~1s startup per message AND every turn was a fresh, amnesic
 * session. The pool keeps the child alive for the dev-server lifetime and
 * maps every `clientSessionId` (browser-tab identifier) to a stable ACP
 * `sessionId`, so the second turn remembers the first.
 *
 * Session ownership: one ACP child can host many sessions. We key one
 * child per workspace `cwd` (`{cwd → AcpChild}`) and one session per
 * `clientSessionId` on that child (`{clientSessionId → acpSessionId}`).
 * Concurrent prompts on the SAME `clientSessionId` are serialized — the
 * underlying `prompt()` already queues, but our notification routing
 * assumes at most one in-flight prompt per session.
 *
 * Auto-permission policy: the widget user is not at the terminal, so we
 * resolve every `requestPermission` call from the resolved permission
 * mode of the currently-running prompt — see {@link decidePermission}.
 *
 * Shutdown: the runtime exposes `shutdownAll()` so the dev server can
 * gracefully cancel and reap children on `SIGTERM`/`SIGINT`. Failing
 * that, the child is reaped by OS on parent exit.
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { Readable, Writable } from 'node:stream';
import {
  ClientSideConnection,
  ndJsonStream,
  PROTOCOL_VERSION,
  type Client,
  type ContentBlock,
  type PermissionOption,
  type RequestPermissionRequest,
  type RequestPermissionResponse,
  type SessionNotification,
} from '@agentclientprotocol/sdk';
import {
  DEFAULT_PERMISSION_POLICY,
  type AcpAvailableCommand,
  type AcpEvent,
  type AcpRunParams,
  type AcpRuntime,
  type PermissionPolicy,
} from './acp.js';
import { createDefaultAcpSessionStore, type AcpSessionStore } from './acp-session-store.js';
import { categorizeToolKind } from './permission-category.js';
import { formatContextPreamble } from './context-preamble.js';

/**
 * Test seam over child-process spawning. Lets unit tests drive the runtime
 * with in-memory streams instead of forking a real agent binary.
 */
export interface AcpSpawnHandle {
  /** Web-stream `stdin` of the agent. Writes here are read by the agent. */
  writable: WritableStream<Uint8Array>;
  /** Web-stream `stdout` of the agent. Reads here come from the agent. */
  readable: ReadableStream<Uint8Array>;
  /**
   * Force-kill the agent. Called when graceful shutdown (cancel + exit)
   * doesn't complete within `killGracePeriodMs`.
   */
  kill(): void;
  /** Resolves when the agent process exits. */
  exited: Promise<void>;
}

export interface CreateDefaultAcpRuntimeOptions {
  /**
   * Override the spawn step. Useful for tests; production callers omit.
   */
  spawnAgent?: () => AcpSpawnHandle | Promise<AcpSpawnHandle>;
  /**
   * After sending `session/cancel`, how long to wait for the agent to exit
   * gracefully before force-killing. Default 2000ms.
   */
  killGracePeriodMs?: number;
  /**
   * Sink for session-info diagnostics. Called once when a new ACP session
   * is minted, with the resolved `(cwd, acpSessionId)`. The CLI wires this
   * to a single stderr line so the user can `claude --resume <sessionId>`
   * from their terminal. Default: no-op.
   */
  onSessionOpened?: (info: { cwd: string; acpSessionId: string; clientSessionId: string }) => void;
  /**
   * Disk store that persists `(cwd, clientSessionId) → acpSessionId` so a
   * dev-server restart can `loadSession` instead of minting a fresh
   * (amnesic) one. Default: `createDefaultAcpSessionStore()`. Pass `null`
   * to disable persistence (e.g., tests, ephemeral environments). The
   * store is only consulted when the agent advertises the `loadSession`
   * capability during initialize.
   */
  sessionStore?: AcpSessionStore | null;
}

const DEFAULT_KILL_GRACE_PERIOD_MS = 2000;

/**
 * How long {@link AcpChild.listCommands} waits for the agent's advertised
 * `available_commands_update` after ensuring a session. The probe measured
 * the cold-start emission at ~6–7s, so we wait a touch longer; the route
 * layer applies its own (longer) hard cap and the call also unwinds early
 * when the caller's `signal` aborts.
 */
const COMMANDS_ADVERTISE_TIMEOUT_MS = 10_000;

/**
 * Synthetic `clientSessionId` used by {@link AcpChild.listCommands}. It keys
 * a session dedicated to slash command listing so it never shares state with
 * a browser tab's conversation session. The command catalogue depends only
 * on `cwd`, so one such session per child suffices and is reused across list
 * calls.
 */
const COMMAND_LISTER_SESSION_KEY = '__agent-devtools:command-lister__';

/**
 * Default ACP runtime. Exposes `shutdownAll()` on top of the base
 * `AcpRuntime.run` for graceful dev-server shutdown.
 */
export interface DefaultAcpRuntime extends AcpRuntime {
  listCommands(params: { cwd: string; signal: AbortSignal }): Promise<AcpAvailableCommand[]>;
  shutdownAll(): Promise<void>;
}

export function createDefaultAcpRuntime(
  options: CreateDefaultAcpRuntimeOptions = {},
): DefaultAcpRuntime {
  const spawnAgent = options.spawnAgent ?? defaultSpawnAgent;
  const killGracePeriodMs = options.killGracePeriodMs ?? DEFAULT_KILL_GRACE_PERIOD_MS;
  const onSessionOpened = options.onSessionOpened;
  // `undefined` means "I have no opinion, use the default disk store".
  // Explicit `null` means "I deliberately want no persistence". This
  // mirrors how other parts of the codebase distinguish absence from
  // an explicit opt-out.
  const sessionStore =
    options.sessionStore === null ? null : (options.sessionStore ?? createDefaultAcpSessionStore());
  const pool = new AcpSessionPool({
    spawnAgent,
    killGracePeriodMs,
    onSessionOpened,
    sessionStore,
  });

  return {
    run: (params) => pool.run(params),
    listCommands: (params) => pool.listCommands(params),
    shutdownAll: () => pool.shutdownAll(),
  };
}

interface PoolDeps {
  spawnAgent: () => AcpSpawnHandle | Promise<AcpSpawnHandle>;
  killGracePeriodMs: number;
  onSessionOpened?:
    | ((info: { cwd: string; acpSessionId: string; clientSessionId: string }) => void)
    | undefined;
  sessionStore: AcpSessionStore | null;
}

class AcpSessionPool {
  private readonly childByCwd = new Map<string, Promise<AcpChild>>();

  constructor(private readonly deps: PoolDeps) {}

  async *run(params: AcpRunParams): AsyncGenerator<AcpEvent, void> {
    let child: AcpChild;
    try {
      child = await this.getChild(params.cwd);
    } catch (error) {
      yield { kind: 'error', error: toErrorPayload(error) };
      return;
    }
    yield* child.run(params);
  }

  private getChild(cwd: string): Promise<AcpChild> {
    const cached = this.childByCwd.get(cwd);
    if (cached) return cached;
    const pending = AcpChild.spawn(this.deps).catch((error: unknown) => {
      // If spawn fails, drop the broken promise so the next request retries.
      if (this.childByCwd.get(cwd) === pending) this.childByCwd.delete(cwd);
      throw error;
    });
    this.childByCwd.set(cwd, pending);
    return pending;
  }

  async listCommands(params: { cwd: string; signal: AbortSignal }): Promise<AcpAvailableCommand[]> {
    let child: AcpChild;
    try {
      child = await this.getChild(params.cwd);
    } catch {
      // Spawn failed — graceful empty; the route turns this into
      // `{ commands: [] }` and the caller (widget) degrades to no menu.
      return [];
    }
    return child.listCommands(params);
  }

  async shutdownAll(): Promise<void> {
    const childrenPromises = [...this.childByCwd.values()];
    this.childByCwd.clear();
    await Promise.allSettled(
      childrenPromises.map(async (p) => {
        const child = await p.catch(() => null);
        if (child) await child.shutdown();
      }),
    );
  }
}

interface RunState {
  queue: EventQueue<AcpEvent>;
  permissionMode: AcpRunParams['permissionMode'];
  permissionPolicy: PermissionPolicy;
}

interface SessionEntry {
  acpSessionId: string;
  /** Currently-running prompt's state, or null if idle. */
  current: RunState | null;
  /** Resolves when the previous prompt on this session finishes, so the next can start. */
  lastDone: Promise<void>;
  /**
   * Last model applied to this session via `session/set_model`, or undefined
   * if none has been applied (the session runs on the agent's default). Used
   * to skip a redundant `set_model` round-trip when the requested model is
   * unchanged across turns.
   */
  appliedModel?: string;
  /**
   * Latest slash command catalogue advertised by the agent for this session
   * via `available_commands_update`. Captured outside any in-flight run so
   * the model-free `listCommands` path can read it after `newSession`
   * resolves. Undefined until the first advertisement arrives.
   */
  latestCommands?: AcpAvailableCommand[];
  /**
   * One-shot resolvers parked by `listCommands` while waiting for the first
   * `available_commands_update`. Resolved (and cleared) the moment commands
   * are captured. Kept as a set so concurrent listers all wake.
   */
  commandWaiters: Set<(commands: AcpAvailableCommand[]) => void>;
}

/**
 * One ACP child process. Hosts multiple sessions (one per
 * `clientSessionId`) and routes incoming `sessionUpdate` notifications
 * back to the correct in-flight `run()`.
 */
class AcpChild {
  /** clientSessionId → entry. */
  private readonly sessions = new Map<string, SessionEntry>();
  /** acpSessionId → entry (reverse lookup for Client callbacks). */
  private readonly bySessionId = new Map<string, SessionEntry>();
  /** Set when shutdown() is called so further runs reject cleanly. */
  private shuttingDown = false;

  private constructor(
    private readonly conn: ClientSideConnection,
    private readonly handle: AcpSpawnHandle,
    private readonly deps: PoolDeps,
    /**
     * Captured from `InitializeResponse.agentCapabilities.loadSession`.
     * When false the runtime must never call `conn.loadSession` — the
     * agent will reject it. Claude Code's agent advertises `true`; other
     * agents may not.
     */
    private readonly supportsLoadSession: boolean,
  ) {}

  static async spawn(deps: PoolDeps): Promise<AcpChild> {
    const handle = await deps.spawnAgent();
    const stream = ndJsonStream(handle.writable, handle.readable);
    // Chicken-and-egg: the `Client` callbacks need to reach the AcpChild
    // (for session routing), but AcpChild's constructor needs the `conn`
    // (which is built from the client). Stash the child in a const box so
    // the callbacks see the binding and we don't need a reassigned `let`.
    const ref: { value: AcpChild | undefined } = { value: undefined };
    const client: Client = {
      async sessionUpdate(notification: SessionNotification): Promise<void> {
        const self = ref.value;
        if (!self) return;
        const entry = self.bySessionId.get(notification.sessionId);
        if (!entry) return;
        // Capture the slash command catalogue regardless of whether a run is
        // in flight. The agent advertises it right after `newSession` (no
        // prompt), so the model-free `listCommands` path depends on this
        // being stashed outside any run's queue.
        const commands = extractAvailableCommands(notification.update);
        if (commands) {
          entry.latestCommands = commands;
          const waiters = [...entry.commandWaiters];
          entry.commandWaiters.clear();
          for (const resolve of waiters) resolve(commands);
        }
        entry.current?.queue.push({
          kind: 'notification',
          sessionUpdate: notification.update,
        });
      },
      async requestPermission(req: RequestPermissionRequest): Promise<RequestPermissionResponse> {
        const self = ref.value;
        const state = self?.bySessionId.get(req.sessionId)?.current;
        const mode = state?.permissionMode ?? 'default';
        const policy = state?.permissionPolicy ?? DEFAULT_PERMISSION_POLICY;
        return decidePermission(req, mode, policy);
      },
    };
    const conn = new ClientSideConnection(() => client, stream);
    const initResponse = await conn.initialize({
      protocolVersion: PROTOCOL_VERSION,
      clientCapabilities: {
        fs: { readTextFile: false, writeTextFile: false },
        terminal: false,
      },
    });
    const supportsLoadSession = initResponse.agentCapabilities?.loadSession === true;
    const child = new AcpChild(conn, handle, deps, supportsLoadSession);
    ref.value = child;
    return child;
  }

  async *run(params: AcpRunParams): AsyncGenerator<AcpEvent, void> {
    if (this.shuttingDown) {
      yield { kind: 'error', error: { name: 'ShuttingDown', message: 'runtime is shutting down' } };
      return;
    }

    let entry: SessionEntry;
    try {
      entry = await this.getOrCreateSession(params.clientSessionId, params.cwd);
    } catch (error) {
      yield { kind: 'error', error: toErrorPayload(error) };
      return;
    }

    // Serialize prompts on the same session — the agent's own queue would
    // accept concurrent prompts but our notification routing assumes one
    // active run per session.
    const previous = entry.lastDone;
    let releaseThis: () => void = () => undefined;
    entry.lastDone = new Promise<void>((res) => {
      releaseThis = res;
    });

    try {
      await previous.catch(() => undefined);

      if (params.signal.aborted) {
        yield { kind: 'error', error: { name: 'AbortError', message: 'aborted before start' } };
        return;
      }

      // Apply the requested model before the prompt. `session/set_model`
      // mutates shared session state, so it runs inside the per-session
      // serialization (after `await previous`) and only when the model
      // actually changes, to avoid a redundant round-trip every turn. The
      // agent resolves aliases like `opus` to canonical ids. A failure is
      // surfaced rather than silently running the prompt on the wrong model.
      if (params.model !== undefined && params.model !== entry.appliedModel) {
        try {
          await this.conn.unstable_setSessionModel({
            sessionId: entry.acpSessionId,
            modelId: params.model,
          });
          entry.appliedModel = params.model;
        } catch (error) {
          yield { kind: 'error', error: toErrorPayload(error) };
          return;
        }
      }

      const queue = new EventQueue<AcpEvent>();
      entry.current = {
        queue,
        permissionMode: params.permissionMode,
        permissionPolicy: { ...DEFAULT_PERMISSION_POLICY, ...(params.permissionPolicy ?? {}) },
      };

      const onAbort = (): void => {
        // Cancel the in-flight prompt, but leave the queue open so the
        // agent's final notifications (and `stopReason: 'cancelled'`
        // result) can still be observed.
        void this.conn.cancel({ sessionId: entry.acpSessionId }).catch(() => undefined);
      };
      params.signal.addEventListener('abort', onAbort, { once: true });

      const promptTurn = (async (): Promise<void> => {
        try {
          const result = await this.conn.prompt({
            sessionId: entry.acpSessionId,
            prompt: await buildPromptContent(params),
          });
          queue.push({
            kind: 'result',
            stopReason: result.stopReason,
            ...(result.usage !== undefined && result.usage !== null && { usage: result.usage }),
          });
        } catch (error) {
          queue.push({ kind: 'error', error: toErrorPayload(error) });
        } finally {
          queue.close();
        }
      })();

      try {
        for await (const event of queue) {
          yield event;
        }
      } finally {
        params.signal.removeEventListener('abort', onAbort);
        await promptTurn.catch(() => undefined);
        entry.current = null;
      }
    } finally {
      releaseThis();
    }
  }

  /**
   * Model-free slash command listing. Ensures a session for `cwd` using a
   * dedicated synthetic `clientSessionId` (so it never collides with a
   * browser tab's conversation session) and returns the agent's advertised
   * catalogue. The advertisement may already be stashed (a prior list call,
   * or it raced in before we parked a waiter) — return it immediately if so;
   * otherwise wait for the first `available_commands_update`, bounded by both
   * an internal timeout and the caller's `signal`. No prompt is ever sent.
   */
  async listCommands(params: { cwd: string; signal: AbortSignal }): Promise<AcpAvailableCommand[]> {
    if (this.shuttingDown) return [];

    let entry: SessionEntry;
    try {
      entry = await this.getOrCreateSession(COMMAND_LISTER_SESSION_KEY, params.cwd);
    } catch {
      return [];
    }

    if (entry.latestCommands) return entry.latestCommands;
    if (params.signal.aborted) return [];

    return new Promise<AcpAvailableCommand[]>((resolve) => {
      let settled = false;
      const finish = (commands: AcpAvailableCommand[]): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        params.signal.removeEventListener('abort', onAbort);
        entry.commandWaiters.delete(waiter);
        resolve(commands);
      };
      const waiter = (commands: AcpAvailableCommand[]): void => finish(commands);
      const onAbort = (): void => finish([]);
      const timer = setTimeout(() => finish([]), COMMANDS_ADVERTISE_TIMEOUT_MS);

      // Re-check after parking: the advertisement could have landed between
      // the synchronous `latestCommands` check above and here.
      if (entry.latestCommands) {
        finish(entry.latestCommands);
        return;
      }
      entry.commandWaiters.add(waiter);
      params.signal.addEventListener('abort', onAbort, { once: true });
    });
  }

  private async getOrCreateSession(clientSessionId: string, cwd: string): Promise<SessionEntry> {
    const existing = this.sessions.get(clientSessionId);
    if (existing) return existing;

    // Phase 1: try to resume a session persisted across dev-server
    // restarts. Only meaningful when (a) we have a store and (b) the
    // agent supports session/load.
    const store = this.deps.sessionStore;
    if (store && this.supportsLoadSession) {
      const stored = await store.get(cwd, clientSessionId);
      if (stored !== undefined) {
        try {
          await this.conn.loadSession({ cwd, mcpServers: [], sessionId: stored });
          const raced = this.sessions.get(clientSessionId);
          if (raced) return raced;
          return this.registerSession(clientSessionId, cwd, stored);
        } catch {
          // The stored id is stale (agent dropped its on-disk session
          // store, --resume cutoff, etc). Prune so the next attempt
          // doesn't keep paying the failed-loadSession round-trip, and
          // fall through to newSession.
          await store.delete(cwd, clientSessionId);
        }
      }
    }

    const session = await this.conn.newSession({ cwd, mcpServers: [] });
    // Re-check after the await: a concurrent caller may have minted the
    // session in the meantime. If so, keep the winner and drop ours.
    const raced = this.sessions.get(clientSessionId);
    if (raced) return raced;

    const entry = this.registerSession(clientSessionId, cwd, session.sessionId);

    // Best-effort persist for the next dev-server restart. We never
    // throw out of getOrCreateSession on a store write failure — the
    // session itself is already alive in-process.
    if (store) {
      await store.set(cwd, clientSessionId, session.sessionId);
    }

    return entry;
  }

  private registerSession(
    clientSessionId: string,
    cwd: string,
    acpSessionId: string,
  ): SessionEntry {
    const entry: SessionEntry = {
      acpSessionId,
      current: null,
      lastDone: Promise.resolve(),
      commandWaiters: new Set(),
    };
    this.sessions.set(clientSessionId, entry);
    this.bySessionId.set(acpSessionId, entry);
    this.deps.onSessionOpened?.({
      cwd,
      acpSessionId,
      clientSessionId,
    });
    return entry;
  }

  async shutdown(): Promise<void> {
    this.shuttingDown = true;
    for (const entry of this.sessions.values()) {
      if (entry.current) {
        await this.conn.cancel({ sessionId: entry.acpSessionId }).catch(() => undefined);
      }
    }
    await shutdownProcess(this.handle, this.deps.killGracePeriodMs);
  }
}

/**
 * Build the ACP `prompt` content blocks. We always send the user prompt
 * as the last block; if request-time context is present we prepend a
 * single `text` block carrying the picked-element evidence + page
 * context (rendered by {@link formatContextPreamble}).
 *
 * Why a separate block rather than splicing into the user prompt: ACP
 * preserves block boundaries through the SDK's session jsonl, so a
 * later `claude --resume` from the terminal shows the user message and
 * the page-context briefing as distinct segments rather than one
 * indistinguishable blob.
 */
export async function buildPromptContent(params: AcpRunParams): Promise<ContentBlock[]> {
  const blocks: ContentBlock[] = [];
  const ctx = await formatContextPreamble(params.context, {
    ...(params.files !== undefined && { files: params.files }),
  });
  if (ctx) blocks.push({ type: 'text', text: ctx });
  blocks.push({ type: 'text', text: params.prompt });
  return blocks;
}

/**
 * Resolve a `requestPermission` call automatically. The widget has no live
 * UI for permission prompts, so the runtime decides each request from two
 * inputs:
 *
 *   1. `permissionMode` — operator-level kill switch. `bypassPermissions`
 *      unconditionally allows. `plan` / `default` unconditionally cancel
 *      (plan is read-only; default lacks a prompt surface). Other modes
 *      defer to the policy.
 *   2. `policy` — per-action-category resolution. The ACP `ToolKind` of
 *      the inbound `toolCall` is collapsed into one of four buckets
 *      (`fileEdit`, `bash`, `webFetch`, `mcpTool`) and the matching
 *      {@link PermissionResolution} drives the outcome:
 *
 *        - `'auto'` → select the lowest-scoped allow option.
 *        - `'ask'`  → cancelled outcome (no UI to ask).
 *        - `'deny'` → select a reject option when offered, else cancel.
 *
 * Pure-read kinds (`read | search | think | switch_mode`) are always
 * auto-allowed regardless of policy — the agent cannot make progress
 * without them and they have no write/network/process side effects.
 */
export function decidePermission(
  request: RequestPermissionRequest,
  permissionMode: AcpRunParams['permissionMode'],
  policy: PermissionPolicy = DEFAULT_PERMISSION_POLICY,
): RequestPermissionResponse {
  if (permissionMode === 'bypassPermissions') {
    return allowResponse(request.options);
  }
  if (permissionMode !== 'acceptEdits' && permissionMode !== 'dontAsk') {
    // `plan` and `default` — no decision surface for this transport.
    return { outcome: { outcome: 'cancelled' } };
  }

  const category = categorizeToolKind(request.toolCall.kind ?? null);
  if (category === 'safeRead') {
    return allowResponse(request.options);
  }

  switch (policy[category]) {
    case 'auto':
      return allowResponse(request.options);
    case 'deny':
      return rejectResponse(request.options);
    case 'ask':
    default:
      return { outcome: { outcome: 'cancelled' } };
  }
}

function allowResponse(options: readonly PermissionOption[]): RequestPermissionResponse {
  const option = pickAllowOption(options);
  if (!option) {
    return { outcome: { outcome: 'cancelled' } };
  }
  return { outcome: { outcome: 'selected', optionId: option.optionId } };
}

function rejectResponse(options: readonly PermissionOption[]): RequestPermissionResponse {
  const option = pickRejectOption(options);
  if (!option) {
    return { outcome: { outcome: 'cancelled' } };
  }
  return { outcome: { outcome: 'selected', optionId: option.optionId } };
}

function pickAllowOption(options: readonly PermissionOption[]): PermissionOption | undefined {
  return (
    options.find((o) => o.kind === 'allow_once') ?? options.find((o) => o.kind === 'allow_always')
  );
}

function pickRejectOption(options: readonly PermissionOption[]): PermissionOption | undefined {
  return (
    options.find((o) => o.kind === 'reject_once') ?? options.find((o) => o.kind === 'reject_always')
  );
}

async function shutdownProcess(handle: AcpSpawnHandle, killGracePeriodMs: number): Promise<void> {
  const exited = handle.exited.catch(() => undefined);
  const timeout = new Promise<'timeout'>((resolve) =>
    setTimeout(() => resolve('timeout'), killGracePeriodMs),
  );
  const outcome = await Promise.race([exited.then(() => 'exited' as const), timeout]);
  if (outcome === 'timeout') {
    try {
      handle.kill();
    } catch {
      // best-effort
    }
    await exited;
  }
}

/**
 * Narrow a raw ACP `sessionUpdate` payload to its advertised command list.
 * Returns the `availableCommands` array when the update is an
 * `available_commands_update`, else null. Defensive narrowing: the runtime
 * receives the update as `unknown` from the protocol seam, so each field is
 * checked rather than cast.
 */
function extractAvailableCommands(update: unknown): AcpAvailableCommand[] | null {
  if (typeof update !== 'object' || update === null) return null;
  const u = update as Record<string, unknown>;
  if (u.sessionUpdate !== 'available_commands_update') return null;
  if (!Array.isArray(u.availableCommands)) return [];
  const out: AcpAvailableCommand[] = [];
  for (const entry of u.availableCommands) {
    if (typeof entry !== 'object' || entry === null) continue;
    const e = entry as Record<string, unknown>;
    const name = typeof e.name === 'string' ? e.name : '';
    if (name.length === 0) continue;
    const description = typeof e.description === 'string' ? e.description : '';
    const command: AcpAvailableCommand = { name, description };
    if (typeof e.input === 'object' && e.input !== null) {
      const hint = (e.input as Record<string, unknown>).hint;
      if (typeof hint === 'string' && hint.length > 0) command.input = { hint };
    }
    out.push(command);
  }
  return out;
}

function toErrorPayload(error: unknown): { name: string; message: string } {
  return {
    name: error instanceof Error ? error.name : 'Error',
    message: error instanceof Error ? error.message : String(error),
  };
}

/**
 * Production spawner. Locates the ACP agent binary via Node's resolver so we
 * don't depend on `.bin/` PATH layout (which differs across pnpm/npm/yarn).
 */
function defaultSpawnAgent(): AcpSpawnHandle {
  const require = createRequire(import.meta.url);
  // The package's `bin.claude-agent-acp` field points at `dist/index.js`.
  // Resolving that file directly lets us spawn it under the host `node`.
  const binPath = require.resolve('@agentclientprotocol/claude-agent-acp/dist/index.js');
  const child = spawn(process.execPath, [binPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  child.stderr?.on('data', (chunk: Buffer): void => {
    process.stderr.write(`[acp-child] ${chunk.toString()}`);
  });
  return {
    writable: Writable.toWeb(child.stdin) as WritableStream<Uint8Array>,
    readable: Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>,
    kill: () => {
      if (!child.killed) child.kill('SIGTERM');
    },
    exited: new Promise<void>((resolve) => {
      child.once('exit', () => resolve());
    }),
  };
}

/**
 * A minimal async queue: producers `push` events, consumers iterate via
 * `Symbol.asyncIterator`. Closing the queue lets the iterator finish after
 * draining buffered events. Used to bridge the ACP `sessionUpdate` callback
 * (push) into the provider's pull-based async generator.
 */
class EventQueue<T> implements AsyncIterable<T> {
  private buffer: T[] = [];
  private closed = false;
  private waiter: { resolve: () => void } | undefined;

  push(value: T): void {
    if (this.closed) return;
    this.buffer.push(value);
    const w = this.waiter;
    this.waiter = undefined;
    w?.resolve();
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    const w = this.waiter;
    this.waiter = undefined;
    w?.resolve();
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<T, void> {
    while (true) {
      if (this.buffer.length > 0) {
        yield this.buffer.shift() as T;
        continue;
      }
      if (this.closed) return;
      await new Promise<void>((resolve) => {
        this.waiter = { resolve };
      });
    }
  }
}
