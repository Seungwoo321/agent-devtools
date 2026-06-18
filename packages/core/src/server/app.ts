import type { IncomingMessage, ServerResponse } from 'node:http';
import { verifyAuthorization } from './auth.js';
import { createFileTools, type FileTools, type Workspace } from '../files/index.js';
import type { PermissionPolicy, PermissionResolution } from '../providers/acp.js';
import type { AcpSessionStore } from '../providers/acp-session-store.js';
import {
  writeHandoffArtifact,
  type HandoffArtifact,
  type HandoffRequestPayload,
  type HandoffTurn,
  type WriteHandoffArtifactOptions,
} from './handoff.js';
import { createRouter, type RouteHandler } from './router.js';
import { pumpToSse, startSse, type SseEvent } from './sse.js';

/**
 * Identifier for which agent runtime should service a given request. We
 * support two from the start because the public-facing contract (browser
 * widget) lets users pick the runtime per chat:
 *
 *   - `'acp'` (default) — out-of-process Claude Code agent reached via the
 *     Agent Client Protocol (`@agentclientprotocol/claude-agent-acp`,
 *     spawned under the host `node` from `acp-runtime.ts`). Uses the local
 *     `~/.claude` OAuth credentials. Stable until the in-process SDK path
 *     is officially supported.
 *   - `'sdk'` — in-process `@anthropic-ai/claude-agent-sdk`. Faster cold
 *     start; relies on the SDK's (currently unofficial but working)
 *     ~/.claude credentials reuse.
 */
export type ProviderId = 'acp' | 'sdk';

export const PROVIDER_IDS: readonly ProviderId[] = ['acp', 'sdk'];

/**
 * Maps to Claude Code's permission modes. Forwarded verbatim to the SDK /
 * ACP layer. Default `'acceptEdits'` because the widget user is not at the
 * terminal — there is no way to surface an interactive permission prompt
 * for routine file edits. Bash / web fetch still require explicit consent
 * in this mode. `'bypassPermissions'` is exposed only via the widget's
 * settings panel (not the chat composer).
 */
export type PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | 'dontAsk';

export const PERMISSION_MODES: readonly PermissionMode[] = [
  'default',
  'acceptEdits',
  'bypassPermissions',
  'plan',
  'dontAsk',
];

export interface AgentStreamRequest {
  prompt: string;
  context?: unknown;
  /**
   * Stable identifier the widget mints once per browser tab and sends on
   * every turn so the provider can reuse the same agent session and
   * preserve conversation history. Optional for non-widget callers
   * (curl, scripts) — the provider falls back to a per-request UUID,
   * which means no history.
   */
  clientSessionId?: string;
  /** Which provider runtime to use. Defaults to `AppOptions.defaultProvider`. */
  provider?: ProviderId;
  /** Permission mode forwarded to the runtime. Defaults to `AppOptions.defaultPermissionMode`. */
  permissionMode?: PermissionMode;
  /**
   * Per-action permission policy forwarded to the runtime. Each category
   * (`fileEdit`, `bash`, `webFetch`, `mcpTool`) accepts `'auto' | 'ask' | 'deny'`.
   * Overrides `AppOptions.defaultPermissionPolicy` on a per-request basis so
   * the widget's Safe-mode toggle can travel end-to-end without restarting
   * the dev server.
   */
  permissionPolicy?: PermissionPolicy;
  /**
   * Model the runtime should use for this turn, e.g. a Claude Code alias
   * (`'opus'`, `'sonnet'`, `'haiku'`) or a full model id. Both providers
   * resolve aliases against the account's real models through the same
   * Claude Agent SDK resolver the terminal uses, so the widget's model menu
   * mirrors the terminal's. Omitted means "use the provider's default model"
   * — the widget sends nothing for its `Default` choice. Non-widget callers
   * may pass any model string; the server validates only that it is a
   * non-empty string and leaves semantic resolution to the provider.
   */
  model?: string;
}

const PERMISSION_POLICY_KEYS: readonly (keyof PermissionPolicy)[] = [
  'fileEdit',
  'bash',
  'webFetch',
  'mcpTool',
];

const PERMISSION_RESOLUTIONS: readonly PermissionResolution[] = ['auto', 'ask', 'deny'];

