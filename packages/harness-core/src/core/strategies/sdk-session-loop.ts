/**
 * SDK Session Loop Strategy
 *
 * Sibling to `orchestratorLoop` / `modelDrivenLoop` / `langgraphLoop`. Where
 * those three take an `LLMProvider` (per-turn HTTP) and drive the loop in
 * core, this strategy takes a `SessionProvider` (session-style; the provider
 * owns the tool-execution loop internally) and forwards SDK-emitted events
 * out as `StreamEvent`s.
 *
 * Why a separate strategy? The SDK semantics differ from per-turn LLM
 * semantics in two ways that matter to the harness contract:
 *
 *   1. Tool execution. SDK providers (e.g. Claude Agent SDK) own the tool
 *      loop themselves. The strategy cannot drive `chatWithTools` round-by-
 *      round — it must consume an async event stream and translate.
 *   2. Cancellation propagation. With `LLMProvider`, the strategy forwards
 *      `signal` into every `fetch`. With `SessionProvider`, the strategy
 *      passes the signal once and the provider is responsible for tearing
 *      down the internal subprocess (the SDK's `AbortController` path).
 *
 * Same `AgentOutput` contract as the other three strategies — see
 * CLAUDE.md "Loop strategies" entry for the five required items.
 */

import type { SessionProvider, SessionInput, SessionDoneEvent } from '../../llm/session-types.js';
import type { TokenUsage } from '../../llm/types.js';
import type {
  AgentInput,
  AgentOutput,
  AgentValidation,
  GenerationDomain,
  LoopConfig,
  PromptProvider,
  StreamErrorCode,
  StreamEvent,
} from '../types.js';

/**
 * Drive an agent run against a `SessionProvider`. The provider runs its
 * internal turn loop and yields `SessionEvent`s; this function translates
 * them into the harness `StreamEvent` channel and assembles a final
 * `AgentOutput` from the terminal `done` event.
 *
 * `binding.tools` is intentionally NOT forwarded as `SessionInput.tools` —
 * SDK providers use their own tool system (configured at provider
 * construction time) and would reject OpenAI-shaped definitions. The
 * harness signals "tools available" by picking this strategy; the tools
 * themselves live inside the provider.
 */
