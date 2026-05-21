/**
 * LangGraph Loop Strategy
 *
 * Uses @langchain/langgraph StateGraph to orchestrate the agent loop.
 * Nodes (analyze, generate, validate, render) are pure functions of state;
 * conditional edges drive retry logic.
 *
 * Per-call dependencies (llm, adapter, prompts, input, signal, mutable
 * accumulators) ride on the `ctx` field of state so that the compiled
 * graph itself is shape-only and can be cached at module scope.
 *
 * @langchain/langgraph is loaded via dynamic import so the project
 * builds even when the package is not installed.
 */

import type { LLMProvider, TokenUsage } from '../../llm/types.js';
import type {
  AgentInput,
  AgentOutput,
  AgentValidation,
  GenerationDomain,
  LoopConfig,
  PromptProvider,
  StreamEvent,
} from '../types.js';
import { classifyStreamError, formatErrorWithPrefix } from '../errors.js';
import { accumulateUsage } from '../metadata.js';

// ── Per-call context (rides on graph state) ──────────────────────────

interface GraphCtx {
  llm: LLMProvider;
  adapter: GenerationDomain;
  prompts: PromptProvider;
  input: AgentInput;
  qualityThreshold: number;
  maxIterations: number;
  signal?: AbortSignal;
  events: StreamEvent[];
  usage: { value: TokenUsage | undefined };
  model: { value: string | undefined };
}

// ── Graph State Shape ────────────────────────────────────────────────

interface GraphStateShape {
  ctx: GraphCtx;
  analysis: string;
  code: string;
  html: string;
  iteration: number;
  parseError: string | null;
  score: number;
  issues: string;
}

// ── Module-level Node Functions (pure, read ctx from state) ──────────

async function analyzeNode(state: GraphStateShape): Promise<Partial<GraphStateShape>> {
  const { llm, prompts, input, signal, events, usage, model } = state.ctx;
  events.push({
    type: 'progress',
    data: { step: 'analyze', message: 'Analyzing input...' },
  });

  try {
    let analysis: string;
    if (input.type === 'image') {
      const response = await llm.chatWithVision(
        [
          { role: 'system', content: prompts.systemPrompt },
          { role: 'user', content: prompts.buildAnalyzeImagePrompt?.() ?? 'Analyze the image.' },
        ],
        {
          base64: input.content,
          ...(input.imageMimeType !== undefined && { mimeType: input.imageMimeType }),
        },
        signal ? { signal } : {},
      );
      analysis = response.content;
      usage.value = accumulateUsage(usage.value, response.usage);
      model.value = response.model;
    } else {
      const response = await llm.chat(
        [
          { role: 'system', content: prompts.systemPrompt },
          {
            role: 'user',
            content:
              prompts.buildAnalyzePrompt?.(input.content, input.previousOutput) ?? input.content,
          },
        ],
        signal ? { signal } : {},
      );
      analysis = response.content;
      usage.value = accumulateUsage(usage.value, response.usage);
      model.value = response.model;
    }

    events.push({
      type: 'progress',
      data: { step: 'plan', message: 'Analysis complete.' },
    });

    return { analysis };
  } catch (error) {
    const msg = formatErrorWithPrefix('Analysis failed', error);
    events.push({ type: 'error', data: { error: msg, errorCode: classifyStreamError(error) } });
    return { analysis: '' };
  }
}

async function generateNode(state: GraphStateShape): Promise<Partial<GraphStateShape>> {
  const { llm, adapter, prompts, input, signal, events, usage, model, maxIterations } = state.ctx;
  const iteration = state.iteration + 1;

  events.push({
    type: 'progress',
    data: {
      step: 'generate',
      message:
        iteration === 1
          ? 'Generating code...'
          : `Fixing code... (attempt ${iteration}/${maxIterations})`,
      iteration,
      attempt: iteration,
    },
  });

  let prompt: string;
  if (iteration === 1) {
    prompt =
      prompts.buildGeneratePrompt?.(input.content, state.analysis, input.previousOutput) ??
      `User request: ${input.content}\n\nAnalysis and plan:\n${state.analysis}`;
  } else {
    prompt =
      prompts.buildFixPrompt?.(state.code, state.issues, state.parseError) ??
      `Previous code:\n${state.code}\n\nIssues:\n${state.issues}`;
  }

  try {
    const response = await llm.chat(
      [
        { role: 'system', content: prompts.systemPromptFull ?? prompts.systemPrompt },
        { role: 'user', content: prompt },
      ],
      signal ? { signal } : {},
    );
    usage.value = accumulateUsage(usage.value, response.usage);
    model.value = response.model;

    const converted = adapter.convertOutput?.(response.content);
    let code: string;
    if (converted && converted.code && !converted.error) {
      code = converted.code;
    } else {
      code = adapter.extractCode(response.content);
    }

    return { code, iteration };
  } catch (error) {
    const msg = formatErrorWithPrefix('Code generation failed', error);
    events.push({ type: 'error', data: { error: msg, errorCode: classifyStreamError(error) } });
    return { iteration };
  }
}