/**
 * Per-request context handed to the agent factory.
 *
 *   - `signal` aborts when the HTTP client disconnects.
 *   - `workspace` / `files` are provided when the CLI is wired with a workspace
 *     root; they are the only sanctioned handles for file I/O.
 *   - `permissionMode` is the resolved (request-or-default) mode the runtime
 *     should enforce.
 */
export interface AgentRequestContext {
  signal: AbortSignal;
  workspace?: Workspace;
  files?: FileTools;
  permissionMode: PermissionMode;
  /**
   * Resolved per-action policy for this turn. Present when the request body
   * carried a `permissionPolicy`, or when the server was started with a
   * `defaultPermissionPolicy`. Absent when neither was supplied — the
   * provider then falls back to its own safe-by-default policy.
   */
  permissionPolicy?: PermissionPolicy;
  /**
   * Resolved model for this turn, forwarded verbatim to the provider. Present
   * when the request body carried a non-empty `model`; absent otherwise, in
   * which case the provider uses its own default model.
   */
  model?: string;
}

export type AgentStreamFactory = (
  request: AgentStreamRequest,
  context: AgentRequestContext,
) => AsyncIterable<unknown>;

/**
 * The widget-facing slash command shape. Mirrors the ACP `AvailableCommand`
 * (`@agentclientprotocol/sdk`) so the widget reuses its existing
 * `available_commands_update` decoder for the prefetch path — `argumentHint`
 * (SDK) is already normalized into `input.hint` by the lister, so listers
 * always return this shape regardless of their native provider vocabulary.
 */
export interface AvailableCommand {
  name: string;
  description: string;
  input?: { hint: string };
}

/**
 * Reads a workspace's slash command catalogue WITHOUT invoking the model.
 * Both providers expose a model-free control path for this:
 *   - ACP: the agent advertises `available_commands_update` right after
 *     `newSession({cwd})`, no prompt required (verified empirically).
 *   - SDK: `Query.supportedCommands()` is a control call that resolves
 *     without a model turn.
 * The lister must resolve gracefully (empty list, never throw out) so the
 * `GET /v1/agent/commands` route can always answer the widget's prefetch.
 */
export type CommandLister = (ctx: {
  cwd?: string;
  signal: AbortSignal;
}) => Promise<AvailableCommand[]>;

export interface AppOptions {
  /**
   * Registered runtime providers. Map of `ProviderId` → factory. If empty,
   * `/v1/agent/stream` returns 501. The widget's chat composer chooses one
   * per request; if its choice is not registered the route returns 422.
   */
  providers?: Partial<Record<ProviderId, AgentStreamFactory>>;
  /**
   * Optional parallel registry of model-free command listers, keyed by the
   * same `ProviderId` as `providers`. Backs `GET /v1/agent/commands` so the
   * widget can prefetch the slash command catalogue at mount and offer
   * autocomplete on the first keystroke — before any conversation. Kept
   * separate from `providers` so the existing `AgentStreamFactory` contract
   * is untouched; a provider may register a stream factory without a lister
   * (the route then returns an empty list for it).
   */
  commandListers?: Partial<Record<ProviderId, CommandLister>>;
  /**
   * Provider used when the request body omits `provider`. Defaults to
   * `'acp'`. Must be a key in `providers` if `providers` is non-empty.
   */
  defaultProvider?: ProviderId;
  /**
   * Permission mode used when the request body omits `permissionMode`.
   * Defaults to `'acceptEdits'`.
   */
  defaultPermissionMode?: PermissionMode;
  /**
   * Per-action permission policy used when the request body omits
   * `permissionPolicy`. When unset the provider applies its own safe-by-
   * default policy ({@link DEFAULT_PERMISSION_POLICY}). Surfaced on
   * `GET /v1/agent/info` so the widget settings panel can mount in sync
   * with the server's baseline.
   */
  defaultPermissionPolicy?: PermissionPolicy;
  /** Cap on request body size (bytes). Default 1 MiB. */
  maxBodyBytes?: number;
  /**
   * Map a domain stream item to the SSE event shape. Default: `{ event: 'message', data: item }`.
   * The factory can override via the `event` field on the yielded value.
   */
  toEvent?: (item: unknown) => SseEvent;
  /**
   * Required `Authorization: Bearer <token>` value. When set, every route returns
   * 401 unless the header matches. Generated and held by the CLI; omitted only
   * by tests that exercise the bare router.
   */
  pairingToken?: string;
  /**
   * Workspace root the agent factory may read/edit within. When set, FileTools
   * is built from it and passed alongside the request context, so the factory
   * can hand them to the LLM as tools.
   */
  workspace?: Workspace;
  /**
   * Override the terminal-handoff artifact writer. The default writes a
   * markdown file under `os.tmpdir()` and returns the path + shell
   * command. Tests inject a recorder so they don't touch the real
   * filesystem.
   */
  writeHandoffArtifact?: (
    payload: HandoffRequestPayload,
    options: WriteHandoffArtifactOptions,
  ) => Promise<HandoffArtifact>;
  /**
   * Optional persistent `(cwd, clientSessionId) → acpSessionId` store.
   * When set together with a `workspace`, the handoff route looks up
   * the ACP session id for the widget's current `clientSessionId` and
   * surfaces a `claude --resume <id>` sibling command alongside the
   * always-emitted `--append-system-prompt-file` command. Omitted when
   * the embedder doesn't run the ACP provider or doesn't want to
   * expose resume.
   */
  acpSessionStore?: AcpSessionStore;
}

