/**
 * Model-Driven Loop Strategy
 *
 * Domain-agnostic refactor of the original agent/tool-loop.ts.
 * The LLM decides which tools to call and when to stop (Claude Code pattern).
 *
 * All domain logic is injected via GenerationDomain, ToolProvider, PromptProvider, and LoopConfig.
 */

import type { LLMProvider, ChatMessage, TokenUsage } from '../../llm/types.js';
import type {
  AgentInput,
  AgentOutput,
  AgentValidation,
  GenerationDomain,
  LoopConfig,
  PromptProvider,
  StreamEvent,
  ToolProvider,
} from '../types.js';
import { createLoopState } from '../state.js';
import { classifyStreamError, formatErrorWithPrefix } from '../errors.js';
import { accumulateUsage } from '../metadata.js';

/**
 * Model-driven loop: the LLM drives the process by calling tools.
 *
 * @param input   - Text description or base64 image
 * @param llm     - LLM provider with tool-use support
 * @param adapter - Domain-specific parse/render/extractCode/convertOutput
 * @param tools   - Domain-specific tool definitions and executor
 * @param prompts - Domain-specific prompt templates
 * @param config  - Max iterations (turns)
 * @yields StreamEvent progress events
 */
export async function* modelDrivenLoop(
  input: AgentInput,
  llm: LLMProvider,
  adapter: GenerationDomain,
  tools: ToolProvider,
  prompts: PromptProvider,
  config: LoopConfig,
): AsyncGenerator<StreamEvent> {
  const state = createLoopState(input, config.maxIterations);
  const signal = input.options?.signal;

  yield { type: 'start', data: { message: 'Starting generation...' } };

  // Build initial messages.
  //
  // Model-driven loops do not invoke buildAnalyzePrompt / buildGeneratePrompt
  // — the LLM owns the workflow via tool calls. To still honour
  // `input.previousOutput`, we append a fenced editing-target block so
  // the model sees the prior code before deciding which tools to call.
  // The block format mirrors the convention domain bindings use in the
  // analyze/generate builders, so the LLM's behaviour is consistent
  // across strategies.
  let userOpener = `Create output for: ${input.content}\n\nStart by learning the domain syntax, then generate the code.`;
  if (input.previousOutput) {
    userOpener +=
      `\n\n--- Existing code (modify this) ---\n` + `\`\`\`\n${input.previousOutput}\n\`\`\``;
  }
  const messages: ChatMessage[] = [
    { role: 'system', content: prompts.systemPromptFull ?? prompts.systemPrompt },
    { role: 'user', content: userOpener },
  ];

  let turn = 0;
  let accumulatedUsage: TokenUsage | undefined;
  let lastModel: string | undefined;

  while (turn < state.maxIterations) {
    turn++;

    // Call model with tools
    let response;
    try {
      response = await llm.chatWithTools(messages, tools.definitions, {
        maxTokens: 4096,
        temperature: 0.1,
        ...(signal && { signal }),
      });
      accumulatedUsage = accumulateUsage(accumulatedUsage, response.usage);
      lastModel = response.model;
    } catch (error) {
      yield {
        type: 'error',
        data: {
          error: formatErrorWithPrefix('LLM call failed', error),
          errorCode: classifyStreamError(error),
        },
      };
      return;
    }

    // Model responded with text only (no tool calls) -> done
    if (response.finished) {
      if (response.content) {
        const converted = adapter.convertOutput?.(response.content);
        const extracted =
          converted && converted.code && !converted.error
            ? converted.code
            : adapter.extractCode(response.content);
        if (extracted) {
          state.code = extracted;
          try {
            const renderResult = adapter.render(state.code);
            state.html = renderResult.html;
          } catch {
            // Render failed, use what we have
          }
        }

        messages.push({ role: 'assistant', content: response.content });
      }
      break;
    }

    // Model wants to call tools
    messages.push({
      role: 'assistant',
      content: response.content,
      tool_calls: response.toolCalls,
    });

    // Execute each tool call and add results
    for (const toolCall of response.toolCalls) {
      let args: Record<string, unknown>;
      try {
        args = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
      } catch {
        args = {};
      }

      const toolName = toolCall.function.name;

      // Yield progress using tool provider mappings
      const step = tools.getStep?.(toolName);
      const message = tools.getMessage?.(toolName) ?? toolName;
      yield {
        type: 'progress',
        data: {
          step: step ?? 'generate',
          message,
        },
      };

      const result = await tools.execute(toolName, args);

      // Track code from parse results
      try {
        const parsed = JSON.parse(result) as Record<string, unknown>;
        if (parsed.valid === true && typeof parsed.code === 'string') {
          state.code = parsed.code;
        }
      } catch {
        // Not JSON or no code field -- ignore
      }

      // Track HTML from render results
      if (step === 'render' && state.code) {
        try {
          const renderResult = adapter.render(state.code);
          state.html = renderResult.html;
        } catch {
          // Render failed, ignore
        }
      }

      // Feed tool result back to model
      messages.push({
        role: 'tool',
        content: result,
        tool_call_id: toolCall.id,
      });
    }
  }

  // Complete
  if (!state.code) {
    yield {
      type: 'error',
      data: { error: 'No valid code was generated', errorCode: 'LLM_ERROR' },
    };
    return;
  }

  // Final render if not done yet
  if (!state.html && state.code) {
    try {
      const renderResult = adapter.render(state.code);
      state.html = renderResult.html;
    } catch {
      // Render failed, use empty
    }
  }

  // Final validate — model-driven LLMs may skip the validate tool, so run
  // adapter.parse + adapter.validate ourselves so AgentOutput.validation
  // is always populated and the contract matches orchestrator/langgraph.
  yield {
    type: 'progress',
    data: { step: 'validate', message: 'Validating final output...' },
  };

  let validation: AgentValidation;
  const parseResult = adapter.parse(state.code);
  if (!parseResult.valid) {
    validation = {
      valid: false,
      issues: [{ severity: 'error', message: parseResult.error ?? 'Parse error' }],
    };
  } else {
    if (parseResult.code) {
      state.code = parseResult.code;
    }
    if (adapter.validate) {
      try {
        const valResult = adapter.validate(parseResult.code ?? state.code);
        validation = {
          valid: true,
          ...(valResult.score !== undefined && { score: valResult.score }),
          issues: valResult.issues.map((i) => ({
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

  const output: AgentOutput = {
    code: state.code,
    html: state.html ?? '',
    iterations: turn,
    attempts: turn,
    duration: Date.now() - state.startTime,
    validation,
    metadata: {
      model: lastModel ?? '',
      provider: llm.providerName,
      ...(accumulatedUsage !== undefined && { usage: accumulatedUsage }),
    },
  };

  yield {
    type: 'complete',
    data: { output, code: state.code, html: state.html ?? '', validation },
  };
}
