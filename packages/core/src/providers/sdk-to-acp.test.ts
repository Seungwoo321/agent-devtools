import { describe, expect, it } from 'vitest';
import { translateSdkMessage } from './sdk-to-acp.js';

describe('translateSdkMessage', () => {
  it('drops system init messages — they carry no user-visible content', () => {
    expect(translateSdkMessage({ type: 'system', subtype: 'init', cwd: '/x' })).toEqual([]);
  });

  it('emits agent_message_chunk for each non-empty text block in an assistant message', () => {
    const out = translateSdkMessage({
      type: 'assistant',
      message: {
        content: [
          { type: 'text', text: 'Hello,' },
          { type: 'text', text: '' },
          { type: 'text', text: ' world!' },
        ],
      },
    });
    expect(out).toEqual([
      {
        type: 'acp.session_update',
        update: {
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text: 'Hello,' },
        },
      },
      {
        type: 'acp.session_update',
        update: {
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text: ' world!' },
        },
      },
    ]);
  });

  it('emits a tool_call envelope for tool_use blocks and skips thinking blocks', () => {
    const out = translateSdkMessage({
      type: 'assistant',
      message: {
        content: [
          { type: 'thinking', thinking: 'pondering...' },
          { type: 'tool_use', id: 'tu-1', name: 'Read', input: { path: 'a.ts' } },
          { type: 'text', text: 'Reading file.' },
        ],
      },
    });
    expect(out).toEqual([
      {
        type: 'acp.session_update',
        update: {
          sessionUpdate: 'tool_call',
          toolCallId: 'tu-1',
          title: 'Read',
          _meta: { claudeCode: { toolName: 'Read' } },
        },
      },
      {
        type: 'acp.session_update',
        update: {
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text: 'Reading file.' },
        },
      },
    ]);
  });

  it('emits a completed tool_call_update with text content for a user tool_result block', () => {
    const out = translateSdkMessage({
      type: 'user',
      message: {
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'tu-1',
            content: [{ type: 'text', text: 'file contents' }],
          },
        ],
      },
    });
    expect(out).toEqual([
      {
        type: 'acp.session_update',
        update: {
          sessionUpdate: 'tool_call_update',
          toolCallId: 'tu-1',
          status: 'completed',
          content: [{ type: 'content', content: { type: 'text', text: 'file contents' } }],
        },
      },
    ]);
  });

  it('handles tool_result with a plain string content (legacy shape)', () => {
    const out = translateSdkMessage({
      type: 'user',
      message: {
        content: [{ type: 'tool_result', tool_use_id: 'tu-1', content: 'plain string' }],
      },
    });
    expect(out).toEqual([
      {
        type: 'acp.session_update',
        update: {
          sessionUpdate: 'tool_call_update',
          toolCallId: 'tu-1',
          status: 'completed',
          content: [{ type: 'content', content: { type: 'text', text: 'plain string' } }],
        },
      },
    ]);
  });

  it('omits content field when the tool_result has no text', () => {
    const out = translateSdkMessage({
      type: 'user',
      message: {
        content: [{ type: 'tool_result', tool_use_id: 'tu-1', content: [] }],
      },
    });
    expect(out).toEqual([
      {
        type: 'acp.session_update',
        update: {
          sessionUpdate: 'tool_call_update',
          toolCallId: 'tu-1',
          status: 'completed',
        },
      },
    ]);
  });

  it('drops user messages that are not tool_result wrappers — the widget echoes the prompt locally', () => {
    const out = translateSdkMessage({
      type: 'user',
      message: { content: [{ type: 'text', text: 'this is the user prompt' }] },
    });
    expect(out).toEqual([]);
  });

  it('maps a successful result with end_turn into acp.result', () => {
    expect(
      translateSdkMessage({
        type: 'result',
        subtype: 'success',
        stop_reason: 'end_turn',
        result: 'final answer',
      }),
    ).toEqual([{ type: 'acp.result', stopReason: 'end_turn' }]);
  });

  it('defaults stopReason to end_turn when success carries an unknown stop_reason', () => {
    expect(
      translateSdkMessage({ type: 'result', subtype: 'success', stop_reason: 'mystery' }),
    ).toEqual([{ type: 'acp.result', stopReason: 'end_turn' }]);
  });

  it('passes through max_tokens stop_reason from a successful result', () => {
    expect(
      translateSdkMessage({ type: 'result', subtype: 'success', stop_reason: 'max_tokens' }),
    ).toEqual([{ type: 'acp.result', stopReason: 'max_tokens' }]);
  });

  it('maps error result subtypes into the ACP cancelled stopReason', () => {
    expect(translateSdkMessage({ type: 'result', subtype: 'error_max_turns' })).toEqual([
      { type: 'acp.result', stopReason: 'cancelled' },
    ]);
  });

  it('returns [] for null / non-objects / unknown discriminators', () => {
    expect(translateSdkMessage(null)).toEqual([]);
    expect(translateSdkMessage('hi')).toEqual([]);
    expect(translateSdkMessage({ type: 'mystery' })).toEqual([]);
    expect(translateSdkMessage({})).toEqual([]);
  });

  it('returns [] for an assistant message with no content array', () => {
    expect(translateSdkMessage({ type: 'assistant', message: { content: null } })).toEqual([]);
    expect(translateSdkMessage({ type: 'assistant' })).toEqual([]);
  });
});
