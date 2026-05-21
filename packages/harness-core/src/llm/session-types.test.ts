import { describe, it, expect, expectTypeOf } from 'vitest';
import type {
  SessionProvider,
  SessionInput,
  SessionEvent,
  SessionAssistantTextEvent,
  SessionToolUseEvent,
  SessionToolResultEvent,
  SessionUsageEvent,
  SessionDoneEvent,
  ResolvedProvider,
  LLMProvider,
  ChatMessage,
  ToolDefinition,
  ChatOptions,
  TokenUsage,
} from './index.js';

// Helper — a minimal SessionProvider stub usable across multiple tests.
function makeStub(): SessionProvider {
  return {
    providerName: 'Stub',
    model: 'stub-model',
    supportsTools: true,
    async *runSession(_input: SessionInput): AsyncIterable<SessionEvent> {
      yield { type: 'assistant_text', text: 'hi', turn: 1 };
      yield {
        type: 'done',
        finishReason: 'stop',
        finalContent: 'hi',
      };
    },
  };
}

describe('SessionProvider', () => {
  it('requires providerName, model, supportsTools: true, and runSession', () => {
    const p = makeStub();
    expect(p.providerName).toBe('Stub');
    expect(p.model).toBe('stub-model');
    expect(p.supportsTools).toBe(true);
    expect(typeof p.runSession).toBe('function');
  });

  it('locks supportsTools to literal `true` at the type level', () => {
    expectTypeOf<SessionProvider>().toHaveProperty('supportsTools').toEqualTypeOf<true>();
  });

  it('exposes `model` as a string at the type level', () => {
    expectTypeOf<SessionProvider>().toHaveProperty('model').toEqualTypeOf<string>();
  });

  it('yields an AsyncIterable<SessionEvent>', async () => {
    const p = makeStub();
    const events: SessionEvent[] = [];
    for await (const ev of p.runSession({ messages: [] })) {
      events.push(ev);
    }
    expect(events).toHaveLength(2);
    expect(events[0]!.type).toBe('assistant_text');
    expect(events[1]!.type).toBe('done');
  });
});

describe('SessionInput', () => {
  it('accepts the minimal shape (messages only)', () => {
    const minimal: SessionInput = { messages: [] };
    expect(minimal.systemPrompt).toBeUndefined();
    expect(minimal.tools).toBeUndefined();
    expect(minimal.options).toBeUndefined();
    expect(minimal.maxTurns).toBeUndefined();
  });

  it('accepts the full shape and reuses LLMProvider types', () => {
    const msg: ChatMessage = { role: 'user', content: 'hi' };
    const tool: ToolDefinition = {
      type: 'function',
      function: { name: 't', description: '', parameters: {} },
    };
    const opts: ChatOptions = { temperature: 0.2 };
    const full: SessionInput = {
      systemPrompt: 'sys',
      messages: [msg],
      tools: [tool],
      options: opts,
      maxTurns: 8,
    };
    expect(full.tools).toHaveLength(1);
    expect(full.options?.temperature).toBe(0.2);
  });

  it('declares messages required and the rest optional at the type level', () => {
    expectTypeOf<SessionInput>().toHaveProperty('messages').toEqualTypeOf<ChatMessage[]>();
    expectTypeOf<SessionInput>().toHaveProperty('systemPrompt').toEqualTypeOf<string | undefined>();
    expectTypeOf<SessionInput>()
      .toHaveProperty('tools')
      .toEqualTypeOf<ToolDefinition[] | undefined>();
    expectTypeOf<SessionInput>().toHaveProperty('options').toEqualTypeOf<ChatOptions | undefined>();
    expectTypeOf<SessionInput>().toHaveProperty('maxTurns').toEqualTypeOf<number | undefined>();
  });
});