function validateNode(state: GraphStateShape): Partial<GraphStateShape> {
  const { adapter, events, qualityThreshold, maxIterations } = state.ctx;
  events.push({
    type: 'progress',
    data: { step: 'validate', message: 'Validating...' },
  });

  const parseResult = adapter.parse(state.code);

  if (!parseResult.valid) {
    const parseError = parseResult.error ?? 'Parse error';
    events.push({
      type: 'progress',
      data: {
        step: 'validate',
        message: `Validation failed (attempt ${state.iteration}/${maxIterations})`,
        validation: { valid: false, issues: [{ severity: 'error', message: parseError }] },
      },
    });
    return {
      parseError,
      score: 0,
      issues: parseError,
    };
  }

  const validCode = parseResult.code ?? state.code;
  let score = 100;
  let issuesStr = '';
  let validation: AgentValidation = { valid: true };

  if (adapter.validate) {
    try {
      const valResult = adapter.validate(validCode);
      score = valResult.score;
      validation = {
        valid: true,
        ...(valResult.score !== undefined && { score: valResult.score }),
        issues: valResult.issues.map((i) => ({
          severity: i.severity,
          message: i.message,
          ...(i.suggestion !== undefined && { suggestion: i.suggestion }),
        })),
      };
      issuesStr =
        valResult.issues
          .map((i) => `- [${i.severity}] ${i.message}${i.suggestion ? ` (${i.suggestion})` : ''}`)
          .join('\n') || '';
    } catch {
      validation = { valid: true };
    }
  }

  if (score < qualityThreshold && state.iteration < maxIterations) {
    events.push({
      type: 'progress',
      data: {
        step: 'validate',
        message: `Quality score low (${score}/100), retrying...`,
        validation,
      },
    });
  }

  return {
    code: validCode,
    parseError: null,
    score,
    issues: issuesStr,
  };
}

function renderNode(state: GraphStateShape): Partial<GraphStateShape> {
  const { adapter, events } = state.ctx;
  events.push({
    type: 'progress',
    data: { step: 'render', message: 'Rendering output...' },
  });

  try {
    const renderResult = adapter.render(state.code);
    return { html: renderResult.html };
  } catch {
    return { html: '' };
  }
}

function routeAfterValidate(state: GraphStateShape): string {
  const { qualityThreshold, maxIterations } = state.ctx;
  if (state.score >= qualityThreshold) {
    return 'render';
  }
  if (state.iteration < maxIterations) {
    return 'generate';
  }
  return 'render';
}

// ── Module-level Compile Cache ───────────────────────────────────────

interface CompiledGraphBundle {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  graph: any;
}

let cachedBundlePromise: Promise<CompiledGraphBundle> | null = null;

async function getCompiledGraph(): Promise<CompiledGraphBundle> {
  if (cachedBundlePromise) return cachedBundlePromise;

  cachedBundlePromise = (async () => {
    // @langchain/langgraph is an optional peer dependency; loaded at runtime only
    const lg = await import('@langchain/langgraph');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Annotation = (lg as any).Annotation;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const StateGraph = (lg as any).StateGraph;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const END = (lg as any).END;

    const GraphState = Annotation.Root({
      ctx: Annotation({
        reducer: (_prev: GraphCtx | undefined, next: GraphCtx | undefined) => next ?? _prev,
        default: () => undefined,
      }),
      analysis: Annotation({
        reducer: (_prev: string, next: string) => next,
        default: () => '',
      }),
      code: Annotation({
        reducer: (_prev: string, next: string) => next,
        default: () => '',
      }),
      html: Annotation({
        reducer: (_prev: string, next: string) => next,
        default: () => '',
      }),
      iteration: Annotation({
        reducer: (_prev: number, next: number) => next,
        default: () => 0,
      }),
      parseError: Annotation({
        reducer: (_prev: string | null, next: string | null) => next,
        default: () => null,
      }),
      score: Annotation({
        reducer: (_prev: number, next: number) => next,
        default: () => 0,
      }),
      issues: Annotation({
        reducer: (_prev: string, next: string) => next,
        default: () => '',
      }),
    });

    const graph = new StateGraph(GraphState)
      .addNode('analyze', analyzeNode)
      .addNode('generate', generateNode)
      .addNode('validate', validateNode)
      .addNode('render', renderNode)
      .addEdge('__start__', 'analyze')
      .addEdge('analyze', 'generate')
      .addEdge('generate', 'validate')
      .addConditionalEdges('validate', routeAfterValidate)
      .addEdge('render', END)
      .compile();

    return { graph };
  })();

  // If the import or compile fails, allow a future retry by clearing cache.
  cachedBundlePromise.catch(() => {
    cachedBundlePromise = null;
  });

  return cachedBundlePromise;
}

