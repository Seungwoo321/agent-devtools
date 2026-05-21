/**
 * Claude Agent SDK Provider
 *
 * Wraps `@anthropic-ai/claude-agent-sdk`'s `query()` (an `AsyncGenerator<SDKMessage>`
 * with an internal tool-execution loop) behind the `SessionProvider` interface.
 * The SDK owns the agent turn loop — this adapter only translates SDK messages
 * into `SessionEvent`s and forwards abort/auth/model configuration.
 *
 * Why not `LLMProvider`? `LLMProvider.chatWithTools` returns ONE turn and expects
 * the strategy to drive the loop; the SDK runs the loop internally. Forcing the
 * SDK behind that signature would either swallow strategy-level controls
 * (`maxTurns`, abort signal) or leak session state through a per-turn API.
 * See `./session-types.ts` for the sibling-provider rationale.
 *
 * Auth: pass `apiKey` for API-key auth, or omit and let the SDK fall back to its
 * own OAuth flow (subscription / Claude Pro/Max). The SDK reads `ANTHROPIC_API_KEY`
 * from the process env when `apiKey` is omitted — the harness does not interpose.
 *
 * The SDK is loaded via dynamic `import` so workspaces that never use this
 * provider don't have to install `@anthropic-ai/claude-agent-sdk` (peer +
 * optional, matching the langgraph integration pattern).
 */

import type {
  SessionProvider,
  SessionInput,
  SessionEvent,
  SessionDoneEvent,
} from './session-types.js';
import type { TokenUsage } from './types.js';

// ── Configuration ────────────────────────────────────────────────────

export interface ClaudeAgentSDKConfig {
  /**
   * Model identifier (e.g. `'claude-sonnet-4-5'`). Required — the harness
   * never picks a default model (No-Fallback policy, mirrors `factory.ts`).
   * May be overridden per call via `SessionInput.options.model`.
   */
  model: string;

  /**
   * Anthropic API key. When omitted, the SDK falls back to its own auth
   * (OAuth subscription via `claude` CLI, or `ANTHROPIC_API_KEY` env var).
   * Hosts that route by user plan typically set this from server-side
   * credentials; subscription users typically omit it.
   */
  apiKey?: string;

  /**
   * Tools allowed to be auto-executed without prompting. Defaults to all
   * SDK built-in tools when omitted. Set to `[]` to deny all tools (text-only).
   */
  allowedTools?: string[];

  /**
   * Permission mode for tool execution. Defaults to `'bypassPermissions'`
   * so the harness runs headless without prompting — adjust for embedded
   * scenarios that want interactive approval.
   */
  permissionMode?: 'default' | 'acceptEdits' | 'plan' | 'bypassPermissions';

  /**
   * Escape hatch for SDK options not modelled here (hooks, MCP servers,
   * thinking config, etc.). Merged onto the SDK options object last —
   * caller-supplied values win.
   */
  extraOptions?: Record<string, unknown>;
}

// ── Provider ─────────────────────────────────────────────────────────

export class ClaudeAgentSDKProvider implements SessionProvider {
  readonly providerName = 'ClaudeAgentSDK';
  readonly supportsTools = true as const;

  constructor(private readonly config: ClaudeAgentSDKConfig) {
    if (!config.model) {
      throw new Error('ClaudeAgentSDKProvider: model is required (No-Fallback policy)');
    }
  }

  get model(): string {
    return this.config.model;
  }

