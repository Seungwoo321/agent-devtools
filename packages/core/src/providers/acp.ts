/**
 * ACP provider — bridges the Agent Client Protocol
 * (`@agentclientprotocol/claude-agent-acp` agent + `@agentclientprotocol/sdk`
 * client) into our `AgentStreamFactory` contract.
 *
 * Architecture:
 *
 *   - The ACP agent runs as a long-lived child process; the provider acts
 *     as the ACP "client" (the editor side). Stdio carries newline-
 *     delimited JSON-RPC.
 *   - For testability and to keep the provider focused on protocol → SSE
 *     translation, all child-process and connection wiring is delegated to
 *     an injectable `AcpRuntime`. The default runtime lives in
 *     `./acp-runtime.ts`; it pools children + sessions so the second turn
 *     reuses the same conversation. Tests pass a hermetic in-memory runtime.
 *
 * Session identity:
 *
 *   The widget sends an opaque `clientSessionId` (one per browser tab) on
 *   every request. The runtime maps that to an ACP `sessionId`; the same
 *   tab reuses the same agent session across turns so history is
 *   preserved. A missing `clientSessionId` (legacy callers / curl) falls
 *   back to a per-request UUID — effectively no history — rather than
 *   error.
 *
 * Permission policy:
 *
 *   The widget user is not at the terminal, so we cannot surface a UI for
 *   live permission prompts (ACP `session/request_permission`). The runtime
 *   resolves each request from two inputs:
 *
 *     1. The resolved `permissionMode`. `bypassPermissions` is the only
 *        mode that unconditionally allows every action — used when the
 *        operator has explicitly opted out of safe-by-default.
 *     2. Otherwise, a {@link PermissionPolicy} keyed by action category
 *        decides per `ToolKind` whether to auto-allow, defer (cancelled),
 *        or explicitly reject. The default policy auto-allows workspace
 *        file edits and defers shell / web-fetch / MCP-tool calls so that
 *        the dev-time widget never silently runs untrusted side effects.
 *
 *   `plan` / `default` modes still cancel every request — `plan` is
 *   read-only and `default` has no prompt surface in this transport.
 */
import type { StopReason, Usage } from '@agentclientprotocol/sdk';
import type { FileTools } from '../files/index.js';
import type { AgentStreamFactory } from '../server/app.js';
import { createDefaultAcpRuntime } from './acp-runtime.js';

/**
 * The shape the provider consumes. Yielded by an `AcpRuntime` for each
 * turn — exactly one of these per stream event.
 */
export type AcpEvent =
  | { kind: 'notification'; sessionUpdate: unknown }
  | { kind: 'result'; stopReason: StopReason; usage?: Usage | null }
  | { kind: 'error'; error: { name: string; message: string } };

/** Injection seam for the protocol layer. Default implementation spawns the binary. */
export interface AcpRuntime {
  /**
   * Run one prompt turn against the ACP agent. Yields events until either
   * a `result` (the turn finished cleanly) or an `error` (the turn or the
   * underlying transport failed). Must clean up per-run state when the
   * iterator is closed (consumer aborts, etc) — but in pooled
   * implementations the underlying child + session are kept alive.
   */
  run(params: AcpRunParams): AsyncIterable<AcpEvent>;
}

/**
 * Resolution strategy for one action category when the agent asks for
 * permission. The widget has no live UI to prompt the user, so the runtime
 * collapses `'ask'` into a cancelled outcome — the user can re-issue with a
 * more permissive `permissionMode` (or by toggling Safe mode in the widget).
 *
 *   - `'auto'`  — silently allow (the runtime selects the lowest-scoped
 *                 allow option).
 *   - `'ask'`   — cancelled outcome (no UI to ask, so the agent backs off).
 *   - `'deny'`  — explicit reject (runtime selects a `reject_once` option
 *                 when offered).
 */
export type PermissionResolution = 'auto' | 'ask' | 'deny';

/**
 * Per-action-category resolution. The four categories collapse the ACP
 * `ToolKind` enum into the security buckets we care about:
 *
 *   - `fileEdit` — `edit | delete | move` (workspace mutations).
 *   - `bash`     — `execute` (shell side-effects).
 *   - `webFetch` — `fetch` (outbound network).
 *   - `mcpTool`  — `other` and any unrecognized kind (third-party tools).
 *
 * Pure-read kinds (`read | search | think | switch_mode`) are always
 * auto-allowed because the agent cannot make progress without them and
 * they have no external side effects.
 */
export interface PermissionPolicy {
  fileEdit: PermissionResolution;
  bash: PermissionResolution;
  webFetch: PermissionResolution;
  mcpTool: PermissionResolution;
}