const DEFAULT_MAX_BODY = 1 * 1024 * 1024;

/**
 * Upper bound on a single command-lister invocation. The ACP path waits for
 * the agent to spawn, run `newSession`, and emit `available_commands_update`,
 * which the probe measured at ~6–7s cold. We give generous headroom but
 * still cap it so a stuck agent never hangs the widget's mount-time prefetch
 * — on timeout the route answers `{ commands: [] }` and the cache stays
 * unpopulated so a later mount can retry.
 */
const COMMAND_LISTER_TIMEOUT_MS = 15_000;

export function createApp(options: AppOptions = {}) {
  const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY;
  const toEvent = options.toEvent;
  const workspace = options.workspace;
  const files = workspace ? createFileTools(workspace) : undefined;
  const providers = options.providers ?? {};
  const commandListers = options.commandListers ?? {};
  const defaultProvider: ProviderId = options.defaultProvider ?? 'acp';
  const defaultPermissionMode: PermissionMode = options.defaultPermissionMode ?? 'acceptEdits';
  const defaultPermissionPolicy = options.defaultPermissionPolicy;
  const writeArtifact = options.writeHandoffArtifact ?? writeHandoffArtifact;
  const acpSessionStore = options.acpSessionStore;

  const healthRoute: RouteHandler = ({ res }) => {
    res.statusCode = 200;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ ok: true }));
  };

  // Read-only snapshot consumed by the widget settings panel. Returns the
  // active workspace root, which provider runtimes are actually registered
  // (so the panel can grey out the ones that would 422), and the server's
  // own defaults (so a fresh widget mounts in sync rather than drifting to
  // its own hardcoded baseline).
  const agentInfoRoute: RouteHandler = ({ res }) => {
    res.statusCode = 200;
    res.setHeader('content-type', 'application/json');
    res.end(
      JSON.stringify({
        workspaceRoot: workspace?.root ?? null,
        providers: Object.keys(providers).filter((id): id is ProviderId =>
          PROVIDER_IDS.includes(id as ProviderId),
        ),
        defaultProvider,
        defaultPermissionMode,
        ...(defaultPermissionPolicy !== undefined && { defaultPermissionPolicy }),
      }),
    );
  };

  // Read-only slash command catalogue for the widget's mount-time prefetch.
  // `?provider=<id>` selects the lister (default `defaultProvider`). The
  // workspace cwd is fixed for the server lifetime, so the resolved list is
  // cached per `(provider, cwd)` — repeated mounts (new browser tabs, HMR
  // reloads) hit the cache instead of re-spawning the agent. Only successful
  // resolutions are cached; a failure/timeout returns `{ commands: [] }` and
  // leaves the slot empty so a later mount can retry.
  const commandsCache = new Map<string, AvailableCommand[]>();

  const agentCommandsRoute: RouteHandler = async ({ url, res, signal }) => {
    const requestedProvider = url.searchParams.get('provider') ?? defaultProvider;

    res.setHeader('content-type', 'application/json');

    if (!PROVIDER_IDS.includes(requestedProvider as ProviderId)) {
      // Unknown provider id — graceful empty rather than 422, so a stale
      // widget query string never breaks the mount-time prefetch.
      res.statusCode = 200;
      res.end(JSON.stringify({ commands: [] }));
      return;
    }
    const provider = requestedProvider as ProviderId;

    const cwd = workspace?.root;
    const cacheKey = `${provider} ${cwd ?? ''}`;
    const cached = commandsCache.get(cacheKey);
    if (cached) {
      res.statusCode = 200;
      res.end(JSON.stringify({ commands: cached }));
      return;
    }

    const lister = commandListers[provider];
    let commands: AvailableCommand[] = [];
    if (lister) {
      commands = await runCommandLister(lister, cwd, signal);
      // Cache only a non-empty success — an empty list usually means the
      // lister timed out or failed; caching it would pin the failure for the
      // server lifetime and defeat the retry-on-next-mount intent.
      if (commands.length > 0) commandsCache.set(cacheKey, commands);
    }

    res.statusCode = 200;
    res.end(JSON.stringify({ commands }));
  };

  const agentStreamRoute: RouteHandler = async ({ req, res, signal }) => {
    if (Object.keys(providers).length === 0) {
      res.statusCode = 501;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ error: 'agent stream not configured' }));
      return;
    }

    let body: AgentStreamRequest;
    try {
      body = await readJsonBody<AgentStreamRequest>(req, maxBodyBytes);
    } catch (error) {
      res.statusCode = isPayloadTooLarge(error) ? 413 : 400;
      res.setHeader('content-type', 'application/json');
      const message = error instanceof Error ? error.message : String(error);
      res.end(JSON.stringify({ error: message }));
      return;
    }

    if (typeof body.prompt !== 'string' || body.prompt.length === 0) {
      res.statusCode = 400;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ error: 'prompt is required' }));
      return;
    }

    const requestedProvider: ProviderId = body.provider ?? defaultProvider;
    if (!PROVIDER_IDS.includes(requestedProvider)) {
      res.statusCode = 422;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ error: `unsupported provider: ${String(requestedProvider)}` }));
      return;
    }
    const factory = providers[requestedProvider];
    if (!factory) {
      res.statusCode = 422;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ error: `provider not registered: ${requestedProvider}` }));
      return;
    }

    const requestedPermissionMode: PermissionMode = body.permissionMode ?? defaultPermissionMode;
    if (!PERMISSION_MODES.includes(requestedPermissionMode)) {
      res.statusCode = 422;
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          error: `unsupported permissionMode: ${String(requestedPermissionMode)}`,
        }),
      );
      return;
    }

    let resolvedPolicy: PermissionPolicy | undefined;
    if (body.permissionPolicy !== undefined) {
      const validation = validatePermissionPolicy(body.permissionPolicy);
      if (!validation.ok) {
        res.statusCode = 400;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ error: validation.error }));
        return;
      }
      resolvedPolicy = validation.policy;
    } else if (defaultPermissionPolicy !== undefined) {
      resolvedPolicy = defaultPermissionPolicy;
    }

    // The model set is open (aliases, full date-pinned ids, future tiers) and
    // each provider resolves semantics itself, so the server validates only
    // the shape: a non-empty string. An empty or non-string `model` is a
    // malformed request rather than an unsupported value, hence 400.
    let resolvedModel: string | undefined;
    if (body.model !== undefined) {
      if (typeof body.model !== 'string' || body.model.length === 0) {
        res.statusCode = 400;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ error: 'model must be a non-empty string' }));
        return;
      }
      resolvedModel = body.model;
    }

    const writer = startSse(res);
    const iterable = factory(body, {
      signal,
      ...(workspace !== undefined && { workspace }),
      ...(files !== undefined && { files }),
      permissionMode: requestedPermissionMode,
      ...(resolvedPolicy !== undefined && { permissionPolicy: resolvedPolicy }),
      ...(resolvedModel !== undefined && { model: resolvedModel }),
    });
    await pumpToSse(writer, iterable, toEvent ? { signal, toEvent } : { signal });
  };

  const agentHandoffRoute: RouteHandler = async ({ req, res }) => {
    let body: HandoffRequestBody;
    try {
      body = await readJsonBody<HandoffRequestBody>(req, maxBodyBytes);
    } catch (error) {
      res.statusCode = isPayloadTooLarge(error) ? 413 : 400;
      res.setHeader('content-type', 'application/json');
      const message = error instanceof Error ? error.message : String(error);
      res.end(JSON.stringify({ error: message }));
      return;
    }

    const validation = validateHandoffBody(body, defaultPermissionMode);
    if (!validation.ok) {
      res.statusCode = 400;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ error: validation.error }));
      return;
    }

    // Best-effort `acpSessionId` lookup — failure to find one just means
    // we don't emit the `--resume` sibling command. Any error from the
    // store is swallowed (the store interface itself is best-effort) so
    // the always-emitted `--append-system-prompt-file` path still works
    // when the persisted store file is unreadable or corrupted.
    let acpSessionId: string | undefined;
    if (
      acpSessionStore !== undefined &&
      workspace !== undefined &&
      validation.clientSessionId !== undefined
    ) {
      try {
        acpSessionId = await acpSessionStore.get(workspace.root, validation.clientSessionId);
      } catch {
        acpSessionId = undefined;
      }
    }

    let artifact: HandoffArtifact;
    try {
      artifact = await writeArtifact(validation.payload, {
        ...(workspace !== undefined && { workspaceRoot: workspace.root }),
        ...(files !== undefined && { files }),
        ...(acpSessionId !== undefined && { acpSessionId }),
      });
    } catch (error) {
      res.statusCode = 500;
      res.setHeader('content-type', 'application/json');
      const message = error instanceof Error ? error.message : String(error);
      res.end(JSON.stringify({ error: `handoff failed: ${message}` }));
      return;
    }

    res.statusCode = 200;
    res.setHeader('content-type', 'application/json');
    res.end(
      JSON.stringify({
        file: artifact.file,
        command: artifact.command,
        ...(artifact.resumeCommand !== undefined && { resumeCommand: artifact.resumeCommand }),
      }),
    );
  };

  const router = createRouter([
    { method: 'GET', path: '/health', handler: healthRoute },
    { method: 'GET', path: '/v1/agent/info', handler: agentInfoRoute },
    { method: 'GET', path: '/v1/agent/commands', handler: agentCommandsRoute },
    { method: 'POST', path: '/v1/agent/stream', handler: agentStreamRoute },
    { method: 'POST', path: '/v1/agent/handoff', handler: agentHandoffRoute },
  ]);

  const expectedToken = options.pairingToken;
  if (!expectedToken) return router;

  return async function authenticated(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!verifyAuthorization(req.headers.authorization, expectedToken)) {
      res.statusCode = 401;
      res.setHeader('content-type', 'application/json');
      res.setHeader('www-authenticate', 'Bearer realm="agent-devtools"');
      res.end(JSON.stringify({ error: 'unauthorized' }));
      return;
    }
    await router(req, res);
  };
}

