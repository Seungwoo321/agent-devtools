/**
 * sdk-session-loop unit tests.
 *
 * Uses an in-memory `SessionProvider` stub whose `runSession` yields
 * a scripted sequence of `SessionEvent`s — no real SDK involved.
 * Each test asserts both the surface stream of `StreamEvent`s and the
 * final `AgentOutput` shape against the harness contract.
 */

import { describe, it, expect } from 'vitest';
import { sdkSessionLoop } from './sdk-session-loop.js';
import type {
  AgentInput,
  GenerationDomain,
  PromptProvider,
  StreamEvent,
  LoopConfig,
} from '../types.js';
import type { SessionProvider, SessionEvent, SessionInput } from '../../llm/session-types.js';

// ── Fixtures ─────────────────────────────────────────────────────────

function makePrompts(): PromptProvider {
  return {
    systemPrompt: 'sys',
    systemPromptFull: 'sys-full',
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

interface ProviderCapture {
  input?: SessionInput;
}

function makeSessionProvider(
  events: SessionEvent[] | ((capture: ProviderCapture) => AsyncIterable<SessionEvent>),
  capture: ProviderCapture = {},
  model = 'stub-session-model',
): SessionProvider {
  return {
    providerName: 'StubSession',
    model,
    supportsTools: true,
    runSession: ((sessionInput: SessionInput) => {
      capture.input = sessionInput;
      if (typeof events === 'function') return events(capture);
      const arr = events;
      return (async function* () {
        for (const e of arr) yield e;
      })();
    }) as SessionProvider['runSession'],
  };
}

async function collect(gen: AsyncGenerator<StreamEvent>): Promise<StreamEvent[]> {
  const out: StreamEvent[] = [];
  for await (const ev of gen) out.push(ev);
  return out;
}

const baseInput: AgentInput = { type: 'text', content: 'a button' };
const baseConfig: LoopConfig = { maxIterations: 8 };

// ── Happy path ───────────────────────────────────────────────────────

describe('sdkSessionLoop — happy path', () => {
  it('forwards assistant_text + done(stop) into start → complete with AgentOutput contract populated', async () => {
    const provider = makeSessionProvider([
      { type: 'assistant_text', text: 'final code here', turn: 1 },
      { type: 'usage', usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 } },
      {
        type: 'done',
        finishReason: 'stop',
        finalContent: 'final code here',
        usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      },
    ]);

    const events = await collect(
      sdkSessionLoop(
        { ...baseInput, options: { model: 'claude-sonnet-4-5' } },
        provider,
        makeAdapter(),
        makePrompts(),
        baseConfig,
      ),
    );

    expect(events[0]!.type).toBe('start');
    const final = events[events.length - 1]!;
    expect(final.type).toBe('complete');
    expect(final.data.output?.code).toBe('final code here');
    expect(final.data.output?.html).toBe('<div>final code here</div>');
    expect(final.data.output?.metadata).toMatchObject({
      model: 'claude-sonnet-4-5',
      provider: 'StubSession',
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    });
    expect(final.data.output?.validation?.valid).toBe(true);
  });

  it('forwards tool_use as progress events with domainData payload', async () => {
    const provider = makeSessionProvider([
      { type: 'assistant_text', text: 'I will read the file', turn: 1 },
      { type: 'tool_use', toolCallId: 'tu_1', name: 'Read', input: { path: '/x' }, turn: 1 },
      { type: 'tool_result', toolCallId: 'tu_1', output: 'file contents', isError: false },
      { type: 'assistant_text', text: 'code answer', turn: 2 },
      { type: 'done', finishReason: 'stop', finalContent: 'code answer' },
    ]);

    const events = await collect(
      sdkSessionLoop(baseInput, provider, makeAdapter(), makePrompts(), baseConfig),
    );
    const toolUse = events.find((e) => e.type === 'progress' && e.data.domainData?.name === 'Read');
    expect(toolUse).toBeDefined();
    expect(toolUse?.data.domainData).toMatchObject({
      toolCallId: 'tu_1',
      name: 'Read',
      input: { path: '/x' },
      turn: 1,
    });
  });

  it('forwards SessionInput shape including signal, model, maxTurns, systemPrompt', async () => {
    const capture: ProviderCapture = {};
    const ctrl = new AbortController();
    const provider = makeSessionProvider(
      [{ type: 'done', finishReason: 'stop', finalContent: 'x' }],
      capture,
    );

    await collect(
      sdkSessionLoop(
        { ...baseInput, options: { model: 'opus', signal: ctrl.signal } },
        provider,
        makeAdapter(),
        makePrompts(),
        { maxIterations: 12 },
      ),
    );

    expect(capture.input?.systemPrompt).toBe('sys-full');
    expect(capture.input?.maxTurns).toBe(12);
    expect(capture.input?.options?.model).toBe('opus');
    expect(capture.input?.options?.signal).toBe(ctrl.signal);
    expect(capture.input?.messages).toHaveLength(1);
    expect(capture.input?.messages[0]!.role).toBe('user');
  });

  it('falls back to provider.model in metadata.model when caller does not override via options.model', async () => {
    const provider = makeSessionProvider(
      [{ type: 'done', finishReason: 'stop', finalContent: 'x' }],
      {},
      'claude-sonnet-4-5',
    );

    const events = await collect(
      sdkSessionLoop(baseInput, provider, makeAdapter(), makePrompts(), baseConfig),
    );

    const final = events[events.length - 1]!;
    expect(final.type).toBe('complete');
    expect(final.data.output?.metadata?.model).toBe('claude-sonnet-4-5');
  });

  it('embeds previousOutput into the user opener as a fenced "modify this" block', async () => {
    const capture: ProviderCapture = {};
    const provider = makeSessionProvider(
      [{ type: 'done', finishReason: 'stop', finalContent: 'updated' }],
      capture,
    );

    await collect(
      sdkSessionLoop(
        { ...baseInput, previousOutput: 'prior code', options: { model: 'opus' } },
        provider,
        makeAdapter(),
        makePrompts(),
        baseConfig,
      ),
    );

    const content = capture.input?.messages[0]!.content;
    expect(typeof content).toBe('string');
    expect(content as string).toContain('--- Existing code (modify this) ---');
    expect(content as string).toContain('prior code');
  });
});

// ── max_turns is non-fatal ───────────────────────────────────────────

describe('sdkSessionLoop — max_turns', () => {
  it('still emits complete with whatever code was extractable when finishReason is max_turns', async () => {
    const provider = makeSessionProvider([
      { type: 'assistant_text', text: 'partial-but-valid', turn: 1 },
      { type: 'done', finishReason: 'max_turns', finalContent: 'partial-but-valid' },
    ]);
    const events = await collect(
      sdkSessionLoop(baseInput, provider, makeAdapter(), makePrompts(), baseConfig),
    );
    const final = events[events.length - 1]!;
    expect(final.type).toBe('complete');
    expect(final.data.output?.code).toBe('partial-but-valid');
  });
});

// ── Error pathways ───────────────────────────────────────────────────

describe('sdkSessionLoop — error pathways', () => {
  const cases: Array<{
    name: string;
    code: 'INVALID_INPUT' | 'QUOTA_EXCEEDED' | 'LLM_ERROR' | 'INTERNAL_ERROR';
    expectedErrorCode: StreamEvent['data']['errorCode'];
  }> = [
    { name: 'INVALID_INPUT', code: 'INVALID_INPUT', expectedErrorCode: 'INVALID_INPUT' },
    { name: 'QUOTA_EXCEEDED', code: 'QUOTA_EXCEEDED', expectedErrorCode: 'QUOTA_EXCEEDED' },
    { name: 'LLM_ERROR', code: 'LLM_ERROR', expectedErrorCode: 'LLM_ERROR' },
    { name: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR', expectedErrorCode: 'INTERNAL_ERROR' },
  ];

  for (const c of cases) {
    it(`forwards SessionDoneEvent.error.code = ${c.name} as StreamEvent.data.errorCode unchanged`, async () => {
      const provider = makeSessionProvider([
        {
          type: 'done',
          finishReason: 'error',
          finalContent: '',
          error: { code: c.code, message: `boom ${c.name}` },
        },
      ]);
      const events = await collect(
        sdkSessionLoop(baseInput, provider, makeAdapter(), makePrompts(), baseConfig),
      );
      const err = events.find((e) => e.type === 'error');
      expect(err).toBeDefined();
      expect(err?.data.errorCode).toBe(c.expectedErrorCode);
      expect(err?.data.error).toContain(`boom ${c.name}`);
      // No complete event after error.
      expect(events.find((e) => e.type === 'complete')).toBeUndefined();
    });
  }

  it('cancelled finishReason produces INTERNAL_ERROR (caller deliberately aborted)', async () => {
    const provider = makeSessionProvider([
      { type: 'done', finishReason: 'cancelled', finalContent: '' },
    ]);
    const events = await collect(
      sdkSessionLoop(baseInput, provider, makeAdapter(), makePrompts(), baseConfig),
    );
    const err = events.find((e) => e.type === 'error');
    expect(err?.data.errorCode).toBe('INTERNAL_ERROR');
    expect(err?.data.error).toMatch(/cancelled/i);
  });

  it('treats a provider that exits without emitting done as INTERNAL_ERROR', async () => {
    const provider = makeSessionProvider([{ type: 'assistant_text', text: 'hung', turn: 1 }]);
    const events = await collect(
      sdkSessionLoop(baseInput, provider, makeAdapter(), makePrompts(), baseConfig),
    );
    const err = events.find((e) => e.type === 'error');
    expect(err?.data.errorCode).toBe('INTERNAL_ERROR');
    expect(err?.data.error).toMatch(/without emitting a done event/i);
  });

  it('catches a provider that throws mid-stream as INTERNAL_ERROR (contract violation)', async () => {
    const provider = makeSessionProvider(() =>
      (async function* () {
        yield { type: 'assistant_text', text: 'before crash', turn: 1 };
        throw new Error('provider crashed');
      })(),
    );
    const events = await collect(
      sdkSessionLoop(baseInput, provider, makeAdapter(), makePrompts(), baseConfig),
    );
    const err = events.find((e) => e.type === 'error');
    expect(err?.data.errorCode).toBe('INTERNAL_ERROR');
    expect(err?.data.error).toBe('provider crashed');
  });

  it('emits LLM_ERROR when session produced no content at all', async () => {
    const provider = makeSessionProvider([
      { type: 'done', finishReason: 'stop', finalContent: '' },
    ]);
    const events = await collect(
      sdkSessionLoop(baseInput, provider, makeAdapter(), makePrompts(), baseConfig),
    );
    const err = events.find((e) => e.type === 'error');
    expect(err?.data.errorCode).toBe('LLM_ERROR');
  });

  it('emits LLM_ERROR when extractCode returns empty', async () => {
    const provider = makeSessionProvider([
      { type: 'done', finishReason: 'stop', finalContent: 'some text' },
    ]);
    const adapter = makeAdapter({ extractCode: () => '' });
    const events = await collect(
      sdkSessionLoop(baseInput, provider, adapter, makePrompts(), baseConfig),
    );
    const err = events.find((e) => e.type === 'error');
    expect(err?.data.errorCode).toBe('LLM_ERROR');
    expect(err?.data.error).toMatch(/no code/i);
  });
});

// ── AgentOutput contract completeness ────────────────────────────────

describe('sdkSessionLoop — AgentOutput contract', () => {
  it('populates metadata.model from input.options.model and metadata.provider from provider', async () => {
    const provider = makeSessionProvider([
      { type: 'done', finishReason: 'stop', finalContent: 'x' },
    ]);
    const events = await collect(
      sdkSessionLoop(
        { ...baseInput, options: { model: 'claude-opus-4-7' } },
        provider,
        makeAdapter(),
        makePrompts(),
        baseConfig,
      ),
    );
    const out = events[events.length - 1]!.data.output;
    expect(out?.metadata?.model).toBe('claude-opus-4-7');
    expect(out?.metadata?.provider).toBe('StubSession');
  });

  it('records validation.valid=false when adapter.parse rejects', async () => {
    const adapter = makeAdapter({
      parse: () => ({ valid: false, error: 'bad syntax' }),
    });
    const provider = makeSessionProvider([
      { type: 'done', finishReason: 'stop', finalContent: 'junk' },
    ]);
    const events = await collect(
      sdkSessionLoop(baseInput, provider, adapter, makePrompts(), baseConfig),
    );
    const out = events[events.length - 1]!.data.output;
    expect(out?.validation?.valid).toBe(false);
    expect(out?.validation?.issues?.[0]!.message).toBe('bad syntax');
  });

  it('records validation score + issues when adapter.validate returns them', async () => {
    const adapter = makeAdapter({
      validate: () => ({
        score: 88,
        issues: [{ severity: 'warning', message: 'minor', suggestion: 'tweak' }],
      }),
    });
    const provider = makeSessionProvider([
      { type: 'done', finishReason: 'stop', finalContent: 'good' },
    ]);
    const events = await collect(
      sdkSessionLoop(baseInput, provider, adapter, makePrompts(), baseConfig),
    );
    const out = events[events.length - 1]!.data.output;
    expect(out?.validation?.valid).toBe(true);
    expect(out?.validation?.score).toBe(88);
    expect(out?.validation?.issues?.[0]).toMatchObject({
      severity: 'warning',
      message: 'minor',
      suggestion: 'tweak',
    });
  });

  it('accumulates usage from the final done event into AgentOutput.metadata.usage', async () => {
    const provider = makeSessionProvider([
      { type: 'usage', usage: { inputTokens: 10 } },
      {
        type: 'done',
        finishReason: 'stop',
        finalContent: 'x',
        usage: { inputTokens: 200, outputTokens: 100, totalTokens: 300 },
      },
    ]);
    const events = await collect(
      sdkSessionLoop(baseInput, provider, makeAdapter(), makePrompts(), baseConfig),
    );
    const usage = events[events.length - 1]!.data.output?.metadata?.usage;
    expect(usage).toEqual({ inputTokens: 200, outputTokens: 100, totalTokens: 300 });
  });
});
