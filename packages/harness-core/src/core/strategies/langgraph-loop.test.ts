/**
 * langgraph-loop cache test.
 *
 * Verifies that the compiled graph is cached at module scope —
 * `StateGraph(...).compile()` runs once even when the loop is invoked
 * multiple times. This cuts a ~1s startup cost from every call.
 *
 * @langchain/langgraph is mocked so we can spy on the constructor /
 * compile method and simulate the analyze -> generate -> validate ->
 * render flow without depending on the real engine.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const stateGraphCtor = vi.fn();
const compileSpy = vi.fn();

vi.mock('@langchain/langgraph', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Annotation: any = (config: unknown) => config;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Annotation.Root = (shape: any) => shape;

  class StateGraph {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private nodes: Record<string, (s: any) => any> = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private conditional: Array<[string, (s: any) => string]> = [];

    constructor() {
      stateGraphCtor();
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    addNode(name: string, fn: (s: any) => any) {
      this.nodes[name] = fn;
      return this;
    }
    addEdge(_from: string, _to: string) {
      return this;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    addConditionalEdges(name: string, fn: (s: any) => string) {
      this.conditional.push([name, fn]);
      return this;
    }
    compile() {
      compileSpy();
      const nodes = this.nodes;
      const conditional = this.conditional;

      return {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        stream: async function* (initialState: any) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let state: any = { ...initialState };
          for (const step of ['analyze', 'generate', 'validate']) {
            const updated = await nodes[step]!(state);
            state = { ...state, ...updated };
            yield state;
          }
          const route = conditional.find(([n]) => n === 'validate');
          const next = route ? route[1](state) : 'render';
          if (next === 'render') {
            const updated = await nodes['render']!(state);
            state = { ...state, ...updated };
            yield state;
          }
        },
      };
    }
  }

  return {
    Annotation,
    StateGraph,
    END: '__end__',
  };
});

import { langgraphLoop, __resetLanggraphCache } from './langgraph-loop.js';
import type {
  AgentInput,
  GenerationDomain,
  PromptProvider,
  StreamEvent,
  LoopConfig,
} from '../types.js';
import type { LLMProvider, ChatResponse, ToolChatResponse } from '../../llm/types.js';

function makeAdapter(): GenerationDomain {
  return {
    parse: (code) => ({ valid: true, code }),
    render: (code) => ({ html: `<x>${code}</x>` }),
    extractCode: (content) => content.replace(/```/g, '').trim(),
  };
}

function makePrompts(): PromptProvider {
  return {
    systemPrompt: 'sys',
    systemPromptFull: 'sys-full',
    buildAnalyzePrompt: (input) => `analyze: ${input}`,
    buildGeneratePrompt: (input, analysis) => `generate(${input}, ${analysis})`,
  };
}

function makeStubLLM(): LLMProvider {
  return {
    supportsTools: false,
    providerName: 'StubProvider',
    chat: async (): Promise<ChatResponse> => ({ content: '```ok```', model: 'stub' }),
    chatWithVision: async (): Promise<ChatResponse> => ({ content: '```ok```', model: 'stub' }),
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

describe('langgraphLoop module-level compile cache', () => {
  const input: AgentInput = { type: 'text', content: 'a button' };
  const config: LoopConfig = { maxIterations: 2, qualityThreshold: 70 };

  beforeEach(() => {
    stateGraphCtor.mockClear();
    compileSpy.mockClear();
    __resetLanggraphCache();
  });

  it('compiles the graph exactly once across multiple invocations', async () => {
    const llm = makeStubLLM();

    const events1 = await collect(langgraphLoop(input, llm, makeAdapter(), makePrompts(), config));
    const events2 = await collect(langgraphLoop(input, llm, makeAdapter(), makePrompts(), config));
    const events3 = await collect(langgraphLoop(input, llm, makeAdapter(), makePrompts(), config));

    expect(stateGraphCtor).toHaveBeenCalledTimes(1);
    expect(compileSpy).toHaveBeenCalledTimes(1);

    // Each invocation still produces a complete event with its own metadata
    for (const events of [events1, events2, events3]) {
      const final = events[events.length - 1]!;
      expect(final.type).toBe('complete');
      expect(final.data.output?.metadata?.provider).toBe('StubProvider');
    }
  });

  it('does NOT re-run the LLM pipeline twice (no separate invoke() after stream())', async () => {
    // Pre-existing bug: graph.stream() followed by graph.invoke() ran the
    // graph twice, so each LLM was called 2x and usage was double-counted.
    const chatSpy = vi.fn(async () => ({
      content: '```ok```',
      model: 'stub',
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    }));
    const llm: LLMProvider = {
      supportsTools: false,
      providerName: 'StubProvider',
      chat: chatSpy,
      chatWithVision: async () => ({ content: '', model: 'stub' }),
      chatWithTools: async () => ({ content: null, toolCalls: [], finished: true, model: 'stub' }),
    };

    const events = await collect(langgraphLoop(input, llm, makeAdapter(), makePrompts(), config));

    // analyze + generate = 2 chat calls. NOT 4.
    expect(chatSpy).toHaveBeenCalledTimes(2);

    const final = events[events.length - 1]!;
    expect(final.data.output?.metadata?.usage).toEqual({
      inputTokens: 20,
      outputTokens: 10,
      totalTokens: 30,
    });
  });

  it('forwards AgentOptions.signal to LLM calls', async () => {
    const seenSignals: Array<AbortSignal | undefined> = [];
    const llm: LLMProvider = {
      supportsTools: false,
      providerName: 'StubProvider',
      chat: async (_msgs, options) => {
        seenSignals.push(options?.signal);
        return { content: '```ok```', model: 'stub' };
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
    await collect(langgraphLoop(inputWithSignal, llm, makeAdapter(), makePrompts(), config));

    expect(seenSignals.length).toBeGreaterThanOrEqual(2);
    for (const sig of seenSignals) {
      expect(sig).toBe(controller.signal);
    }
  });
});