/**
 * Invoke a command lister with a hard timeout and total failure containment.
 * The route must never hang or 500 the widget's mount-time prefetch, so any
 * rejection, throw, or timeout collapses to an empty list. The timeout fires
 * its own `AbortSignal` (chained to the request signal) so the lister can
 * unwind its work (e.g. the SDK short-lived query) rather than leaking it.
 */
async function runCommandLister(
  lister: CommandLister,
  cwd: string | undefined,
  requestSignal: AbortSignal,
): Promise<AvailableCommand[]> {
  const controller = new AbortController();
  const onRequestAbort = (): void => controller.abort();
  if (requestSignal.aborted) {
    controller.abort();
  } else {
    requestSignal.addEventListener('abort', onRequestAbort, { once: true });
  }
  const timer = setTimeout(() => controller.abort(), COMMAND_LISTER_TIMEOUT_MS);
  try {
    const commands = await lister({
      ...(cwd !== undefined && { cwd }),
      signal: controller.signal,
    });
    return Array.isArray(commands) ? commands : [];
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
    requestSignal.removeEventListener('abort', onRequestAbort);
  }
}

class PayloadTooLargeError extends Error {
  constructor(maxBytes: number) {
    super(`request body exceeds ${String(maxBytes)} bytes`);
    this.name = 'PayloadTooLargeError';
  }
}

