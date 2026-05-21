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
 * passed as the SDK `cwd`. Combined with the workspace boundary enforced by
 * `FileTools`, this scopes the agent's reads/writes to the project.
 *
 * Streaming: SDK messages are translated into the ACP envelope wire format
 * (`acp.session_update | acp.result | acp.error`) before yielding, so the
 * widget's single stream decoder works for every registered provider. The
 * translation lives in `./sdk-to-acp.ts`.
 */
import {
  query as defaultQuery,
  type Options as SdkOptions,
  type Query as SdkQuery,
} from '@anthropic-ai/claude-agent-sdk';
import type { AgentStreamFactory } from '../server/app.js';
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
}

export function createSdkProvider(options: CreateSdkProviderOptions = {}): AgentStreamFactory {
  const queryFn: QueryFn = options.query ?? defaultQuery;

  return async function* sdkProvider(request, context) {
    const controller = new AbortController();
    const onAbort = (): void => controller.abort();
    if (context.signal.aborted) {
      controller.abort();
    } else {
      context.signal.addEventListener('abort', onAbort, { once: true });
    }

    const sdkOptions: SdkOptions = {
      abortController: controller,
      permissionMode: context.permissionMode,
      ...(context.permissionMode === 'bypassPermissions' && {
        allowDangerouslySkipPermissions: true,
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