export async function* sdkSessionLoop(
  input: AgentInput,
  provider: SessionProvider,
  adapter: GenerationDomain,
  prompts: PromptProvider,
  config: LoopConfig,
): AsyncGenerator<StreamEvent> {
  const signal = input.options?.signal;
  const startTime = Date.now();
  // Caller may override per-call; otherwise stamp the provider's bound
  // model so `AgentOutput.metadata.model` is always populated.
  const model = input.options?.model ?? provider.model;

  yield { type: 'start', data: { message: 'Starting session...' } };

  // Build the user opener identically to `modelDrivenLoop` so consumers
  // see consistent first-turn shape regardless of which strategy is
  // selected. The session provider sees only this one user message — the
  // SDK manages its own internal conversation state from there.
  let userOpener = `Create output for: ${input.content}\n\nStart by learning the domain syntax, then generate the code.`;
  if (input.previousOutput) {
    userOpener +=
      `\n\n--- Existing code (modify this) ---\n` + `\`\`\`\n${input.previousOutput}\n\`\`\``;
  }

  const sessionInput: SessionInput = {
    systemPrompt: prompts.systemPromptFull ?? prompts.systemPrompt,
    messages: [{ role: 'user', content: userOpener }],
    options: {
      ...(signal !== undefined && { signal }),
      ...(input.options?.model !== undefined && { model: input.options.model }),
    },
    maxTurns: config.maxIterations,
  };

  let turns = 0;
  let accumulatedText = '';
  let usage: TokenUsage | undefined;
  let finishReason: SessionDoneEvent['finishReason'] | undefined;
  let providerError: { code: StreamErrorCode; message: string } | undefined;
  let providerFinalContent: string | undefined;

  try {
    for await (const ev of provider.runSession(sessionInput)) {
      switch (ev.type) {
        case 'assistant_text': {
          if (ev.turn > turns) turns = ev.turn;
          accumulatedText += ev.text;
          break;
        }

        case 'tool_use': {
          yield {
            type: 'progress',
            data: {
              step: 'generate',
              message: `tool: ${ev.name}`,
              domainData: {
                toolCallId: ev.toolCallId,
                name: ev.name,
                input: ev.input,
                turn: ev.turn,
              },
            },
          };
          break;
        }

        case 'tool_result': {
          yield {
            type: 'progress',
            data: {
              step: 'generate',
              message: ev.isError ? 'tool error' : 'tool result',
              domainData: {
                toolCallId: ev.toolCallId,
                isError: ev.isError,
              },
            },
          };
          break;
        }

        case 'usage': {
          usage = ev.usage;
          break;
        }

        case 'done': {
          finishReason = ev.finishReason;
          if (ev.usage) usage = ev.usage;
          providerFinalContent = ev.finalContent;
          if (ev.error) {
            providerError = { code: ev.error.code, message: ev.error.message };
          }
          break;
        }
      }
    }
  } catch (err) {
    // The provider contract requires a terminal `done` event even on
    // error — if we got here, the provider violated the contract. Map
    // to INTERNAL_ERROR so the route surfaces it as a 500.
    yield {
      type: 'error',
      data: {
        error: err instanceof Error ? err.message : String(err),
        errorCode: 'INTERNAL_ERROR',
      },
    };
    return;
  }

  if (!finishReason) {
    yield {
      type: 'error',
      data: {
        error: 'SessionProvider exited without emitting a done event',
        errorCode: 'INTERNAL_ERROR',
      },
    };
    return;
  }

  if (finishReason === 'error' && providerError) {
    yield {
      type: 'error',
      data: { error: providerError.message, errorCode: providerError.code },
    };
    return;
  }

  if (finishReason === 'cancelled') {
    // Caller cancelled mid-session. Surface as a non-fatal error so the
    // route can emit the right HTTP status without inventing a new
    // StreamEvent type. `INVALID_INPUT` would be wrong (it wasn't the
    // caller's payload that was bad); LLM_ERROR overstates fault. Use
    // INTERNAL_ERROR per the harness convention for "deliberate abort".
    yield {
      type: 'error',
      data: { error: 'Session cancelled', errorCode: 'INTERNAL_ERROR' },
    };
    return;
  }

  // Either `stop` or `max_turns`. Either way, try to extract usable code
  // from what we have. `max_turns` is not fatal — if the model produced
  // valid code in the turns it had, ship it.
  const sourceContent =
    providerFinalContent && providerFinalContent.length > 0
      ? providerFinalContent
      : accumulatedText;

  if (!sourceContent) {
    yield {
      type: 'error',
      data: {
        error: 'Session ended without any text content',
        errorCode: 'LLM_ERROR',
      },
    };
    return;
  }

  const converted = adapter.convertOutput?.(sourceContent);
  let code =
    converted && converted.code && !converted.error
      ? converted.code
      : adapter.extractCode(sourceContent);

  if (!code) {
    yield {
      type: 'error',
      data: {
        error: 'No code could be extracted from the session output',
        errorCode: 'LLM_ERROR',
      },
    };
    return;
  }

  yield {
    type: 'progress',
    data: { step: 'validate', message: 'Validating final output...' },
  };

  let validation: AgentValidation;
  const parseResult = adapter.parse(code);
  if (!parseResult.valid) {
    validation = {
      valid: false,
      issues: [{ severity: 'error', message: parseResult.error ?? 'Parse error' }],
    };
  } else {
    if (parseResult.code) code = parseResult.code;
    if (adapter.validate) {
      try {
        const v = adapter.validate(code);
        validation = {
          valid: true,
          score: v.score,
          issues: v.issues.map((i) => ({
            severity: i.severity,
            message: i.message,
            ...(i.suggestion !== undefined && { suggestion: i.suggestion }),
          })),
        };
      } catch {
        validation = { valid: true };
      }
    } else {
      validation = { valid: true };
    }
  }

  let html = '';
  try {
    const r = adapter.render(code);
    html = r.html;
  } catch {
    // Render failed — keep going with empty html so caller still gets
    // code + validation info. Mirrors model-driven-loop behaviour.
  }

  const output: AgentOutput = {
    code,
    html,
    iterations: turns,
    attempts: turns,
    duration: Date.now() - startTime,
    validation,
    metadata: {
      model,
      provider: provider.providerName,
      ...(usage !== undefined && { usage }),
    },
  };

  yield {
    type: 'complete',
    data: { output, code, html, validation },
  };
  // Prompts may carry per-binding system text we don't read here. Keep the
  // reference live so noUnusedParameters doesn't fire — actual reading
  // happens via `prompts.systemPromptFull ?? prompts.systemPrompt` above.
  void prompts;
}