  async *runSession(input: SessionInput): AsyncIterable<SessionEvent> {
    let sdk: SDKModule;
    try {
      sdk = await loadSDK();
    } catch (err) {
      yield doneError('LLM_ERROR', err instanceof Error ? err.message : String(err), '');
      return;
    }

    const callerSignal = input.options?.signal;
    const abortController = new AbortController();
    if (callerSignal?.aborted) abortController.abort();
    const forwardAbort = () => abortController.abort();
    callerSignal?.addEventListener('abort', forwardAbort);

    const promptText = extractLastUserMessageText(input);
    if (!promptText) {
      callerSignal?.removeEventListener('abort', forwardAbort);
      yield doneError(
        'INVALID_INPUT',
        'ClaudeAgentSDKProvider requires at least one user message with string content',
        '',
      );
      return;
    }

    const sdkOptions: Record<string, unknown> = {
      model: input.options?.model ?? this.config.model,
      systemPrompt: input.systemPrompt,
      abortController,
      permissionMode: this.config.permissionMode ?? 'bypassPermissions',
    };
    if (input.maxTurns !== undefined) sdkOptions.maxTurns = input.maxTurns;
    if (this.config.allowedTools !== undefined) sdkOptions.allowedTools = this.config.allowedTools;
    if (this.config.apiKey) {
      sdkOptions.env = { ...process.env, ANTHROPIC_API_KEY: this.config.apiKey };
    }
    if (this.config.extraOptions) Object.assign(sdkOptions, this.config.extraOptions);

    let turn = 0;
    let finalContent = '';
    let cumulativeUsage: TokenUsage | undefined;
    let rateLimitRejected = false;

    try {
      const queryInstance = sdk.query({
        prompt: promptText,
        options: sdkOptions,
      });

      for await (const msg of queryInstance as AsyncIterable<SDKMessageLike>) {
        if (abortController.signal.aborted) {
          yield doneCancelled(finalContent, cumulativeUsage);
          return;
        }

        switch (msg.type) {
          case 'assistant': {
            turn += 1;
            const blocks = msg.message?.content ?? [];
            for (const block of blocks) {
              if (block.type === 'text' && typeof block.text === 'string') {
                finalContent += block.text;
                yield { type: 'assistant_text', text: block.text, turn };
              } else if (
                block.type === 'tool_use' &&
                typeof block.id === 'string' &&
                typeof block.name === 'string'
              ) {
                yield {
                  type: 'tool_use',
                  toolCallId: block.id,
                  name: block.name,
                  input: block.input,
                  turn,
                };
              }
            }
            if (msg.error) {
              const mapped = mapAssistantError(msg.error);
              if (mapped === 'max_turns') {
                yield doneMaxTurns(finalContent, cumulativeUsage);
              } else {
                yield doneError(
                  mapped,
                  `SDK assistant error: ${msg.error}`,
                  finalContent,
                  cumulativeUsage,
                );
              }
              return;
            }
            break;
          }

          case 'stream_event': {
            const delta = msg.event?.delta;
            if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
              yield { type: 'assistant_text', text: delta.text, turn: turn + 1, delta: true };
            }
            break;
          }

          case 'rate_limit_event': {
            if (msg.rate_limit_info?.status === 'rejected') {
              rateLimitRejected = true;
            }
            break;
          }

          case 'auth_status': {
            if (msg.error) {
              yield doneError(
                'LLM_ERROR',
                `Claude Agent SDK auth failed: ${msg.error}`,
                finalContent,
                cumulativeUsage,
              );
              return;
            }
            break;
          }

          case 'tool_use_summary': {
            // Tool already executed inside SDK loop. We surface this as a
            // best-effort tool_use event for telemetry parity, but with
            // empty input — the real input went out in the prior assistant
            // turn's tool_use block (already emitted above).
            break;
          }

          case 'result': {
            cumulativeUsage = mapUsage(msg.usage);
            if (cumulativeUsage) {
              yield { type: 'usage', usage: cumulativeUsage };
            }
            if (msg.subtype === 'success') {
              const finalText =
                typeof msg.result === 'string' && msg.result.length > 0 ? msg.result : finalContent;
              yield {
                type: 'done',
                finishReason: 'stop',
                finalContent: finalText,
                ...(cumulativeUsage !== undefined && { usage: cumulativeUsage }),
              };
            } else if (msg.subtype === 'error_max_turns') {
              yield doneMaxTurns(finalContent, cumulativeUsage);
            } else {
              const code =
                rateLimitRejected || msg.subtype === 'error_max_budget_usd'
                  ? 'QUOTA_EXCEEDED'
                  : 'LLM_ERROR';
              const message =
                Array.isArray(msg.errors) && msg.errors.length > 0
                  ? String(msg.errors[0])
                  : String(msg.subtype ?? 'SDK terminated with error result');
              yield doneError(code, message, finalContent, cumulativeUsage);
            }
            return;
          }

          // Skipped variants — system / hook / plugin / memory / compact / status /
          // task / session-state / notification / files / mirror_error / etc. The
          // result message is the canonical session terminator.
          default:
            break;
        }
      }

      yield doneError(
        'INTERNAL_ERROR',
        'Claude Agent SDK iterator ended without emitting a result message',
        finalContent,
        cumulativeUsage,
      );
    } catch (err) {
      if (abortController.signal.aborted || (err instanceof Error && err.name === 'AbortError')) {
        yield doneCancelled(finalContent, cumulativeUsage);
        return;
      }
      yield doneError(
        'LLM_ERROR',
        err instanceof Error ? err.message : String(err),
        finalContent,
        cumulativeUsage,
      );
    } finally {
      callerSignal?.removeEventListener('abort', forwardAbort);
    }
  }
}

// ── Helpers ──────────────────────────────────────────────────────────