function isPayloadTooLarge(error: unknown): boolean {
  return error instanceof PayloadTooLargeError;
}

interface HandoffRequestBody {
  conversation?: unknown;
  picked?: unknown;
  pageContext?: unknown;
  permissionMode?: unknown;
  clientSessionId?: unknown;
}

type HandoffValidation =
  | { ok: true; payload: HandoffRequestPayload; clientSessionId?: string }
  | { ok: false; error: string };

function validateHandoffBody(
  body: HandoffRequestBody,
  defaultPermissionMode: PermissionMode,
): HandoffValidation {
  if (!Array.isArray(body.conversation)) {
    return { ok: false, error: 'conversation is required (array of turns)' };
  }
  const conversation: HandoffTurn[] = [];
  for (const entry of body.conversation) {
    if (!entry || typeof entry !== 'object') {
      return { ok: false, error: 'conversation entries must be objects' };
    }
    const e = entry as { role?: unknown; text?: unknown };
    if (e.role !== 'user' && e.role !== 'assistant') {
      return { ok: false, error: "conversation entry.role must be 'user' or 'assistant'" };
    }
    if (typeof e.text !== 'string') {
      return { ok: false, error: 'conversation entry.text must be a string' };
    }
    conversation.push({ role: e.role, text: e.text });
  }

  let permissionMode: PermissionMode = defaultPermissionMode;
  if (body.permissionMode !== undefined) {
    if (
      typeof body.permissionMode !== 'string' ||
      !(PERMISSION_MODES as readonly string[]).includes(body.permissionMode)
    ) {
      return { ok: false, error: `unsupported permissionMode: ${String(body.permissionMode)}` };
    }
    permissionMode = body.permissionMode as PermissionMode;
  }

  let clientSessionId: string | undefined;
  if (body.clientSessionId !== undefined) {
    if (typeof body.clientSessionId !== 'string' || body.clientSessionId.length === 0) {
      return { ok: false, error: 'clientSessionId must be a non-empty string' };
    }
    clientSessionId = body.clientSessionId;
  }

  return {
    ok: true,
    payload: {
      conversation,
      permissionMode,
      ...(body.picked !== undefined && { picked: body.picked }),
      ...(body.pageContext !== undefined && { pageContext: body.pageContext }),
    },
    ...(clientSessionId !== undefined && { clientSessionId }),
  };
}

