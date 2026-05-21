/**
 * SDK → ACP envelope translator.
 *
 * The widget's stream decoder (`packages/react/src/stream/sse.ts`) speaks one
 * wire format: the ACP envelope, `{type: 'acp.session_update' | 'acp.result'
 * | 'acp.error', ...}`. The ACP provider yields that shape natively because
 * the on-disk protocol already matches; the SDK provider yields the raw
 * `SDKMessage` discriminated union, which the decoder does not recognize.
 *
 * Rather than teach the client decoder about every provider's native shape
 * (and re-teach it on every new provider), we normalize at the server
 * boundary: the SDK provider funnels each yielded `SDKMessage` through this
 * translator, so what reaches the wire is always the ACP envelope.
 *
 * The translator is intentionally typed with `unknown` for inputs. The SDK
 * surface is broad (~30 message variants, evolving on every minor release)
 * and we only care about a handful. Structural narrowing on each call site
 * is cheaper than tracking the upstream type imports.
 */
import type { StopReason } from '@agentclientprotocol/sdk';

/** ACP-shaped envelope objects produced by this translator. */
export type AcpEnvelope =
  | {
      type: 'acp.session_update';
      update: AcpSessionUpdate;
    }
  | {
      type: 'acp.result';
      stopReason: StopReason;
    }
  | {
      type: 'acp.error';
      error: { name: string; message: string };
    };

export type AcpSessionUpdate =
  | {
      sessionUpdate: 'agent_message_chunk';
      content: { type: 'text'; text: string };
    }
  | {
      sessionUpdate: 'tool_call';
      toolCallId: string;
      title: string;
      _meta?: { claudeCode: { toolName: string } };
    }
  | {
      sessionUpdate: 'tool_call_update';
      toolCallId: string;
      status: 'completed';
      content?: ReadonlyArray<{ type: 'content'; content: { type: 'text'; text: string } }>;
    };

/**
 * Translate one SDK message into zero or more ACP envelope events.
 *
 *   - `system` / unknown variants → `[]` (not user-visible in the widget).
 *   - `assistant` → one envelope per content block of interest (text /
 *     tool_use). Empty text blocks and unsupported blocks (thinking,
 *     redacted_thinking) are skipped — they would render as empty bubbles.
 *   - `user` → tool_result blocks become `tool_call_update`. Other user
 *     messages are skipped: the user's own prompt is rendered locally by the
 *     widget before the request is even sent.
 *   - `result` → terminal `acp.result`. Failure subtypes are still mapped to
 *     `acp.result` rather than `acp.error` because the assistant turn has
 *     already streamed; the error is metadata on the close, not a stream-
 *     interruption error.
 */
export function translateSdkMessage(message: unknown): readonly AcpEnvelope[] {
  if (!isObject(message)) return [];
  const m = message as Record<string, unknown>;
  switch (m.type) {
    case 'assistant':
      return translateAssistantMessage(m);
    case 'user':
      return translateUserMessage(m);
    case 'result':
      return [
        {
          type: 'acp.result',
          stopReason: mapResultStopReason(m),
        },
      ];
    default:
      return [];
  }
}

function translateAssistantMessage(m: Record<string, unknown>): readonly AcpEnvelope[] {
  const inner = (m.message as Record<string, unknown> | null | undefined) ?? undefined;
  const content = inner?.content;
  if (!Array.isArray(content)) return [];
  const out: AcpEnvelope[] = [];
  for (const block of content) {
    if (!isObject(block)) continue;
    const b = block as Record<string, unknown>;
    if (b.type === 'text') {
      const text = typeof b.text === 'string' ? b.text : '';
      if (text.length === 0) continue;
      out.push({
        type: 'acp.session_update',
        update: {
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text },
        },
      });
    } else if (b.type === 'tool_use') {
      const id = typeof b.id === 'string' ? b.id : '';
      const name = typeof b.name === 'string' ? b.name : 'tool';
      if (id.length === 0) continue;
      out.push({
        type: 'acp.session_update',
        update: {
          sessionUpdate: 'tool_call',
          toolCallId: id,
          title: name,
          _meta: { claudeCode: { toolName: name } },
        },
      });
    }
    // thinking / redacted_thinking / server_tool_use / etc. — not surfaced.
  }
  return out;
}

function translateUserMessage(m: Record<string, unknown>): readonly AcpEnvelope[] {
  const inner = (m.message as Record<string, unknown> | null | undefined) ?? undefined;
  const content = inner?.content;
  if (!Array.isArray(content)) return [];
  const out: AcpEnvelope[] = [];
  for (const block of content) {
    if (!isObject(block)) continue;
    const b = block as Record<string, unknown>;
    if (b.type !== 'tool_result') continue;
    const toolUseId = typeof b.tool_use_id === 'string' ? b.tool_use_id : '';
    if (toolUseId.length === 0) continue;
    const text = readToolResultText(b.content);
    out.push({
      type: 'acp.session_update',
      update: {
        sessionUpdate: 'tool_call_update',
        toolCallId: toolUseId,
        status: 'completed',
        ...(text !== '' && {
          content: [{ type: 'content', content: { type: 'text', text } }],
        }),
      },
    });
  }
  return out;
}

/**
 * SDK result messages carry `stop_reason` (snake_case, from the Anthropic
 * API) plus a `subtype` discriminator (`success` / `error_*`). The ACP
 * `StopReason` union is `'end_turn' | 'max_tokens' | 'max_turn_requests' |
 * 'refusal' | 'cancelled'` — narrower than the SDK's vocabulary. Coerce
 * into the ACP union: success → `end_turn` (or `max_tokens` when carried
 * literally), error subtypes → `cancelled`. The widget currently reads
 * `acp.result` only for the side-effect of closing the open text block;
 * the value is informational. A future surface that distinguishes stop
 * reasons should grow a richer envelope rather than overload this field.
 */
function mapResultStopReason(m: Record<string, unknown>): StopReason {
  const sub = typeof m.subtype === 'string' ? m.subtype : '';
  if (sub === 'success') {
    const raw = typeof m.stop_reason === 'string' ? m.stop_reason : '';
    if (raw === 'max_tokens') return 'max_tokens';
    return 'end_turn';
  }
  return 'cancelled';
}

function readToolResultText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  const parts: string[] = [];
  for (const entry of content) {
    if (!isObject(entry)) continue;
    const e = entry as Record<string, unknown>;
    if (e.type === 'text' && typeof e.text === 'string') parts.push(e.text);
  }
  return parts.join('\n');
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