describe('SessionEvent — discriminated union', () => {
  it('narrows on `type` exhaustively', () => {
    function describe_(ev: SessionEvent): string {
      switch (ev.type) {
        case 'assistant_text':
          return `text:${ev.text}@${ev.turn}`;
        case 'tool_use':
          return `tool_use:${ev.name}#${ev.toolCallId}`;
        case 'tool_result':
          return `tool_result:${ev.toolCallId}${ev.isError ? '!' : ''}`;
        case 'usage':
          return `usage:${ev.usage.totalTokens ?? '?'}`;
        case 'done':
          return `done:${ev.finishReason}`;
        // Exhaustive — if a new variant is added without updating this
        // switch, TS will error here.
      }
    }
    expect(describe_({ type: 'assistant_text', text: 'a', turn: 1 })).toBe('text:a@1');
    expect(describe_({ type: 'tool_use', toolCallId: 'tc1', name: 'r', input: {}, turn: 1 })).toBe(
      'tool_use:r#tc1',
    );
    expect(
      describe_({ type: 'tool_result', toolCallId: 'tc1', output: 'ok', isError: false }),
    ).toBe('tool_result:tc1');
    expect(describe_({ type: 'usage', usage: { totalTokens: 42 } })).toBe('usage:42');
    expect(describe_({ type: 'done', finishReason: 'stop', finalContent: '' })).toBe('done:stop');
  });

  it('SessionAssistantTextEvent declares optional `delta` flag', () => {
    expectTypeOf<SessionAssistantTextEvent>()
      .toHaveProperty('delta')
      .toEqualTypeOf<boolean | undefined>();
  });

  it('SessionToolUseEvent carries parsed input (unknown), not raw JSON string', () => {
    expectTypeOf<SessionToolUseEvent>().toHaveProperty('input').toEqualTypeOf<unknown>();
  });

  it('SessionToolResultEvent carries stringified output + boolean isError', () => {
    expectTypeOf<SessionToolResultEvent>().toHaveProperty('output').toEqualTypeOf<string>();
    expectTypeOf<SessionToolResultEvent>().toHaveProperty('isError').toEqualTypeOf<boolean>();
  });

  it('SessionUsageEvent reuses TokenUsage from LLMProvider', () => {
    expectTypeOf<SessionUsageEvent>().toHaveProperty('usage').toEqualTypeOf<TokenUsage>();
  });

  it('SessionDoneEvent constrains finishReason to a closed set', () => {
    expectTypeOf<SessionDoneEvent>()
      .toHaveProperty('finishReason')
      .toEqualTypeOf<'stop' | 'max_turns' | 'cancelled' | 'error'>();
  });

  it('SessionDoneEvent constrains error.code to AgentOutput error codes', () => {
    const errored: SessionDoneEvent = {
      type: 'done',
      finishReason: 'error',
      finalContent: '',
      error: { code: 'LLM_ERROR', message: 'boom' },
    };
    expect(errored.error?.code).toBe('LLM_ERROR');
    // All four error codes accepted
    const codes: Array<NonNullable<SessionDoneEvent['error']>['code']> = [
      'INVALID_INPUT',
      'QUOTA_EXCEEDED',
      'LLM_ERROR',
      'INTERNAL_ERROR',
    ];
    expect(codes).toHaveLength(4);
  });
});

describe('ResolvedProvider — discriminated union', () => {
  it('narrows on `kind` to either LLMProvider or SessionProvider', () => {
    function pickStrategyHint(r: ResolvedProvider): 'orchestrator' | 'model-driven' | 'session' {
      if (r.kind === 'llm') {
        return r.provider.supportsTools ? 'model-driven' : 'orchestrator';
      }
      // kind === 'session'
      expectTypeOf(r.provider).toEqualTypeOf<SessionProvider>();
      return 'session';
    }
    const sessionWrapped: ResolvedProvider = { kind: 'session', provider: makeStub() };
    expect(pickStrategyHint(sessionWrapped)).toBe('session');

    // llm-side narrowing is type-only — we verify the discriminator field
    // is the only difference between the two arms.
    expectTypeOf<Extract<ResolvedProvider, { kind: 'llm' }>>()
      .toHaveProperty('provider')
      .toEqualTypeOf<LLMProvider>();
    expectTypeOf<Extract<ResolvedProvider, { kind: 'session' }>>()
      .toHaveProperty('provider')
      .toEqualTypeOf<SessionProvider>();
  });
});
