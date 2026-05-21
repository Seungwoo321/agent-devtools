/**
 * ClaudeAgentSDKProvider unit tests.
 *
 * The SDK is replaced via `__sdkLoader` so tests run without the real
 * `@anthropic-ai/claude-agent-sdk` package being loadable — the loader
 * indirection is exported for exactly this purpose. Each test injects a
 * different sequence of SDK messages and asserts the resulting
 * `SessionEvent` stream and final `done` shape.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  ClaudeAgentSDKProvider,
  __sdkLoader,
  type ClaudeAgentSDKConfig,
} from './claude-agent-sdk.js';
import type { SessionEvent, SessionInput, SessionDoneEvent } from './session-types.js';

// ── Fake SDK harness ─────────────────────────────────────────────────

interface FakeSDKMessage {
  type: string;
  [k: string]: unknown;
}

interface FakeQueryCapture {
  prompt: string;
  options: Record<string, unknown>;
}

function installFakeSDK(
  scriptedMessages: FakeSDKMessage[] | (() => AsyncIterable<FakeSDKMessage>),
  capture?: FakeQueryCapture,
): void {
  __sdkLoader.load = async () => ({
    query: (params: { prompt: string; options?: Record<string, unknown> }) => {
      if (capture) {
        capture.prompt = params.prompt;
        capture.options = params.options ?? {};
      }
      if (typeof scriptedMessages === 'function') {
        return scriptedMessages();
      }
      const msgs = scriptedMessages;
      return (async function* () {
        for (const m of msgs) yield m;
      })();
    },
  });
}

async function collect(
  input: SessionInput,
  cfg?: Partial<ClaudeAgentSDKConfig>,
): Promise<SessionEvent[]> {
  const provider = new ClaudeAgentSDKProvider({ model: 'claude-sonnet-4-5', ...cfg });
  const out: SessionEvent[] = [];
  for await (const ev of provider.runSession(input)) out.push(ev);
  return out;
}

function userMsg(text: string) {
  return { role: 'user' as const, content: text };
}

const originalLoad = __sdkLoader.load;

beforeEach(() => {
  __sdkLoader.load = originalLoad;
});

afterEach(() => {
  __sdkLoader.load = originalLoad;
});

// ── Construction ─────────────────────────────────────────────────────

describe('ClaudeAgentSDKProvider — construction', () => {
  it('exposes providerName, model, and supportsTools literal `true`', () => {
    const p = new ClaudeAgentSDKProvider({ model: 'claude-sonnet-4-5' });
    expect(p.providerName).toBe('ClaudeAgentSDK');
    expect(p.model).toBe('claude-sonnet-4-5');
    expect(p.supportsTools).toBe(true);
  });

  it('throws when constructed without a model (No-Fallback policy)', () => {
    expect(() => new ClaudeAgentSDKProvider({ model: '' })).toThrow(/model is required/i);
  });
});

// ── Happy path ───────────────────────────────────────────────────────

describe('ClaudeAgentSDKProvider — success path', () => {
  it('maps assistant text + result(success) into assistant_text + usage + done(stop)', async () => {
    installFakeSDK([
      {
        type: 'assistant',
        message: {
          content: [
            { type: 'text', text: 'Hello ' },
            { type: 'text', text: 'world' },
          ],
        },
      },
      {
        type: 'result',
        subtype: 'success',
        result: 'Hello world',
        usage: { input_tokens: 10, output_tokens: 5 },
      },
    ]);

    const events = await collect({ messages: [userMsg('hi')] });

    expect(events.map((e) => e.type)).toEqual([
      'assistant_text',
      'assistant_text',
      'usage',
      'done',
    ]);
    expect((events[0] as { text: string; turn: number }).text).toBe('Hello ');
    expect((events[0] as { turn: number }).turn).toBe(1);

    const done = events[3] as SessionDoneEvent;
    expect(done.finishReason).toBe('stop');
    expect(done.finalContent).toBe('Hello world');
    expect(done.usage).toEqual({ inputTokens: 10, outputTokens: 5, totalTokens: 15 });
  });

  it('emits tool_use events when assistant turn includes tool_use blocks', async () => {
    installFakeSDK([
      {
        type: 'assistant',
        message: {
          content: [
            { type: 'text', text: 'calling tool' },
            { type: 'tool_use', id: 'tu_1', name: 'Read', input: { path: '/foo' } },
          ],
        },
      },
      {
        type: 'result',
        subtype: 'success',
        result: 'done',
        usage: { input_tokens: 4, output_tokens: 2 },
      },
    ]);

    const events = await collect({ messages: [userMsg('read foo')] });
    const toolUse = events.find((e) => e.type === 'tool_use');
    expect(toolUse).toBeDefined();
    expect(toolUse).toMatchObject({
      type: 'tool_use',
      toolCallId: 'tu_1',
      name: 'Read',
      input: { path: '/foo' },
      turn: 1,
    });
  });

  it('emits delta assistant_text for stream_event variants when SDK includes partials', async () => {
    installFakeSDK([
      { type: 'stream_event', event: { delta: { type: 'text_delta', text: 'partial' } } },
      {
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'final' }] },
      },
      {
        type: 'result',
        subtype: 'success',
        result: 'final',
        usage: { input_tokens: 1, output_tokens: 1 },
      },
    ]);

    const events = await collect({ messages: [userMsg('hi')] });
    const delta = events.find((e) => e.type === 'assistant_text' && 'delta' in e && e.delta);
    expect(delta).toBeDefined();
    expect((delta as { text: string }).text).toBe('partial');
  });
});

// ── Caller-supplied configuration is forwarded to SDK ────────────────

describe('ClaudeAgentSDKProvider — SDK option forwarding', () => {
  it('forwards model / systemPrompt / maxTurns / permissionMode / allowedTools to SDK options', async () => {
    const capture: FakeQueryCapture = { prompt: '', options: {} };
    installFakeSDK(
      [
        {
          type: 'result',
          subtype: 'success',
          result: 'ok',
          usage: { input_tokens: 1, output_tokens: 1 },
        },
      ],
      capture,
    );

    await collect(
      {
        systemPrompt: 'You are helpful.',
        messages: [userMsg('do the thing')],
        maxTurns: 7,
        options: { model: 'claude-opus-4-7' },
      },
      { allowedTools: ['Read', 'Edit'], permissionMode: 'acceptEdits' },
    );

    expect(capture.prompt).toBe('do the thing');
    expect(capture.options.model).toBe('claude-opus-4-7');
    expect(capture.options.systemPrompt).toBe('You are helpful.');
    expect(capture.options.maxTurns).toBe(7);
    expect(capture.options.allowedTools).toEqual(['Read', 'Edit']);
    expect(capture.options.permissionMode).toBe('acceptEdits');
    expect(capture.options.abortController).toBeInstanceOf(AbortController);
  });

  it('defaults permissionMode to bypassPermissions for headless operation', async () => {
    const capture: FakeQueryCapture = { prompt: '', options: {} };
    installFakeSDK(
      [
        {
          type: 'result',
          subtype: 'success',
          result: 'ok',
          usage: { input_tokens: 1, output_tokens: 1 },
        },
      ],
      capture,
    );
    await collect({ messages: [userMsg('hi')] });
    expect(capture.options.permissionMode).toBe('bypassPermissions');
  });

  it('reads last user message as prompt (ignores prior turns and content arrays mix)', async () => {
    const capture: FakeQueryCapture = { prompt: '', options: {} };
    installFakeSDK(
      [
        {
          type: 'result',
          subtype: 'success',
          result: 'ok',
          usage: { input_tokens: 1, output_tokens: 1 },
        },
      ],
      capture,
    );

    await collect({
      messages: [
        { role: 'user', content: 'first' },
        { role: 'assistant', content: 'reply 1' },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'line A' },
            { type: 'text', text: 'line B' },
          ],
        },
      ],
    });

    expect(capture.prompt).toBe('line A\nline B');
  });

  it('emits done(error, INVALID_INPUT) when no user message is present', async () => {
    installFakeSDK([]);
    const events = await collect({ messages: [{ role: 'assistant', content: 'no user here' }] });
    expect(events).toHaveLength(1);
    const done = events[0] as SessionDoneEvent;
    expect(done.finishReason).toBe('error');
    expect(done.error?.code).toBe('INVALID_INPUT');
  });
});

// ── Error mapping ────────────────────────────────────────────────────

describe('ClaudeAgentSDKProvider — SDKAssistantMessageError mapping', () => {
  const cases: Array<{
    sdkErr: string;
    code: SessionDoneEvent['error'] extends infer E
      ? E extends { code: infer C }
        ? C
        : never
      : never;
    finish: SessionDoneEvent['finishReason'];
  }> = [
    { sdkErr: 'invalid_request', code: 'INVALID_INPUT', finish: 'error' },
    { sdkErr: 'billing_error', code: 'QUOTA_EXCEEDED', finish: 'error' },
    { sdkErr: 'rate_limit', code: 'QUOTA_EXCEEDED', finish: 'error' },
    { sdkErr: 'authentication_failed', code: 'LLM_ERROR', finish: 'error' },
    { sdkErr: 'oauth_org_not_allowed', code: 'LLM_ERROR', finish: 'error' },
    { sdkErr: 'server_error', code: 'LLM_ERROR', finish: 'error' },
    { sdkErr: 'unknown', code: 'LLM_ERROR', finish: 'error' },
  ];

  for (const c of cases) {
    it(`maps SDKAssistantMessageError "${c.sdkErr}" → done(${c.finish}, ${c.code})`, async () => {
      installFakeSDK([
        {
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'partial answer' }] },
          error: c.sdkErr,
        },
      ]);
      const events = await collect({ messages: [userMsg('hi')] });
      const done = events.find((e) => e.type === 'done') as SessionDoneEvent;
      expect(done.finishReason).toBe(c.finish);
      expect(done.error?.code).toBe(c.code);
      expect(done.finalContent).toBe('partial answer');
    });
  }

  it('maps SDKAssistantMessageError "max_output_tokens" → done(max_turns) (not an error)', async () => {
    installFakeSDK([
      {
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'truncated' }] },
        error: 'max_output_tokens',
      },
    ]);
    const events = await collect({ messages: [userMsg('hi')] });
    const done = events.find((e) => e.type === 'done') as SessionDoneEvent;
    expect(done.finishReason).toBe('max_turns');
    expect(done.error).toBeUndefined();
  });

  it('auth_status with error yields done(error, LLM_ERROR)', async () => {
    installFakeSDK([{ type: 'auth_status', error: 'token expired' }]);
    const events = await collect({ messages: [userMsg('hi')] });
    const done = events.find((e) => e.type === 'done') as SessionDoneEvent;
    expect(done.finishReason).toBe('error');
    expect(done.error?.code).toBe('LLM_ERROR');
    expect(done.error?.message).toContain('token expired');
  });
});

// ── Result-level error subtypes ──────────────────────────────────────

describe('ClaudeAgentSDKProvider — result subtype mapping', () => {
  it('error_max_turns → done(max_turns) (no error field)', async () => {
    installFakeSDK([
      {
        type: 'result',
        subtype: 'error_max_turns',
        errors: ['turn cap hit'],
        usage: { input_tokens: 100, output_tokens: 50 },
      },
    ]);
    const events = await collect({ messages: [userMsg('hi')] });
    const done = events.find((e) => e.type === 'done') as SessionDoneEvent;
    expect(done.finishReason).toBe('max_turns');
    expect(done.error).toBeUndefined();
    expect(done.usage?.totalTokens).toBe(150);
  });

  it('error_max_budget_usd → done(error, QUOTA_EXCEEDED)', async () => {
    installFakeSDK([
      {
        type: 'result',
        subtype: 'error_max_budget_usd',
        errors: ['budget exceeded'],
        usage: { input_tokens: 1, output_tokens: 1 },
      },
    ]);
    const events = await collect({ messages: [userMsg('hi')] });
    const done = events.find((e) => e.type === 'done') as SessionDoneEvent;
    expect(done.finishReason).toBe('error');
    expect(done.error?.code).toBe('QUOTA_EXCEEDED');
  });

  it('rate_limit_event(rejected) preceding result(error) → done(error, QUOTA_EXCEEDED)', async () => {
    installFakeSDK([
      { type: 'rate_limit_event', rate_limit_info: { status: 'rejected' } },
      {
        type: 'result',
        subtype: 'error_during_execution',
        errors: ['rate limit'],
        usage: { input_tokens: 0, output_tokens: 0 },
      },
    ]);
    const events = await collect({ messages: [userMsg('hi')] });
    const done = events.find((e) => e.type === 'done') as SessionDoneEvent;
    expect(done.finishReason).toBe('error');
    expect(done.error?.code).toBe('QUOTA_EXCEEDED');
  });

  it('generic result(error_during_execution) without rate limit → done(error, LLM_ERROR)', async () => {
    installFakeSDK([
      {
        type: 'result',
        subtype: 'error_during_execution',
        errors: ['boom'],
        usage: { input_tokens: 0, output_tokens: 0 },
      },
    ]);
    const events = await collect({ messages: [userMsg('hi')] });
    const done = events.find((e) => e.type === 'done') as SessionDoneEvent;
    expect(done.finishReason).toBe('error');
    expect(done.error?.code).toBe('LLM_ERROR');
    expect(done.error?.message).toBe('boom');
  });
});

// ── Abort signal ─────────────────────────────────────────────────────

describe('ClaudeAgentSDKProvider — abort handling', () => {
  it('emits done(cancelled) when caller signal aborts mid-stream', async () => {
    const ctrl = new AbortController();
    installFakeSDK(() =>
      (async function* () {
        yield { type: 'assistant', message: { content: [{ type: 'text', text: 'first chunk' }] } };
        ctrl.abort();
        yield { type: 'assistant', message: { content: [{ type: 'text', text: 'second chunk' }] } };
        yield {
          type: 'result',
          subtype: 'success',
          result: 'never reached',
          usage: { input_tokens: 1, output_tokens: 1 },
        };
      })(),
    );

    const events = await collect({
      messages: [userMsg('hi')],
      options: { signal: ctrl.signal },
    });
    const done = events.find((e) => e.type === 'done') as SessionDoneEvent;
    expect(done.finishReason).toBe('cancelled');
    expect(done.error).toBeUndefined();
  });

  it('emits done(cancelled) when signal is already aborted at start', async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    installFakeSDK([
      { type: 'assistant', message: { content: [{ type: 'text', text: 'should not see this' }] } },
      {
        type: 'result',
        subtype: 'success',
        result: 'x',
        usage: { input_tokens: 1, output_tokens: 1 },
      },
    ]);
    const events = await collect({
      messages: [userMsg('hi')],
      options: { signal: ctrl.signal },
    });
    const done = events.find((e) => e.type === 'done') as SessionDoneEvent;
    expect(done.finishReason).toBe('cancelled');
  });

  it('catches AbortError thrown inside the SDK iterator', async () => {
    installFakeSDK(() =>
      (async function* () {
        yield { type: 'assistant', message: { content: [{ type: 'text', text: 'partial' }] } };
        const e = new Error('aborted');
        e.name = 'AbortError';
        throw e;
      })(),
    );
    const events = await collect({ messages: [userMsg('hi')] });
    const done = events.find((e) => e.type === 'done') as SessionDoneEvent;
    expect(done.finishReason).toBe('cancelled');
  });
});

// ── Iterator surprises ───────────────────────────────────────────────

describe('ClaudeAgentSDKProvider — iterator failure modes', () => {
  it('emits done(error, INTERNAL_ERROR) when the SDK iterator ends without a result', async () => {
    installFakeSDK([
      { type: 'assistant', message: { content: [{ type: 'text', text: 'lonely' }] } },
    ]);
    const events = await collect({ messages: [userMsg('hi')] });
    const done = events.find((e) => e.type === 'done') as SessionDoneEvent;
    expect(done.finishReason).toBe('error');
    expect(done.error?.code).toBe('INTERNAL_ERROR');
    expect(done.finalContent).toBe('lonely');
  });

  it('emits done(error, LLM_ERROR) when SDK throws a generic Error', async () => {
    installFakeSDK(() =>
      (async function* () {
        yield { type: 'assistant', message: { content: [{ type: 'text', text: 'before crash' }] } };
        throw new Error('upstream blew up');
      })(),
    );
    const events = await collect({ messages: [userMsg('hi')] });
    const done = events.find((e) => e.type === 'done') as SessionDoneEvent;
    expect(done.finishReason).toBe('error');
    expect(done.error?.code).toBe('LLM_ERROR');
    expect(done.error?.message).toBe('upstream blew up');
  });

  it('propagates a useful error message when the SDK module is not installed', async () => {
    __sdkLoader.load = async () => {
      throw new Error('Cannot find module');
    };
    const events = await collect({ messages: [userMsg('hi')] });
    const done = events.find((e) => e.type === 'done') as SessionDoneEvent;
    expect(done.finishReason).toBe('error');
    expect(done.error?.code).toBe('LLM_ERROR');
    expect(done.error?.message).toMatch(/Cannot find module/);
  });
});

// ── API key forwarding ───────────────────────────────────────────────

describe('ClaudeAgentSDKProvider — apiKey forwarding', () => {
  it('passes apiKey through options.env.ANTHROPIC_API_KEY when configured', async () => {
    const capture: FakeQueryCapture = { prompt: '', options: {} };
    installFakeSDK(
      [
        {
          type: 'result',
          subtype: 'success',
          result: 'ok',
          usage: { input_tokens: 1, output_tokens: 1 },
        },
      ],
      capture,
    );
    await collect({ messages: [userMsg('hi')] }, { apiKey: 'sk-test-123' });
    const env = capture.options.env as Record<string, string>;
    expect(env.ANTHROPIC_API_KEY).toBe('sk-test-123');
  });

  it('omits env entirely when apiKey is not configured (SDK falls back to OAuth)', async () => {
    const capture: FakeQueryCapture = { prompt: '', options: {} };
    installFakeSDK(
      [
        {
          type: 'result',
          subtype: 'success',
          result: 'ok',
          usage: { input_tokens: 1, output_tokens: 1 },
        },
      ],
      capture,
    );
    await collect({ messages: [userMsg('hi')] });
    expect(capture.options.env).toBeUndefined();
  });
});
