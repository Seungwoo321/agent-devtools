import { describe, expect, it } from 'vitest';
import {
  createAcpDecoderState,
  createSSEParserState,
  parseSSEChunk,
  toStreamEvent,
  toStreamEvents,
  type AcpDecoderState,
} from './sse.js';

function testDecoder(): AcpDecoderState {
  // Deterministic block-id minter so tests can assert exact values without
  // depending on `crypto.randomUUID()`.
  return createAcpDecoderState({ mintBlockId: (seq) => `acp:test:${String(seq)}` });
}

describe('parseSSEChunk', () => {
  it('parses a single event with an explicit event name', () => {
    const state = createSSEParserState();
    const events = parseSSEChunk(
      state,
      'event: text-delta\ndata: {"blockId":"b1","text":"hi"}\n\n',
    );
    expect(events).toEqual([{ event: 'text-delta', data: '{"blockId":"b1","text":"hi"}' }]);
    expect(state.buffer).toBe('');
  });

  it('falls back to the default event name when none is supplied', () => {
    const state = createSSEParserState();
    const events = parseSSEChunk(state, 'data: {"a":1}\n\n');
    expect(events).toEqual([{ event: 'message', data: '{"a":1}' }]);
  });

  it('joins multiple data: lines with newlines', () => {
    const state = createSSEParserState();
    const events = parseSSEChunk(state, 'event: x\ndata: line one\ndata: line two\n\n');
    expect(events).toEqual([{ event: 'x', data: 'line one\nline two' }]);
  });

  it('handles chunk boundaries inside an event', () => {
    const state = createSSEParserState();
    const a = parseSSEChunk(state, 'event: text-del');
    expect(a).toEqual([]);
    const b = parseSSEChunk(state, 'ta\ndata: "x"');
    expect(b).toEqual([]);
    const c = parseSSEChunk(state, '\n\n');
    expect(c).toEqual([{ event: 'text-delta', data: '"x"' }]);
  });

  it('tolerates CRLF line endings', () => {
    const state = createSSEParserState();
    const events = parseSSEChunk(state, 'event: done\r\ndata: {}\r\n\r\n');
    expect(events).toEqual([{ event: 'done', data: '{}' }]);
  });

  it('survives a chunk boundary that splits a CRLF pair', () => {
    const state = createSSEParserState();
    const a = parseSSEChunk(state, 'event: done\r\ndata: {}\r');
    expect(a).toEqual([]);
    const b = parseSSEChunk(state, '\n\r\n');
    expect(b).toEqual([{ event: 'done', data: '{}' }]);
  });

  it('skips comment lines and empty fields', () => {
    const state = createSSEParserState();
    const events = parseSSEChunk(state, ': keep-alive\nevent: x\ndata: {"x":1}\n\n');
    expect(events).toEqual([{ event: 'x', data: '{"x":1}' }]);
  });

  it('discards events without a data line', () => {
    const state = createSSEParserState();
    const events = parseSSEChunk(state, 'event: x\n\n');
    expect(events).toEqual([]);
  });

  it('parses several events from one chunk', () => {
    const state = createSSEParserState();
    const events = parseSSEChunk(state, 'event: a\ndata: 1\n\nevent: b\ndata: 2\n\n');
    expect(events).toEqual([
      { event: 'a', data: '1' },
      { event: 'b', data: '2' },
    ]);
  });
});

describe('toStreamEvent', () => {
  it('lowers a text-delta event', () => {
    expect(
      toStreamEvent({ event: 'text-delta', data: JSON.stringify({ blockId: 'b1', text: 'hi' }) }),
    ).toEqual({ type: 'text-delta', blockId: 'b1', text: 'hi' });
  });

  it('lowers a tool-use lifecycle', () => {
    expect(
      toStreamEvent({
        event: 'tool-use-start',
        data: JSON.stringify({ blockId: 'tu1', name: 'inspect_element' }),
      }),
    ).toEqual({ type: 'tool-use-start', blockId: 'tu1', name: 'inspect_element' });
    expect(
      toStreamEvent({
        event: 'tool-use-delta',
        data: JSON.stringify({ blockId: 'tu1', partialInput: '{"sel' }),
      }),
    ).toEqual({ type: 'tool-use-delta', blockId: 'tu1', partialInput: '{"sel' });
    expect(
      toStreamEvent({ event: 'tool-use-stop', data: JSON.stringify({ blockId: 'tu1' }) }),
    ).toEqual({
      type: 'tool-use-stop',
      blockId: 'tu1',
    });
  });

  it('lowers tool-result with the optional isError flag', () => {
    expect(
      toStreamEvent({
        event: 'tool-result',
        data: JSON.stringify({ toolUseId: 'tu1', content: 'ok' }),
      }),
    ).toEqual({ type: 'tool-result', toolUseId: 'tu1', content: 'ok' });
    expect(
      toStreamEvent({
        event: 'tool-result',
        data: JSON.stringify({ toolUseId: 'tu1', content: 'bad', isError: true }),
      }),
    ).toEqual({ type: 'tool-result', toolUseId: 'tu1', content: 'bad', isError: true });
  });

  it('lowers error + done', () => {
    expect(toStreamEvent({ event: 'error', data: JSON.stringify({ message: 'boom' }) })).toEqual({
      type: 'error',
      message: 'boom',
    });
    expect(toStreamEvent({ event: 'done', data: '{}' })).toEqual({ type: 'done' });
  });

  it('returns null for unknown event names', () => {
    expect(toStreamEvent({ event: 'unknown', data: '{}' })).toBeNull();
  });

  it('returns null for malformed JSON', () => {
    expect(toStreamEvent({ event: 'done', data: 'not-json' })).toBeNull();
  });

  it('returns null when required fields are missing', () => {
    expect(toStreamEvent({ event: 'text-delta', data: '{"blockId":"b1"}' })).toBeNull();
  });
});

