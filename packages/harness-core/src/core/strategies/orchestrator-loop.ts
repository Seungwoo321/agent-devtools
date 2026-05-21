/**
 * Orchestrator Loop Strategy
 *
 * Domain-agnostic refactor of an analyze+plan -> generate <-> validate -> render loop.
 *
 * All domain logic is injected via GenerationDomain, PromptProvider, and LoopConfig.
 * The loop itself knows nothing about any specific DSL or business domain.
 */

import type { LLMProvider, TokenUsage } from '../../llm/types.js';
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
import { createLoopState } from '../state.js';
import { classifyStreamError, formatErrorWithPrefix } from '../errors.js';
import { accumulateUsage } from '../metadata.js';

/**
 * Orchestrator loop: the harness drives analyze -> generate <-> validate -> render.
 *
 * @param input   - Text description or base64 image
 * @param llm     - LLM provider (OpenRouter, etc.)
 * @param adapter - Domain-specific parse/render/validate
 * @param prompts - Domain-specific prompt templates
 * @param config  - Max iterations, quality threshold
 * @yields StreamEvent progress events for each phase
 */
export async function* orchestratorLoop(
  input: AgentInput,
  llm: LLMProvider,
  adapter: GenerationDomain,
  prompts: PromptProvider,
  config: LoopConfig,
): AsyncGenerator<StreamEvent> {
  const state = createLoopState(input, config.maxIterations);
  const qualityThreshold = config.qualityThreshold ?? 70;
  const signal = input.options?.signal;

  let accumulatedUsage: TokenUsage | undefined;
  let lastModel: string | undefined;

  yield { type: 'start', data: { message: 'Starting generation...' } };

  // ── Phase 1: Analyze + Plan ────────────────────────────────────────
  state.phase = 'analyze';
  yield {
    type: 'progress',
    data: { step: 'analyze', message: 'Analyzing input and planning structure...' },
  };

  try {
    if (state.inputType === 'image') {
      const response = await llm.chatWithVision(
        [
          { role: 'system', content: prompts.systemPrompt },
          { role: 'user', content: prompts.buildAnalyzeImagePrompt?.() ?? 'Analyze the image.' },
        ],
        {
          base64: state.input,
          ...(state.imageMimeType !== undefined && { mimeType: state.imageMimeType }),
        },
        signal ? { signal } : {},
      );
      state.analysis = response.content;
      accumulatedUsage = accumulateUsage(accumulatedUsage, response.usage);
      lastModel = response.model;
    } else {
      const response = await llm.chat(
        [
          { role: 'system', content: prompts.systemPrompt },
          {
            role: 'user',
            content: prompts.buildAnalyzePrompt?.(state.input, input.previousOutput) ?? state.input,
          },
        ],
        signal ? { signal } : {},
      );
      state.analysis = response.content;
      accumulatedUsage = accumulateUsage(accumulatedUsage, response.usage);
      lastModel = response.model;
    }
  } catch (error) {
    state.error = formatErrorWithPrefix('Analysis failed', error);
    state.phase = 'error';
    const errorCode: StreamErrorCode = classifyStreamError(error);
    yield { type: 'error', data: { error: state.error, errorCode } };
    return;
  }

  state.plan = state.analysis;
  state.phase = 'plan';
  yield {
    type: 'progress',
    data: { step: 'plan', message: 'Structure plan complete.' },
  };

  // ── Phase 2-3: Generate + Validate Loop ────────────────────────────
  while (state.iteration < state.maxIterations) {
    state.phase = 'generate';
    state.iteration++;

    yield {
      type: 'progress',
      data: {
        step: 'generate',
        message:
          state.iteration === 1
            ? 'Generating code...'
            : `Fixing code... (attempt ${state.iteration}/${state.maxIterations})`,
        iteration: state.iteration,
        attempt: state.iteration,
      },
    };

    // Build prompt — provider owns the full text. The loop only chooses
    // between "first generation" and "fix the previous attempt".
    let prompt: string;
    if (state.iteration === 1) {
      prompt =
        prompts.buildGeneratePrompt?.(state.input, state.analysis ?? '', input.previousOutput) ??
        `User request: ${state.input}\n\nAnalysis and plan:\n${state.analysis ?? ''}`;
    } else {
      const issueMessages =
        state.validation?.issues
          ?.map((i) => `- [${i.severity}] ${i.message}${i.suggestion ? ` (${i.suggestion})` : ''}`)
          .join('\n') || '';
      prompt =
        prompts.buildFixPrompt?.(state.code!, issueMessages, state.parseError) ??
        `Previous code:\n${state.code}\n\nIssues:\n${issueMessages}`;
    }

    // Generate
    try {
      const genResponse = await llm.chat(
        [
          { role: 'system', content: prompts.systemPromptFull ?? prompts.systemPrompt },
          { role: 'user', content: prompt },
        ],
        signal ? { signal } : {},
      );
      accumulatedUsage = accumulateUsage(accumulatedUsage, genResponse.usage);
      lastModel = genResponse.model;

      // Convert LLM output to domain code
      const converted = adapter.convertOutput?.(genResponse.content);
      if (converted && converted.code && !converted.error) {
        state.code = converted.code;
      } else {
        state.code = adapter.extractCode(genResponse.content);
      }
    } catch (error) {
      state.error = formatErrorWithPrefix('Code generation failed', error);
      state.phase = 'error';
      const errorCode: StreamErrorCode = classifyStreamError(error);
      yield { type: 'error', data: { error: state.error, errorCode } };
      return;
    }

    // Validate
    state.phase = 'validate';
    yield {
      type: 'progress',
      data: { step: 'validate', message: 'Validating...' },
    };

    const parseResult = adapter.parse(state.code!);

    if (parseResult.valid) {
      state.parseError = null;

      let validation: AgentValidation;
      if (adapter.validate) {
        try {
          const valResult = adapter.validate(parseResult.code ?? state.code!);
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
      state.validation = validation;

      if (parseResult.code) {
        state.code = parseResult.code;
      }

      if (
        validation.valid &&
        validation.score != null &&
        validation.score < qualityThreshold &&
        state.iteration < state.maxIterations
      ) {
        const issuesSummary =
          validation.issues
            ?.map((i) => `- ${i.message}${i.suggestion ? ` (${i.suggestion})` : ''}`)
            .join('\n') || 'Quality score below threshold';

        yield {
          type: 'progress',
          data: {
            step: 'validate',
            message: `Quality score low (${validation.score}/100), retrying...`,
            validation,
          },
        };

        validation.issues = [
          {
            severity: 'warning',
            message: `Quality score is ${validation.score}/100 (below ${qualityThreshold}). Improve quality.`,
            suggestion: issuesSummary,
          },
        ];
        continue;
      }

      break;
    } else {
      // Parse failed
      state.parseError = parseResult.error ?? 'Parse error';
      state.validation = {
        valid: false,
        issues: [{ severity: 'error', message: state.parseError }],
      };

      yield {
        type: 'progress',
        data: {
          step: 'validate',
          message: `Validation failed (attempt ${state.iteration}/${state.maxIterations})`,
          validation: state.validation,
        },
      };

      if (state.iteration >= state.maxIterations) {
        break;
      }
    }
  }

  // ── Phase 4: Render ────────────────────────────────────────────────
  state.phase = 'render';
  yield {
    type: 'progress',
    data: { step: 'render', message: 'Rendering output...' },
  };

  try {
    const renderResult = adapter.render(state.code!);
    state.html = renderResult.html;
  } catch {
    state.html = '';
  }

  // ── Complete ───────────────────────────────────────────────────────
  state.phase = 'complete';
  const output: AgentOutput = {
    code: state.code ?? '',
    html: state.html ?? '',
    iterations: state.iteration,
    attempts: state.iteration,
    duration: Date.now() - state.startTime,
    ...(state.validation !== null && { validation: state.validation }),
    metadata: {
      model: lastModel ?? '',
      provider: llm.providerName,
      ...(accumulatedUsage !== undefined && { usage: accumulatedUsage }),
    },
  };

  yield {
    type: 'complete',
    data: { output, code: output.code, html: output.html },
  };
}
