import type { IncomingMessage, ServerResponse } from 'node:http';
import { verifyAuthorization } from './auth.js';
import { createFileTools, type FileTools, type Workspace } from '../files/index.js';
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
 *     Agent Client Protocol (Zed's `@zed-industries/claude-code-acp`).
 *     Uses the local `~/.claude` OAuth credentials. Stable until the
 *     in-process SDK path is officially supported.
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
}

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
}

export type AgentStreamFactory = (
  request: AgentStreamRequest,
  context: AgentRequestContext,
) => AsyncIterable<unknown>;

export interface AppOptions {
  /**
   * Registered runtime providers. Map of `ProviderId` → factory. If empty,
   * `/v1/agent/stream` returns 501. The widget's chat composer chooses one
   * per request; if its choice is not registered the route returns 422.
   */
  providers?: Partial<Record<ProviderId, AgentStreamFactory>>;
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
}

const DEFAULT_MAX_BODY = 1 * 1024 * 1024;

export function createApp(options: AppOptions = {}) {
  const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY;
  const toEvent = options.toEvent;
  const workspace = options.workspace;
  const files = workspace ? createFileTools(workspace) : undefined;
  const providers = options.providers ?? {};
  const defaultProvider: ProviderId = options.defaultProvider ?? 'acp';
  const defaultPermissionMode: PermissionMode = options.defaultPermissionMode ?? 'acceptEdits';
  const writeArtifact = options.writeHandoffArtifact ?? writeHandoffArtifact;

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
      }),
    );
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

    const writer = startSse(res);
    const iterable = factory(body, {
      signal,
      ...(workspace !== undefined && { workspace }),
      ...(files !== undefined && { files }),
      permissionMode: requestedPermissionMode,
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

    let artifact: HandoffArtifact;
    try {
      artifact = await writeArtifact(validation.payload, {
        ...(workspace !== undefined && { workspaceRoot: workspace.root }),
        ...(files !== undefined && { files }),
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
    res.end(JSON.stringify({ file: artifact.file, command: artifact.command }));
  };

  const router = createRouter([
    { method: 'GET', path: '/health', handler: healthRoute },
    { method: 'GET', path: '/v1/agent/info', handler: agentInfoRoute },
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
}

type HandoffValidation =
  | { ok: true; payload: HandoffRequestPayload }
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

  return {
    ok: true,
    payload: {
      conversation,
      permissionMode,
      ...(body.picked !== undefined && { picked: body.picked }),
      ...(body.pageContext !== undefined && { pageContext: body.pageContext }),
    },
  };
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