describe('toStreamEvents (ACP envelope)', () => {
  const sessionUpdate = (update: unknown): string =>
    JSON.stringify({ type: 'acp.session_update', update });

  it('wraps a legacy single event in a one-element array', () => {
    const state = testDecoder();
    expect(
      toStreamEvents(state, { event: 'text-delta', data: '{"blockId":"b1","text":"hi"}' }),
    ).toEqual([{ type: 'text-delta', blockId: 'b1', text: 'hi' }]);
  });

  it('returns an empty array for an unknown legacy event', () => {
    const state = testDecoder();
    expect(toStreamEvents(state, { event: 'unknown', data: '{}' })).toEqual([]);
  });

  it('lowers ACP agent_message_chunk into a single text-delta with a fresh blockId', () => {
    const state = testDecoder();
    const raw = {
      event: 'message',
      data: sessionUpdate({
        sessionUpdate: 'agent_message_chunk',
        content: { type: 'text', text: 'ok' },
      }),
    };
    expect(toStreamEvents(state, raw)).toEqual([
      { type: 'text-delta', blockId: 'acp:test:1', text: 'ok' },
    ]);
  });

  it('reuses the same blockId across consecutive agent_message_chunk events in one turn', () => {
    const state = testDecoder();
    const chunk = (text: string): { event: string; data: string } => ({
      event: 'message',
      data: sessionUpdate({
        sessionUpdate: 'agent_message_chunk',
        content: { type: 'text', text },
      }),
    });
    const first = toStreamEvents(state, chunk('hel'));
    const second = toStreamEvents(state, chunk('lo'));
    expect(first).toEqual([{ type: 'text-delta', blockId: 'acp:test:1', text: 'hel' }]);
    expect(second).toEqual([{ type: 'text-delta', blockId: 'acp:test:1', text: 'lo' }]);
  });

  it('mints a fresh blockId for the next turn after acp.result closed the previous block', () => {
    const state = testDecoder();
    const chunk = (text: string): { event: string; data: string } => ({
      event: 'message',
      data: sessionUpdate({
        sessionUpdate: 'agent_message_chunk',
        content: { type: 'text', text },
      }),
    });
    const result = {
      event: 'message',
      data: JSON.stringify({ type: 'acp.result', stopReason: 'end_turn' }),
    };

    expect(toStreamEvents(state, chunk('turn 1'))).toEqual([
      { type: 'text-delta', blockId: 'acp:test:1', text: 'turn 1' },
    ]);
    expect(toStreamEvents(state, result)).toEqual([
      { type: 'text-stop', blockId: 'acp:test:1' },
      { type: 'done' },
    ]);
    expect(toStreamEvents(state, chunk('turn 2'))).toEqual([
      { type: 'text-delta', blockId: 'acp:test:2', text: 'turn 2' },
    ]);
  });

  it('drops empty agent_message_chunk without opening a block', () => {
    const state = testDecoder();
    const raw = {
      event: 'message',
      data: sessionUpdate({
        sessionUpdate: 'agent_message_chunk',
        content: { type: 'text', text: '' },
      }),
    };
    expect(toStreamEvents(state, raw)).toEqual([]);
    // Subsequent non-empty chunk should still mint seq 1, not seq 2.
    expect(
      toStreamEvents(state, {
        event: 'message',
        data: sessionUpdate({
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text: 'hi' },
        }),
      }),
    ).toEqual([{ type: 'text-delta', blockId: 'acp:test:1', text: 'hi' }]);
  });

  it('lowers a tool_call into tool-use-start with the agent-provided title', () => {
    const state = testDecoder();
    const raw = {
      event: 'message',
      data: sessionUpdate({
        sessionUpdate: 'tool_call',
        toolCallId: 'tc-1',
        title: 'Run Command',
        _meta: { claudeCode: { toolName: 'Bash' } },
      }),
    };
    expect(toStreamEvents(state, raw)).toEqual([
      { type: 'tool-use-start', blockId: 'tc-1', name: 'Run Command' },
    ]);
  });

  it('falls back to claudeCode.toolName when the title is missing', () => {
    const state = testDecoder();
    const raw = {
      event: 'message',
      data: sessionUpdate({
        sessionUpdate: 'tool_call',
        toolCallId: 'tc-2',
        _meta: { claudeCode: { toolName: 'Read' } },
      }),
    };
    expect(toStreamEvents(state, raw)).toEqual([
      { type: 'tool-use-start', blockId: 'tc-2', name: 'Read' },
    ]);
  });

  it('closes the open text block on a tool_call boundary and mints a fresh one after', () => {
    const state = testDecoder();
    const chunk = (text: string): { event: string; data: string } => ({
      event: 'message',
      data: sessionUpdate({
        sessionUpdate: 'agent_message_chunk',
        content: { type: 'text', text },
      }),
    });
    const toolCall = {
      event: 'message',
      data: sessionUpdate({
        sessionUpdate: 'tool_call',
        toolCallId: 'tc-1',
        title: 'Read File',
      }),
    };

    expect(toStreamEvents(state, chunk('let me check'))).toEqual([
      { type: 'text-delta', blockId: 'acp:test:1', text: 'let me check' },
    ]);
    expect(toStreamEvents(state, toolCall)).toEqual([
      { type: 'text-stop', blockId: 'acp:test:1' },
      { type: 'tool-use-start', blockId: 'tc-1', name: 'Read File' },
    ]);
    // Text after the tool call must land on a fresh block (seq 2) — without
    // this, the post-tool text would append to the closed pre-tool bubble.
    expect(toStreamEvents(state, chunk('done'))).toEqual([
      { type: 'text-delta', blockId: 'acp:test:2', text: 'done' },
    ]);
  });

  it('lowers a completed tool_call_update into tool-result + tool-use-stop', () => {
    const state = testDecoder();
    const raw = {
      event: 'message',
      data: sessionUpdate({
        sessionUpdate: 'tool_call_update',
        toolCallId: 'tc-1',
        status: 'completed',
        content: [
          { type: 'content', content: { type: 'text', text: 'line 1' } },
          { type: 'content', content: { type: 'text', text: 'line 2' } },
        ],
      }),
    };
    expect(toStreamEvents(state, raw)).toEqual([
      { type: 'tool-result', toolUseId: 'tc-1', content: 'line 1\nline 2' },
      { type: 'tool-use-stop', blockId: 'tc-1' },
    ]);
  });

  it('drops in-flight tool_call_update with non-completed status', () => {
    const state = testDecoder();
    const raw = {
      event: 'message',
      data: sessionUpdate({
        sessionUpdate: 'tool_call_update',
        toolCallId: 'tc-1',
        status: 'in_progress',
      }),
    };
    expect(toStreamEvents(state, raw)).toEqual([]);
  });

  it('ignores ACP notifications without a conversation-visible mapping', () => {
    const variants = [
      sessionUpdate({ sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: 't' } }),
      sessionUpdate({ sessionUpdate: 'usage_update', size: 200000, used: 100 }),
      sessionUpdate({ sessionUpdate: 'available_commands_update', availableCommands: [] }),
      sessionUpdate({ sessionUpdate: 'plan_update' }),
    ];
    for (const data of variants) {
      const state = testDecoder();
      expect(toStreamEvents(state, { event: 'message', data })).toEqual([]);
    }
  });

  it('lowers acp.result into done', () => {
    const state = testDecoder();
    const raw = {
      event: 'message',
      data: JSON.stringify({ type: 'acp.result', stopReason: 'end_turn' }),
    };
    expect(toStreamEvents(state, raw)).toEqual([{ type: 'done' }]);
  });

  it('lowers acp.error into an error event with the runtime message', () => {
    const state = testDecoder();
    const raw = {
      event: 'message',
      data: JSON.stringify({ type: 'acp.error', error: { name: 'Error', message: 'boom' } }),
    };
    expect(toStreamEvents(state, raw)).toEqual([{ type: 'error', message: 'boom' }]);
  });

  it('closes any open text block before emitting acp.error', () => {
    const state = testDecoder();
    toStreamEvents(state, {
      event: 'message',
      data: sessionUpdate({
        sessionUpdate: 'agent_message_chunk',
        content: { type: 'text', text: 'half-sent' },
      }),
    });
    const errorEvent = {
      event: 'message',
      data: JSON.stringify({ type: 'acp.error', error: { name: 'Error', message: 'boom' } }),
    };
    expect(toStreamEvents(state, errorEvent)).toEqual([
      { type: 'text-stop', blockId: 'acp:test:1' },
      { type: 'error', message: 'boom' },
    ]);
  });

  it('closes an open ACP text block when a legacy event arrives mid-stream', () => {
    const state = testDecoder();
    toStreamEvents(state, {
      event: 'message',
      data: sessionUpdate({
        sessionUpdate: 'agent_message_chunk',
        content: { type: 'text', text: 'pre' },
      }),
    });
    // A legacy-style `done` arriving with an open ACP text block: we must
    // close the block first so the renderer flips `streaming: false`.
    expect(toStreamEvents(state, { event: 'done', data: '{}' })).toEqual([
      { type: 'text-stop', blockId: 'acp:test:1' },
      { type: 'done' },
    ]);
  });

  it('returns an empty array for malformed ACP JSON', () => {
    const state = testDecoder();
    expect(toStreamEvents(state, { event: 'message', data: 'not-json' })).toEqual([]);
  });
});
