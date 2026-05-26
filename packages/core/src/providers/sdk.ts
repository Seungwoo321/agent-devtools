/**
 * SDK provider — bridges `@anthropic-ai/claude-agent-sdk` `query()` into our
 * `AgentStreamFactory` contract.
 *
 * Auth: the SDK reuses `~/.claude` OAuth credentials when neither
 * `ANTHROPIC_API_KEY` nor `ANTHROPIC_AUTH_TOKEN` is set. The host process is
 * expected to have those unset (or the user has opted into API-key billing
 * intentionally). We do NOT mutate the host process env here.
 *
 * Permission mode: forwarded from the request context. `'bypassPermissions'`
 * requires the SDK's `allowDangerouslySkipPermissions: true`, which we set
 * automatically when that mode is chosen — the widget surfaces it only via the
 * settings panel, not the chat composer.
 *
 * Cwd: when a workspace is configured on the server, its canonical root is
 * passed as the SDK `cwd`. The Claude Code child process inherits the host
 * user's OS file-system permissions — agent-devtools does NOT layer an
 * additional sandbox on top of the SDK. The workspace-bounded `FileTools`
 * (see `../files/`) is a separate handle used by the picker preamble path to
 * read source slices safely; it does not constrain the SDK's own tool calls.
 *
 * Streaming: SDK messages are translated into the ACP envelope wire format
 * (`acp.session_update | acp.result | acp.error`) before yielding, so the
 * widget's single stream decoder works for every registered provider. The
 * translation lives in `./sdk-to-acp.ts`.
 */
import {
  query as defaultQuery,
  type CanUseTool,
  type Options as SdkOptions,
  type PermissionResult,
  type Query as SdkQuery,
} from '@anthropic-ai/claude-agent-sdk';
import type { AgentStreamFactory } from '../server/app.js';
import {
  DEFAULT_PERMISSION_POLICY,
  type PermissionPolicy,
  type PermissionResolution,
} from './acp.js';
import { formatContextPreamble } from './context-preamble.js';
import { translateSdkMessage, type AcpEnvelope } from './sdk-to-acp.js';

/** Subset of the SDK surface we depend on. Lets tests inject a fake. */
type QueryFn = (params: { prompt: string; options?: SdkOptions }) => SdkQuery;

export interface CreateSdkProviderOptions {
  /** Override the SDK `query()` for tests. Production callers omit this. */
  query?: QueryFn;
  /**
   * Optional path to the Claude Code executable. Forwarded to the SDK as
   * `pathToClaudeCodeExecutable`. Omit to use the SDK's built-in default.
   */
  pathToClaudeCodeExecutable?: string;
  /**
   * Override the per-action permission policy applied to every request.
   * Missing entries fall back to {@link DEFAULT_PERMISSION_POLICY}. A
   * request-scoped `permissionPolicy` on the context takes precedence so
   * the widget's Safe-mode toggle propagates per turn.
   */
  permissionPolicy?: Partial<PermissionPolicy>;
}

export function createSdkProvider(options: CreateSdkProviderOptions = {}): AgentStreamFactory {
  const queryFn: QueryFn = options.query ?? defaultQuery;
  const defaultPolicy = options.permissionPolicy;

  return async function* sdkProvider(request, context) {
    const controller = new AbortController();
    const onAbort = (): void => controller.abort();
    if (context.signal.aborted) {
      controller.abort();
    } else {
      context.signal.addEventListener('abort', onAbort, { once: true });
    }

    const effectivePolicy: PermissionPolicy = {
      ...DEFAULT_PERMISSION_POLICY,
      ...defaultPolicy,
      ...context.permissionPolicy,
    };

    const sdkOptions: SdkOptions = {
      abortController: controller,
      permissionMode: context.permissionMode,
      ...(context.permissionMode === 'bypassPermissions' && {
        allowDangerouslySkipPermissions: true,
      }),
      ...(context.permissionMode !== 'bypassPermissions' && {
        canUseTool: createCanUseTool(effectivePolicy),
      }),
      ...(context.workspace && { cwd: context.workspace.root }),
      ...(options.pathToClaudeCodeExecutable && {
        pathToClaudeCodeExecutable: options.pathToClaudeCodeExecutable,
      }),
    };

    // SDK `query()` is flat-string only — concatenate the picked-element
    // + page-context preamble so the agent sees the same evidence the
    // ACP provider gets through a separate content block.
    let prompt = request.prompt;
    try {
      const preamble = await formatContextPreamble(request.context, {
        ...(context.files !== undefined && { files: context.files }),
      });
      if (preamble) prompt = `${preamble}\n\n${request.prompt}`;
    } catch (error) {
      context.signal.removeEventListener('abort', onAbort);
      yield toErrorEnvelope(error);
      return;
    }

    let stream: SdkQuery;
    try {
      stream = queryFn({ prompt, options: sdkOptions });
    } catch (error) {
      context.signal.removeEventListener('abort', onAbort);
      yield toErrorEnvelope(error);
      return;
    }

    try {
      for await (const message of stream) {
        for (const envelope of translateSdkMessage(message)) {
          yield envelope;
        }
      }
    } catch (error) {
      // AbortError is expected when the HTTP client disconnects; surface a
      // structured ACP envelope rather than letting the SSE pump translate
      // it into an opaque untyped frame.
      yield toErrorEnvelope(error);
    } finally {
      context.signal.removeEventListener('abort', onAbort);
    }
  };
}

