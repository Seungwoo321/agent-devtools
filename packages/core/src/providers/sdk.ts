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
import type { AgentStreamFactory, AvailableCommand, CommandLister } from '../server/app.js';
import {
  DEFAULT_PERMISSION_POLICY,
  type PermissionPolicy,
  type PermissionResolution,
} from './acp.js';
import { formatContextPreamble } from './context-preamble.js';
import { categorizeSdkToolName } from './permission-category.js';
import {
  buildAvailableCommandsEnvelope,
  mapToAvailableCommands,
  translateSdkMessage,
  type AcpEnvelope,
} from './sdk-to-acp.js';

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
      // Terminal parity. `claude -p` runs with the full Claude Code system
      // prompt; the Agent SDK, when `systemPrompt` is omitted, falls back to a
      // *minimal* default that drops Claude Code's identity. On the
      // subscription / model endpoint that minimal request is rejected with
      // "400 role 'system' is not supported on this model" — the exact error
      // dogfooding surfaced. Opting into the `claude_code` preset sends the
      // same prompt the terminal sends, restoring parity.
      systemPrompt: { type: 'preset', preset: 'claude_code' },
      // Pin the filesystem setting sources. The SDK default already loads all
      // sources (matching the CLI), but that default is version-dependent;
      // were it ever flipped to isolation mode (`[]`), the project CLAUDE.md
      // context would silently vanish and dogfooding parity would regress.
      // `'project'` is required for CLAUDE.md to load.
      settingSources: ['user', 'project', 'local'],
      // Terminal-parity model selection. The SDK `model` option takes the same
      // aliases the terminal's `/model` menu uses (`opus`, `sonnet`, `haiku`)
      // or a full model id, and resolves them against the account's real
      // models. Omitted when the request carries no model, so the SDK falls
      // back to the CLI default — matching the widget's `Default` choice.
      ...(context.model !== undefined && { model: context.model }),
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

    let commandsEmitted = false;
    try {
      for await (const message of stream) {
        // Surface the agent's available slash commands once. The system/init
        // message names them but carries no descriptions or argument hints, so
        // we ask the running query for the rich list (`supportedCommands()`,
        // which returns `{ name, description, argumentHint }`). The SDK
        // demultiplexes that control response from the message stream in its
        // own reader, so awaiting here resolves even while paused inside this
        // loop. On rejection (or empty), fall back to the init names with empty
        // descriptions and no hints — never throw, never block the turn.
        if (!commandsEmitted && isSystemInitMessage(message)) {
          commandsEmitted = true;
          yield await resolveAvailableCommands(stream, message);
        }
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

export interface CreateSdkCommandListerOptions {
  /** Override the SDK `query()` for tests. Production callers omit this. */
  query?: QueryFn;
  /**
   * Optional path to the Claude Code executable, forwarded to the SDK as
   * `pathToClaudeCodeExecutable`. Omit to use the SDK's built-in default.
   */
  pathToClaudeCodeExecutable?: string;
}

/**
 * Build the model-free command lister for the SDK provider. Backs
 * `GET /v1/agent/commands`.
 *
 * `Query.supportedCommands()` is a CONTROL call — it asks the running Claude
 * Code child for its slash command catalogue without sending a prompt turn,
 * so it spends no credit. We open a short-lived `query()` purely to obtain
 * the control channel, await `supportedCommands()`, then tear the query down
 * (`abort()` + generator `return()`) WITHOUT iterating its message stream, so
 * the model is never engaged. Any failure resolves to an empty list — the
 * route depends on a graceful empty.
 */
export function createSdkCommandLister(options: CreateSdkCommandListerOptions = {}): CommandLister {
  const queryFn: QueryFn = options.query ?? defaultQuery;
  return async ({ cwd, signal }): Promise<AvailableCommand[]> => {
    const controller = new AbortController();
    const onAbort = (): void => controller.abort();
    if (signal.aborted) {
      controller.abort();
    } else {
      signal.addEventListener('abort', onAbort, { once: true });
    }

    const sdkOptions: SdkOptions = {
      abortController: controller,
      systemPrompt: { type: 'preset', preset: 'claude_code' },
      settingSources: ['user', 'project', 'local'],
      ...(cwd !== undefined && { cwd }),
      ...(options.pathToClaudeCodeExecutable && {
        pathToClaudeCodeExecutable: options.pathToClaudeCodeExecutable,
      }),
    };

    let stream: SdkQuery | undefined;
    try {
      // The prompt is never consumed: we ask for the command catalogue over
      // the control channel and tear the query down before iterating, so the
      // model never runs this prompt.
      stream = queryFn({ prompt: '', options: sdkOptions });
      const commands = await stream.supportedCommands();
      return mapToAvailableCommands(commands);
    } catch {
      return [];
    } finally {
      signal.removeEventListener('abort', onAbort);
      // Best-effort teardown of the short-lived query so the child process
      // and control channel are released. Both calls are guarded — a fake
      // query in tests may not implement them.
      try {
        controller.abort();
      } catch {
        // ignore
      }
      try {
        await stream?.return?.(undefined);
      } catch {
        // ignore
      }
    }
  };
}

/** Narrow an SDK stream message to the system/init variant. */
function isSystemInitMessage(message: unknown): message is { slash_commands?: unknown } {
  if (typeof message !== 'object' || message === null) return false;
  const m = message as Record<string, unknown>;
  return m.type === 'system' && m.subtype === 'init';
}

/**
 * Build the `available_commands_update` envelope for the current query.
 *
 * Primary source: `supportedCommands()` — the rich list with descriptions and
 * argument hints. If it rejects (older runtime, control-channel failure), fall
 * back to the init message's `slash_commands: string[]` names with empty
 * descriptions and no hints. Failure here must never abort the turn, so a
 * rejecting/throwing call degrades to the name-only envelope.
 */
async function resolveAvailableCommands(
  stream: SdkQuery,
  initMessage: { slash_commands?: unknown },
): Promise<AcpEnvelope> {
  try {
    const commands = await stream.supportedCommands();
    return buildAvailableCommandsEnvelope(commands);
  } catch {
    const names = Array.isArray(initMessage.slash_commands) ? initMessage.slash_commands : [];
    const fallback = names
      .filter((name): name is string => typeof name === 'string')
      .map((name) => ({ name, description: '', argumentHint: '' }));
    return buildAvailableCommandsEnvelope(fallback);
  }
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