/**
 * @internal Test-only: clears the cached compiled graph so the next
 * `langgraphLoop` invocation re-imports and recompiles. Used by unit
 * tests that mock `@langchain/langgraph`.
 */
export function __resetLanggraphCache(): void {
  cachedBundlePromise = null;
}

// ── Main Loop ────────────────────────────────────────────────────────

/**
 * LangGraph-based loop: StateGraph drives analyze -> generate <-> validate -> render.
 * The compiled graph is cached at module scope; per-call dependencies
 * are passed in via the `ctx` field of initial state.
 *
 * @param input   - Text description or base64 image
 * @param llm     - LLM provider
 * @param adapter - Domain-specific parse/render/validate
 * @param prompts - Domain-specific prompt templates
 * @param config  - Max iterations, quality threshold
 * @yields StreamEvent progress events for each phase
 */
export async function* langgraphLoop(
  input: AgentInput,
  llm: LLMProvider,
  adapter: GenerationDomain,
  prompts: PromptProvider,
  config: LoopConfig,
): AsyncGenerator<StreamEvent> {
  let bundle: CompiledGraphBundle;
  try {
    bundle = await getCompiledGraph();
  } catch {
    yield {
      type: 'error',
      data: {
        error:
          '@langchain/langgraph is not installed. Run: pnpm add @langchain/langgraph @langchain/core',
        errorCode: 'INTERNAL_ERROR',
      },
    };
    return;
  }

  const startTime = Date.now();
  const qualityThreshold = config.qualityThreshold ?? 70;
  const maxIterations = config.maxIterations;
  const signal = input.options?.signal;

  const ctx: GraphCtx = {
    llm,
    adapter,
    prompts,
    input,
    qualityThreshold,
    maxIterations,
    ...(signal && { signal }),
    events: [],
    usage: { value: undefined },
    model: { value: undefined },
  };

  yield { type: 'start', data: { message: 'Starting LangGraph generation...' } };

  const initialState: GraphStateShape = {
    ctx,
    analysis: '',
    code: '',
    html: '',
    iteration: 0,
    parseError: null,
    score: 0,
    issues: '',
  };

  try {
    let finalState: GraphStateShape | undefined;

    // streamMode: 'values' yields the full accumulated state after each
    // node executes — last yield is the final state, no separate invoke()
    // is needed (which would re-run the whole pipeline).
    const stream = await bundle.graph.stream(initialState, { streamMode: 'values' });
    for await (const stateUpdate of stream) {
      // Flush any events the just-completed node pushed
      while (ctx.events.length > 0) {
        const ev = ctx.events.shift()!;
        yield ev;
        if (ev.type === 'error') {
          return;
        }
      }
      finalState = stateUpdate as GraphStateShape;
    }

    // Flush any trailing events
    while (ctx.events.length > 0) {
      const ev = ctx.events.shift()!;
      yield ev;
      if (ev.type === 'error') {
        return;
      }
    }

    if (!finalState) {
      yield {
        type: 'error',
        data: { error: 'LangGraph produced no state', errorCode: 'INTERNAL_ERROR' },
      };
      return;
    }

    const validation: AgentValidation | undefined =
      finalState.score > 0
        ? { valid: finalState.parseError === null, score: finalState.score }
        : undefined;
    const output: AgentOutput = {
      code: finalState.code,
      html: finalState.html,
      iterations: finalState.iteration,
      attempts: finalState.iteration,
      duration: Date.now() - startTime,
      ...(validation !== undefined && { validation }),
      metadata: {
        model: ctx.model.value ?? '',
        provider: llm.providerName,
        ...(ctx.usage.value !== undefined && { usage: ctx.usage.value }),
      },
    };

    yield {
      type: 'complete',
      data: { output, code: finalState.code, html: finalState.html },
    };
  } catch (error) {
    yield {
      type: 'error',
      data: {
        error: formatErrorWithPrefix('LangGraph execution failed', error),
        errorCode: classifyStreamError(error),
      },
    };
  }
}