function extractLastUserMessageText(input: SessionInput): string {
  for (let i = input.messages.length - 1; i >= 0; i -= 1) {
    const m = input.messages[i];
    if (!m || m.role !== 'user') continue;
    if (typeof m.content === 'string') return m.content;
    if (Array.isArray(m.content)) {
      const text = m.content
        .filter(
          (p): p is { type: 'text'; text: string } =>
            p.type === 'text' && typeof p.text === 'string',
        )
        .map((p) => p.text)
        .join('\n');
      if (text) return text;
    }
  }
  return '';
}

type AssistantErrorCode =
  | 'authentication_failed'
  | 'oauth_org_not_allowed'
  | 'billing_error'
  | 'rate_limit'
  | 'invalid_request'
  | 'server_error'
  | 'unknown'
  | 'max_output_tokens';

function mapAssistantError(
  err: string,
): SessionDoneEvent['error'] extends infer E
  ? E extends { code: infer C }
    ? C | 'max_turns'
    : never
  : never {
  switch (err as AssistantErrorCode) {
    case 'invalid_request':
      return 'INVALID_INPUT';
    case 'billing_error':
    case 'rate_limit':
      return 'QUOTA_EXCEEDED';
    case 'max_output_tokens':
      return 'max_turns';
    case 'authentication_failed':
    case 'oauth_org_not_allowed':
    case 'server_error':
    case 'unknown':
    default:
      return 'LLM_ERROR';
  }
}

function mapUsage(u: SDKUsageLike | undefined): TokenUsage | undefined {
  if (!u) return undefined;
  const input = numberOr(u.input_tokens);
  const output = numberOr(u.output_tokens);
  if (input === undefined && output === undefined) return undefined;
  const total = (input ?? 0) + (output ?? 0);
  return {
    ...(input !== undefined && { inputTokens: input }),
    ...(output !== undefined && { outputTokens: output }),
    ...(total > 0 && { totalTokens: total }),
  };
}

function numberOr(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function doneError(
  code: NonNullable<SessionDoneEvent['error']>['code'],
  message: string,
  finalContent: string,
  usage?: TokenUsage,
): SessionDoneEvent {
  return {
    type: 'done',
    finishReason: 'error',
    finalContent,
    ...(usage !== undefined && { usage }),
    error: { code, message },
  };
}

function doneMaxTurns(finalContent: string, usage?: TokenUsage): SessionDoneEvent {
  return {
    type: 'done',
    finishReason: 'max_turns',
    finalContent,
    ...(usage !== undefined && { usage }),
  };
}

function doneCancelled(finalContent: string, usage?: TokenUsage): SessionDoneEvent {
  return {
    type: 'done',
    finishReason: 'cancelled',
    finalContent,
    ...(usage !== undefined && { usage }),
  };
}

// ── SDK loader + minimal shape declarations ──────────────────────────
// We intentionally declare a *narrow* surface here (only the message
// fields we actually inspect) rather than importing the SDK's exported
// types. This keeps the build green when the optional peer is absent,
// and insulates us from SDK type churn on fields we don't touch.

interface SDKQueryFunction {
  (params: { prompt: string; options?: Record<string, unknown> }): AsyncIterable<SDKMessageLike>;
}

interface SDKModule {
  query: SDKQueryFunction;
}

interface SDKUsageLike {
  input_tokens?: number;
  output_tokens?: number;
}

interface SDKContentBlockLike {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
}

interface SDKMessageLike {
  type: string;
  // assistant
  message?: { content?: SDKContentBlockLike[] };
  error?: string;
  // result
  subtype?: string;
  result?: string;
  usage?: SDKUsageLike;
  errors?: unknown[];
  // rate_limit_event
  rate_limit_info?: { status?: string };
  // stream_event partial
  event?: { delta?: { type?: string; text?: string } };
}

// Exported for tests — they replace this to inject a fake SDK without
// touching the real `@anthropic-ai/claude-agent-sdk` module resolution.
export const __sdkLoader: { load: () => Promise<SDKModule> } = {
  load: async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mod = (await import('@anthropic-ai/claude-agent-sdk' as any)) as SDKModule;
      if (typeof mod.query !== 'function') {
        throw new Error('module loaded but query() not found');
      }
      return mod;
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      throw new Error(
        `@anthropic-ai/claude-agent-sdk not available (${reason}). ` +
          `Install it as a peer dependency: pnpm add @anthropic-ai/claude-agent-sdk`,
        { cause: e },
      );
    }
  },
};

async function loadSDK(): Promise<SDKModule> {
  return __sdkLoader.load();
}