function toErrorEnvelope(error: unknown): AcpEnvelope {
  const name = error instanceof Error ? error.name : 'Error';
  const message = error instanceof Error ? error.message : String(error);
  return { type: 'acp.error', error: { name, message } };
}

/**
 * SDK provider parity with the ACP runtime's `decidePermission`. The SDK
 * `canUseTool` callback receives a tool *name* (string) rather than an ACP
 * `ToolKind`, so we map Claude Code's built-in tool names to the same four
 * categories. MCP-served tools (`mcp__<server>__<tool>`) bucket into
 * `mcpTool` so the conservative default ('ask') applies.
 *
 * `'auto'` allows the call with the SDK's `input` passed through unchanged.
 * `'ask'` denies with an explanatory message — the widget has no live UI
 *   for permission prompts in this transport, so deferring is the only safe
 *   resolution. The user can re-issue with a more permissive
 *   `permissionMode` (e.g. `'bypassPermissions'`) or by toggling Safe mode.
 * `'deny'` denies with `interrupt: true` so the SDK halts the turn instead
 *   of letting the agent retry with adjusted input.
 */
function createCanUseTool(policy: PermissionPolicy): CanUseTool {
  return async (toolName, input): Promise<PermissionResult> => {
    const category = categorizeSdkToolName(toolName);
    if (category === 'safeRead') {
      return { behavior: 'allow', updatedInput: input };
    }
    const resolution: PermissionResolution = policy[category];
    switch (resolution) {
      case 'auto':
        return { behavior: 'allow', updatedInput: input };
      case 'deny':
        return {
          behavior: 'deny',
          message: `${toolName} is denied by the active permission policy.`,
          interrupt: true,
        };
      case 'ask':
      default:
        return {
          behavior: 'deny',
          message: `${toolName} requires explicit permission; toggle Safe mode off or set permissionPolicy.${category} to 'auto' to allow it.`,
        };
    }
  };
}

type SdkPermissionCategory = keyof PermissionPolicy | 'safeRead';

/**
 * Map a Claude Code SDK tool name into the same security buckets the ACP
 * runtime uses. Built-in tool names are stable enough to enumerate; anything
 * unrecognized falls through to `mcpTool` so third-party MCP tools (which
 * arrive as `mcp__<server>__<tool>`) inherit the conservative default.
 */
function categorizeSdkToolName(toolName: string): SdkPermissionCategory {
  switch (toolName) {
    case 'Read':
    case 'Glob':
    case 'Grep':
    case 'WebSearch':
    case 'NotebookRead':
    case 'TodoWrite':
      return 'safeRead';
    case 'Edit':
    case 'Write':
    case 'NotebookEdit':
    case 'MultiEdit':
      return 'fileEdit';
    case 'Bash':
    case 'BashOutput':
    case 'KillBash':
      return 'bash';
    case 'WebFetch':
      return 'webFetch';
    default:
      // Unknown / MCP tools (`mcp__<server>__<tool>`) bucket into `mcpTool`
      // so they inherit the conservative MCP default ('ask') rather than
      // silently running.
      return 'mcpTool';
  }
}
