import { describe, it, expect, vi } from 'vitest';
import { modelDrivenLoop } from './model-driven-loop.js';
import type {
  AgentInput,
  GenerationDomain,
  PromptProvider,
  StreamEvent,
  ToolProvider,
  LoopConfig,
} from '../types.js';
import type { LLMProvider, ToolChatResponse, ChatResponse } from '../../llm/types.js';
import { ProviderInputError } from '../../llm/errors.js';

const baseInput: AgentInput = { type: 'text', content: 'a button' };
const config: LoopConfig = { maxIterations: 5 };

function makePrompts(): PromptProvider {
  return {
    systemPrompt: 'sys',
    systemPromptFull: 'sys-full',
  };
}

function makeAdapter(): GenerationDomain {
  return {
    parse: (code) => ({ valid: true, code }),
    render: (code) => ({ html: `<x>${code}</x>` }),
    extractCode: (content) => content.replace(/```/g, '').trim(),
  };
}

function makeStubLLM(toolResponses: ToolChatResponse[]): LLMProvider {
  let i = 0;
  return {
    supportsTools: true,
    providerName: 'StubProvider',
    chat: async (): Promise<ChatResponse> => ({ content: '', model: 'stub' }),
    chatWithVision: async (): Promise<ChatResponse> => ({ content: '', model: 'stub' }),
    chatWithTools: async () => toolResponses[Math.min(i++, toolResponses.length - 1)]!,
  };
}

async function collect(gen: AsyncGenerator<StreamEvent>): Promise<StreamEvent[]> {
  const out: StreamEvent[] = [];
  for await (const ev of gen) out.push(ev);
  return out;
}

describe('modelDrivenLoop', () => {
  it('awaits an async ToolProvider.execute and threads the result back as a tool message', async () => {
    const execute = vi.fn(async (name: string, args: Record<string, unknown>) => {
      return JSON.stringify({ valid: true, code: `parsed:${args.code as string}`, fromTool: name });
    });
    const tools: ToolProvider = {
      definitions: [
        {
          type: 'function',
          function: {
            name: 'parse',
            description: '',
            parameters: { type: 'object', properties: {} },
          },
        },
      ],
      execute,
      getStep: (n) => (n === 'parse' ? 'validate' : undefined),
      getMessage: (n) => `Running ${n}`,
    };

    const llm = makeStubLLM([
      {
        content: null,
        toolCalls: [
          {
            id: 'c1',
            type: 'function',
            function: { name: 'parse', arguments: '{"code":"hello"}' },
          },
        ],
        finished: false,
        model: 'stub',
      },
      { content: '```final code```', toolCalls: [], finished: true, model: 'stub' },
    ]);

    const events = await collect(
      modelDrivenLoop(baseInput, llm, makeAdapter(), tools, makePrompts(), config),
    );

    expect(execute).toHaveBeenCalledWith('parse', { code: 'hello' });
    expect(execute).toHaveBeenCalledTimes(1);

    const final = events[events.length - 1]!;
    expect(final.type).toBe('complete');
    expect(final.data.output?.code).toBe('final code');
    expect(final.data.output?.iterations).toBe(2);

    const validateEvent = events.find((e) => e.data.step === 'validate');
    expect(validateEvent?.data.message).toBe('Running parse');
  });

  it('falls back gracefully when the ToolProvider has no getStep / getMessage', async () => {
    const tools: ToolProvider = {
      definitions: [
        {
          type: 'function',
          function: {
            name: 'doit',
            description: '',
            parameters: { type: 'object', properties: {} },
          },
        },
      ],
      execute: async () => 'tool result',
    };

    const llm = makeStubLLM([
      {
        content: null,
        toolCalls: [{ id: 'c1', type: 'function', function: { name: 'doit', arguments: '{}' } }],
        finished: false,
        model: 'stub',
      },
      { content: 'final', toolCalls: [], finished: true, model: 'stub' },
    ]);

    const events = await collect(
      modelDrivenLoop(baseInput, llm, makeAdapter(), tools, makePrompts(), config),
    );
    const progress = events.find((e) => e.type === 'progress' && e.data.message === 'doit');
    expect(progress).toBeDefined();
    expect(progress?.data.step).toBe('generate');
  });

  it('emits an error event if the LLM call throws', async () => {
    const tools: ToolProvider = {
      definitions: [],
      execute: async () => '',
    };
    const llm: LLMProvider = {
      supportsTools: true,
      providerName: 'StubProvider',
      chat: async () => ({ content: '', model: 'stub' }),
      chatWithVision: async () => ({ content: '', model: 'stub' }),
      chatWithTools: async () => {
        throw new Error('upstream 500');
      },
    };

    const events = await collect(
      modelDrivenLoop(baseInput, llm, makeAdapter(), tools, makePrompts(), config),
    );
    const errEv = events.find((e) => e.type === 'error');
    expect(errEv?.data.error).toMatch(/LLM call failed: upstream 500/);
    expect(errEv?.data.errorCode).toBe('LLM_ERROR');
  });

  it('classifies ProviderInputError thrown by chatWithTools as INVALID_INPUT', async () => {
    const tools: ToolProvider = { definitions: [], execute: async () => '' };
    const llm: LLMProvider = {
      supportsTools: true,
      providerName: 'StubProvider',
      chat: async () => ({ content: '', model: 'stub' }),
      chatWithVision: async () => ({ content: '', model: 'stub' }),
      chatWithTools: async () => {
        throw new ProviderInputError(
          'Groq rejected request (404) on bad-model: model not found',
          404,
          'Groq',
        );
      },
    };

    const events = await collect(
      modelDrivenLoop(baseInput, llm, makeAdapter(), tools, makePrompts(), config),
    );
    const errEv = events.find((e) => e.type === 'error');
    expect(errEv?.data.errorCode).toBe('INVALID_INPUT');
    expect(errEv?.data.error).toMatch(/model not found/);
  });

  it('returns a "no valid code" error when the model finishes without any code', async () => {
    const tools: ToolProvider = { definitions: [], execute: async () => '' };
    const llm = makeStubLLM([{ content: null, toolCalls: [], finished: true, model: 'stub' }]);

    const events = await collect(
      modelDrivenLoop(baseInput, llm, makeAdapter(), tools, makePrompts(), config),
    );
    const errEv = events.find((e) => e.type === 'error');
    expect(errEv?.data.error).toBe('No valid code was generated');
  });

  it('populates AgentOutput.validation by running adapter.parse + adapter.validate at end', async () => {
    // Model finishes without ever calling a validate tool — the loop must
    // still run a final validate pass so the output contract matches
    // orchestrator/langgraph.
    const adapter: GenerationDomain = {
      parse: (code) => ({ valid: true, code }),
      render: (code) => ({ html: `<x>${code}</x>` }),
      validate: () => ({
        score: 88,
        issues: [{ severity: 'info', message: 'no <h1>' }],
      }),
      extractCode: (content) => content.replace(/```/g, '').trim(),
    };
    const tools: ToolProvider = { definitions: [], execute: async () => '' };
    const llm = makeStubLLM([
      { content: '```page Home {}```', toolCalls: [], finished: true, model: 'stub' },
    ]);

    const events = await collect(
      modelDrivenLoop(baseInput, llm, adapter, tools, makePrompts(), config),
    );
    const final = events[events.length - 1]!;
    expect(final.type).toBe('complete');
    expect(final.data.output?.validation).toEqual({
      valid: true,
      score: 88,
      issues: [{ severity: 'info', message: 'no <h1>', suggestion: undefined }],
    });

    // Final validate progress event was emitted
    const validateEv = events.find(
      (e) =>
        e.type === 'progress' &&
        e.data.step === 'validate' &&
        e.data.message === 'Validating final output...',
    );
    expect(validateEv).toBeDefined();
  });

  it('stamps metadata.model / metadata.provider and accumulates usage across tool turns', async () => {
    const tools: ToolProvider = { definitions: [], execute: async () => '' };
    const llm = makeStubLLM([
      {
        content: null,
        toolCalls: [],
        finished: false,
        model: 'tp-model-32b',
        usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      },
      {
        content: '```final code```',
        toolCalls: [],
        finished: true,
        model: 'tp-model-32b',
        usage: { inputTokens: 30, outputTokens: 20, totalTokens: 50 },
      },
    ]);

    const events = await collect(
      modelDrivenLoop(baseInput, llm, makeAdapter(), tools, makePrompts(), config),
    );
    const final = events[events.length - 1]!;
    expect(final.data.output?.metadata).toEqual({
      model: 'tp-model-32b',
      provider: 'StubProvider',
      usage: { inputTokens: 130, outputTokens: 70, totalTokens: 200 },
    });
  });

  it('forwards AgentOptions.signal to chatWithTools options', async () => {
    const seenSignals: Array<AbortSignal | undefined> = [];
    const tools: ToolProvider = { definitions: [], execute: async () => '' };
    const llm: LLMProvider = {
      supportsTools: true,
      providerName: 'StubProvider',
      chat: async () => ({ content: '', model: 'stub' }),
      chatWithVision: async () => ({ content: '', model: 'stub' }),
      chatWithTools: async (_msgs, _tools, options) => {
        seenSignals.push(options?.signal);
        return { content: 'final', toolCalls: [], finished: true, model: 'stub' };
      },
    };

    const controller = new AbortController();
    const inputWithSignal: AgentInput = {
      type: 'text',
      content: 'a button',
      options: { signal: controller.signal },
    };
    await collect(
      modelDrivenLoop(inputWithSignal, llm, makeAdapter(), tools, makePrompts(), config),
    );

    expect(seenSignals.length).toBeGreaterThanOrEqual(1);
    expect(seenSignals[0]).toBe(controller.signal);
  });

  it('marks validation invalid when final parse fails', async () => {
    const adapter: GenerationDomain = {
      parse: () => ({ valid: false, error: 'unterminated block' }),
      render: () => ({ html: '' }),
      extractCode: (content) => content,
    };
    const tools: ToolProvider = { definitions: [], execute: async () => '' };
    const llm = makeStubLLM([
      { content: 'broken code', toolCalls: [], finished: true, model: 'stub' },
    ]);

    const events = await collect(
      modelDrivenLoop(baseInput, llm, adapter, tools, makePrompts(), config),
    );
    const final = events[events.length - 1]!;
    expect(final.type).toBe('complete');
    expect(final.data.output?.validation?.valid).toBe(false);
    expect(final.data.output?.validation?.issues?.[0]?.message).toBe('unterminated block');
  });

  it('prefers adapter.convertOutput over extractCode when convertOutput returns code', async () => {
    // Strategy parity: orchestrator/langgraph already use convertOutput-first.
    // Model-driven now does too — the structured-output path takes precedence.
    const adapter: GenerationDomain = {
      parse: (code) => ({ valid: true, code }),
      render: (code) => ({ html: `<x>${code}</x>` }),
      extractCode: () => 'EXTRACTED',
      convertOutput: () => ({ code: 'CONVERTED' }),
    };
    const tools: ToolProvider = { definitions: [], execute: async () => '' };
    const llm = makeStubLLM([
      { content: 'raw model text', toolCalls: [], finished: true, model: 'stub' },
    ]);

    const events = await collect(
      modelDrivenLoop(baseInput, llm, adapter, tools, makePrompts(), config),
    );
    const final = events[events.length - 1]!;
    expect(final.data.output?.code).toBe('CONVERTED');
  });

  it('falls back to extractCode when convertOutput returns an error', async () => {
    const adapter: GenerationDomain = {
      parse: (code) => ({ valid: true, code }),
      render: (code) => ({ html: `<x>${code}</x>` }),
      extractCode: () => 'EXTRACTED',
      convertOutput: () => ({ code: '', error: 'no schema match' }),
    };
    const tools: ToolProvider = { definitions: [], execute: async () => '' };
    const llm = makeStubLLM([
      { content: 'raw model text', toolCalls: [], finished: true, model: 'stub' },
    ]);

    const events = await collect(
      modelDrivenLoop(baseInput, llm, adapter, tools, makePrompts(), config),
    );
    const final = events[events.length - 1]!;
    expect(final.data.output?.code).toBe('EXTRACTED');
  });
});
