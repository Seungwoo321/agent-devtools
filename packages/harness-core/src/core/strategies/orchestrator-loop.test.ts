import { describe, it, expect } from 'vitest';
import { orchestratorLoop } from './orchestrator-loop.js';
import type {
  AgentInput,
  GenerationDomain,
  PromptProvider,
  StreamEvent,
  LoopConfig,
} from '../types.js';
import type { LLMProvider, ChatResponse, ToolChatResponse } from '../../llm/types.js';

function makePrompts(): PromptProvider {
  return {
    systemPrompt: 'sys',
    systemPromptFull: 'sys-full',
    buildAnalyzePrompt: (input) => `analyze: ${input}`,
    buildAnalyzeImagePrompt: () => 'analyze-image',
    buildGeneratePrompt: (input, analysis) => `generate(${input}, ${analysis})`,
    buildFixPrompt: (code, issues) => `fix(${code}, ${issues})`,
  };
}

function makeAdapter(overrides: Partial<GenerationDomain> = {}): GenerationDomain {
  return {
    parse: (code) => ({ valid: true, code }),
    render: (code) => ({ html: `<div>${code}</div>` }),
    extractCode: (content) => content.replace(/```/g, '').trim(),
    ...overrides,
  };
}

function makeStubLLM(responses: string[]): LLMProvider {
  let i = 0;
  return {
    supportsTools: false,
    providerName: 'StubProvider',
    chat: async (): Promise<ChatResponse> => {
      const content = responses[Math.min(i++, responses.length - 1)]!;
      return { content, model: 'stub' };
    },
    chatWithVision: async (): Promise<ChatResponse> => ({
      content: 'image-analysis',
      model: 'stub',
    }),
    chatWithTools: async (): Promise<ToolChatResponse> => ({
      content: null,
      toolCalls: [],
      finished: true,
      model: 'stub',
    }),
  };
}

async function collect(gen: AsyncGenerator<StreamEvent>): Promise<StreamEvent[]> {
  const out: StreamEvent[] = [];
  for await (const ev of gen) out.push(ev);
  return out;
}

describe('orchestratorLoop', () => {
  const input: AgentInput = { type: 'text', content: 'a button' };
  const config: LoopConfig = { maxIterations: 3, qualityThreshold: 70 };

  it('emits start → analyze → plan → generate → validate → render → complete on the happy path', async () => {
    const llm = makeStubLLM(['analysis text', 'generated code']);
    const events = await collect(
      orchestratorLoop(input, llm, makeAdapter(), makePrompts(), config),
    );

    const types = events.map((e) => e.type);
    expect(types[0]).toBe('start');
    expect(types[types.length - 1]).toBe('complete');

    const steps = events.map((e) => e.data.step).filter(Boolean);
    expect(steps).toContain('analyze');
    expect(steps).toContain('plan');
    expect(steps).toContain('generate');
    expect(steps).toContain('validate');
    expect(steps).toContain('render');

    const final = events[events.length - 1]!;
    expect(final.data.output?.code).toBe('generated code');
    expect(final.data.output?.html).toBe('<div>generated code</div>');
  });

  it('retries when parse fails and stops at maxIterations', async () => {
    const llm = makeStubLLM(['analysis', 'bad-1', 'bad-2', 'bad-3']);
    const adapter = makeAdapter({
      parse: () => ({ valid: false, error: 'syntax' }),
    });

    const events = await collect(
      orchestratorLoop(input, llm, adapter, makePrompts(), { ...config, maxIterations: 2 }),
    );
    const final = events[events.length - 1]!;
    expect(final.type).toBe('complete');
    expect(final.data.output?.iterations).toBe(2);
  });

  it('emits an error event when the LLM throws during analysis', async () => {
    const llm: LLMProvider = {
      ...makeStubLLM(['n/a']),
      chat: async () => {
        throw new Error('rate limit');
      },
    };
    const events = await collect(
      orchestratorLoop(input, llm, makeAdapter(), makePrompts(), config),
    );
    const errEv = events.find((e) => e.type === 'error');
    expect(errEv?.data.error).toMatch(/Analysis failed: rate limit/);
  });

  it('passes buildGeneratePrompt output verbatim — does not prepend "User request" / "Analysis and plan"', async () => {
    const seenUserMessages: string[] = [];
    const llm: LLMProvider = {
      supportsTools: false,
      providerName: 'StubProvider',
      chat: async (messages) => {
        const last = messages[messages.length - 1]!;
        if (last.role === 'user' && typeof last.content === 'string') {
          seenUserMessages.push(last.content);
        }
        return { content: 'analysis', model: 'stub' };
      },
      chatWithVision: async () => ({ content: '', model: 'stub' }),
      chatWithTools: async () => ({ content: null, toolCalls: [], finished: true, model: 'stub' }),
    };

    await collect(orchestratorLoop(input, llm, makeAdapter(), makePrompts(), config));

    // 1st call = analyze ("analyze: a button"), 2nd call = generate
    expect(seenUserMessages[0]).toBe('analyze: a button');
    // generate prompt = exactly what buildGeneratePrompt returned, no wrapper
    expect(seenUserMessages[1]).toBe('generate(a button, analysis)');
  });

  it('forwards input.previousOutput as the extra argument to buildAnalyzePrompt and buildGeneratePrompt', async () => {
    const analyzeCalls: Array<[string, string | undefined]> = [];
    const generateCalls: Array<[string, string, string | undefined]> = [];
    const prompts: PromptProvider = {
      systemPrompt: 'sys',
      buildAnalyzePrompt: (i, prev) => {
        analyzeCalls.push([i, prev]);
        return `analyze:${i}`;
      },
      buildGeneratePrompt: (i, a, prev) => {
        generateCalls.push([i, a, prev]);
        return `generate:${i}`;
      },
    };
    const llm = makeStubLLM(['analysis', 'generated code']);
    const inputWithPrior: AgentInput = {
      type: 'text',
      content: 'add cancel button',
      previousOutput: 'page "Old" {}',
    };

    await collect(orchestratorLoop(inputWithPrior, llm, makeAdapter(), prompts, config));

    expect(analyzeCalls).toHaveLength(1);
    expect(analyzeCalls[0]).toEqual(['add cancel button', 'page "Old" {}']);
    expect(generateCalls).toHaveLength(1);
    expect(generateCalls[0]).toEqual(['add cancel button', 'analysis', 'page "Old" {}']);
  });

  it('passes undefined as previousOutput when AgentInput omits it', async () => {
    const analyzeCalls: Array<string | undefined> = [];
    const prompts: PromptProvider = {
      systemPrompt: 'sys',
      buildAnalyzePrompt: (_i, prev) => {
        analyzeCalls.push(prev);
        return 'analyze';
      },
      buildGeneratePrompt: () => 'generate',
    };
    const llm = makeStubLLM(['analysis', 'code']);
    await collect(orchestratorLoop(input, llm, makeAdapter(), prompts, config));
    expect(analyzeCalls[0]).toBeUndefined();
  });

  it('passes buildAnalyzeImagePrompt output verbatim — no "Analyze this UI." suffix from the loop', async () => {
    const seenImageMessages: string[] = [];
    const imgInput: AgentInput = {
      type: 'image',
      content: 'BASE64DATA',
      imageMimeType: 'image/png',
    };
    const llm: LLMProvider = {
      supportsTools: false,
      providerName: 'StubProvider',
      chat: async () => ({ content: 'code', model: 'stub' }),
      chatWithVision: async (messages) => {
        const last = messages[messages.length - 1]!;
        if (last.role === 'user' && typeof last.content === 'string') {
          seenImageMessages.push(last.content);
        }
        return { content: 'image-analysis-result', model: 'stub' };
      },
      chatWithTools: async () => ({ content: null, toolCalls: [], finished: true, model: 'stub' }),
    };

    await collect(orchestratorLoop(imgInput, llm, makeAdapter(), makePrompts(), config));
    expect(seenImageMessages[0]).toBe('analyze-image');
  });

  it('stamps metadata.model / metadata.provider and accumulates usage across calls', async () => {
    const llm: LLMProvider = {
      supportsTools: false,
      providerName: 'TestProvider',
      chat: async (): Promise<ChatResponse> => ({
        content: 'x',
        model: 'tp-model-7b',
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      }),
      chatWithVision: async (): Promise<ChatResponse> => ({ content: '', model: 'tp-model-7b' }),
      chatWithTools: async (): Promise<ToolChatResponse> => ({
        content: null,
        toolCalls: [],
        finished: true,
        model: 'tp-model-7b',
      }),
    };

    const events = await collect(
      orchestratorLoop(input, llm, makeAdapter(), makePrompts(), config),
    );
    const final = events[events.length - 1]!;
    // 2 chat calls (analyze + generate) — usage accumulated
    expect(final.data.output?.metadata).toEqual({
      model: 'tp-model-7b',
      provider: 'TestProvider',
      usage: { inputTokens: 20, outputTokens: 10, totalTokens: 30 },
    });
  });

  it('leaves metadata.usage undefined when no provider returns usage', async () => {
    const llm = makeStubLLM(['analysis', 'code']);
    const events = await collect(
      orchestratorLoop(input, llm, makeAdapter(), makePrompts(), config),
    );
    const final = events[events.length - 1]!;
    expect(final.data.output?.metadata?.provider).toBe('StubProvider');
    expect(final.data.output?.metadata?.model).toBe('stub');
    expect(final.data.output?.metadata?.usage).toBeUndefined();
  });

  it('forwards AgentOptions.signal to every LLM call', async () => {
    const seenSignals: Array<AbortSignal | undefined> = [];
    const llm: LLMProvider = {
      supportsTools: false,
      providerName: 'StubProvider',
      chat: async (_messages, options) => {
        seenSignals.push(options?.signal);
        return { content: 'x', model: 'stub' };
      },
      chatWithVision: async () => ({ content: '', model: 'stub' }),
      chatWithTools: async () => ({ content: null, toolCalls: [], finished: true, model: 'stub' }),
    };

    const controller = new AbortController();
    const inputWithSignal: AgentInput = {
      type: 'text',
      content: 'a button',
      options: { signal: controller.signal },
    };
    await collect(orchestratorLoop(inputWithSignal, llm, makeAdapter(), makePrompts(), config));

    expect(seenSignals.length).toBeGreaterThanOrEqual(2);
    for (const sig of seenSignals) {
      expect(sig).toBe(controller.signal);
    }
  });

  it('falls back to systemPrompt when systemPromptFull is missing', async () => {
    const seenSystems: string[] = [];
    const llm: LLMProvider = {
      supportsTools: false,
      providerName: 'StubProvider',
      chat: async (messages) => {
        const sys = messages.find((m) => m.role === 'system')?.content;
        if (typeof sys === 'string') seenSystems.push(sys);
        return { content: 'x', model: 'stub' };
      },
      chatWithVision: async () => ({ content: '', model: 'stub' }),
      chatWithTools: async () => ({ content: null, toolCalls: [], finished: true, model: 'stub' }),
    };
    const basePrompts = makePrompts();
    const prompts: PromptProvider = {
      systemPrompt: basePrompts.systemPrompt,
      ...(basePrompts.buildAnalyzePrompt && { buildAnalyzePrompt: basePrompts.buildAnalyzePrompt }),
      ...(basePrompts.buildAnalyzeImagePrompt && {
        buildAnalyzeImagePrompt: basePrompts.buildAnalyzeImagePrompt,
      }),
      ...(basePrompts.buildGeneratePrompt && {
        buildGeneratePrompt: basePrompts.buildGeneratePrompt,
      }),
      ...(basePrompts.buildFixPrompt && { buildFixPrompt: basePrompts.buildFixPrompt }),
    };
    await collect(orchestratorLoop(input, llm, makeAdapter(), prompts, config));
    expect(seenSystems.every((s) => s === 'sys')).toBe(true);
  });
});