type PermissionPolicyValidation =
  | { ok: true; policy: PermissionPolicy }
  | { ok: false; error: string };

/**
 * Strict shape check on the request-supplied per-action policy. Accepts only
 * an object whose keys are a subset of {@link PERMISSION_POLICY_KEYS} and
 * whose values are members of {@link PERMISSION_RESOLUTIONS}. Missing keys
 * are tolerated (the runtime's safe-default fills them in) but the four
 * keys must collectively cover every category present in the input — i.e.
 * we reject typos like `webfetch` outright rather than silently dropping
 * them and letting the default mask the misconfiguration.
 */
function validatePermissionPolicy(value: unknown): PermissionPolicyValidation {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, error: 'permissionPolicy must be an object' };
  }
  const policy: Partial<PermissionPolicy> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!(PERMISSION_POLICY_KEYS as readonly string[]).includes(key)) {
      return { ok: false, error: `unsupported permissionPolicy key: ${key}` };
    }
    if (
      typeof entry !== 'string' ||
      !(PERMISSION_RESOLUTIONS as readonly string[]).includes(entry)
    ) {
      return {
        ok: false,
        error: `unsupported permissionPolicy.${key}: ${String(entry)}`,
      };
    }
    policy[key as keyof PermissionPolicy] = entry as PermissionResolution;
  }
  for (const key of PERMISSION_POLICY_KEYS) {
    if (policy[key] === undefined) {
      return { ok: false, error: `permissionPolicy.${key} is required` };
    }
  }
  return { ok: true, policy: policy as PermissionPolicy };
}

async function readJsonBody<T>(req: IncomingMessage, maxBytes: number): Promise<T> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = chunk as Buffer;
    total += buf.length;
    if (total > maxBytes) throw new PayloadTooLargeError(maxBytes);
    chunks.push(buf);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  if (text.length === 0) throw new Error('request body is empty');
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    throw new Error('request body is not valid JSON', { cause: error });
  }
}