/** Safe-by-default policy: only workspace file edits run unattended. */
export const DEFAULT_PERMISSION_POLICY: PermissionPolicy = Object.freeze({
  fileEdit: 'auto',
  bash: 'ask',
  webFetch: 'ask',
  mcpTool: 'ask',
});

export interface AcpRunParams {
  prompt: string;
  /** Workspace root used as the session `cwd`. Required by ACP `newSession`. */
  cwd: string;
  /**
   * Stable identifier for the calling widget instance (one per browser
   * tab). Used as the pool key so subsequent turns from the same tab
   * reuse the same ACP session and therefore see prior conversation.
   */
  clientSessionId: string;
  /** Forwarded so the runtime can auto-resolve permission requests. */
  permissionMode: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | 'dontAsk';
  /**
   * Per-action policy applied when `permissionMode` is anything other than
   * `bypassPermissions`. Missing entries fall back to
   * {@link DEFAULT_PERMISSION_POLICY}. `bypassPermissions` ignores the
   * policy entirely and always allows.
   */
  permissionPolicy?: Partial<PermissionPolicy>;
  /**
   * Request-scoped context (picked element, page context) the widget
   * sends with each prompt. Rendered into a preamble content block by
   * the runtime so the model sees it as part of the user turn.
   */
  context?: unknown;
  /**
   * Workspace-bound file reader. When set, the runtime inlines source
   * slices for each named component in the picked element's chain so
   * short prompts like "explain this" have enough grounding without a
   * follow-up Read tool call. Omitted when no workspace is configured.
   */
  files?: FileTools;
  /** Aborts when the HTTP client disconnects. The runtime must propagate this. */
  signal: AbortSignal;
}

export interface CreateAcpProviderOptions {
  /** Override the default child-process runtime (used by tests). */
  runtime?: AcpRuntime;
  /**
   * Generate the fallback `clientSessionId` when the request omits one.
   * Defaults to `crypto.randomUUID()`. Tests override to keep IDs stable.
   */
  generateSessionId?: () => string;
  /**
   * Override the per-action permission policy applied to every request.
   * Missing entries fall back to {@link DEFAULT_PERMISSION_POLICY}.
   */
  permissionPolicy?: Partial<PermissionPolicy>;
}

export function createAcpProvider(options: CreateAcpProviderOptions = {}): AgentStreamFactory {
  const runtime = options.runtime ?? createDefaultAcpRuntime();
  const generateSessionId = options.generateSessionId ?? defaultGenerateSessionId;
  const permissionPolicy = options.permissionPolicy;

  return async function* acpProvider(request, context) {
    if (!context.workspace) {
      yield {
        type: 'acp.error',
        error: {
          name: 'AcpConfigurationError',
          message:
            'ACP provider requires a workspace; configure one on the server (the Vite plugin does this by default).',
        },
      };
      return;
    }

    const requestedClientSessionId = readClientSessionId(request);
    const events = runtime.run({
      prompt: request.prompt,
      cwd: context.workspace.root,
      clientSessionId: requestedClientSessionId ?? generateSessionId(),
      permissionMode: context.permissionMode,
      ...(permissionPolicy !== undefined && { permissionPolicy }),
      ...(request.context !== undefined && { context: request.context }),
      ...(context.files !== undefined && { files: context.files }),
      signal: context.signal,
    });

    try {
      for await (const event of events) {
        yield toDomainEvent(event);
      }
    } catch (error) {
      yield toErrorEvent(error);
    }
  };
}

function readClientSessionId(request: { clientSessionId?: unknown }): string | undefined {
  const v = request.clientSessionId;
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function defaultGenerateSessionId(): string {
  return globalThis.crypto.randomUUID();
}

function toDomainEvent(event: AcpEvent): unknown {
  switch (event.kind) {
    case 'notification':
      // Forward the raw ACP session update; the widget renders by inspecting
      // its `sessionUpdate` discriminator. Wrapped with a stable envelope so
      // future event kinds can coexist on the same SSE channel.
      return { type: 'acp.session_update', update: event.sessionUpdate };
    case 'result':
      return {
        type: 'acp.result',
        stopReason: event.stopReason,
        ...(event.usage !== undefined && event.usage !== null && { usage: event.usage }),
      };
    case 'error':
      return { type: 'acp.error', error: event.error };
  }
}

function toErrorEvent(error: unknown): {
  type: 'acp.error';
  error: { name: string; message: string };
} {
  const name = error instanceof Error ? error.name : 'Error';
  const message = error instanceof Error ? error.message : String(error);
  return { type: 'acp.error', error: { name, message } };
}
