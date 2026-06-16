/**
 * Server-Sent Events parser.
 *
 * The agent server sends events as `event: <name>\ndata: <json>\n\n` blocks.
 * `parseSSEChunk` is a small stateful machine that accepts arbitrary text
 * chunks (network packets may split or coalesce events), buffers the
 * unterminated tail, and yields completed events. The handler/event-name
 * payload schema is defined in `./types.ts`.
 *
 * Anthropic's Messages SSE format uses the same `event:` + `data:` shape;
 * we map those event types into our internal `StreamEvent` union so the
 * store doesn't depend on a specific wire format.
 *
 * The ACP envelope (`event: message` with `data.type=acp.session_update`)
 * is decoded by `toStreamEvents`, which is stateful: it segments the
 * assistant's text into fresh `text-delta` blocks per turn and at every
 * tool-call boundary. Without that segmentation every chunk on the wire
 * would land under one constant `blockId` and the store would render
 * the entire conversation as a single ever-growing bubble.
 */
import type { SlashCommandInfo, StreamEvent } from './types.js';

export interface SSEParserState {
  buffer: string;
}

export function createSSEParserState(): SSEParserState {
  return { buffer: '' };
}

interface RawSSEEvent {
  readonly event: string;
  readonly data: string;
}

/**
 * Append a chunk and return any newly completed raw SSE events. Buffers the
 * trailing partial event in `state.buffer`.
 */
export function parseSSEChunk(state: SSEParserState, chunk: string): RawSSEEvent[] {
  // Normalize CRLF up front so the rest of the parser only deals with LF
  // — and so a chunk boundary in the middle of a CRLF can't desync us.
  state.buffer += chunk.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const events: RawSSEEvent[] = [];
  while (true) {
    const sepIndex = state.buffer.indexOf('\n\n');
    if (sepIndex < 0) break;
    const block = state.buffer.slice(0, sepIndex);
    state.buffer = state.buffer.slice(sepIndex + 2);
    const parsed = parseBlock(block);
    if (parsed) events.push(parsed);
  }
  return events;
}

function parseBlock(block: string): RawSSEEvent | null {
  let event = 'message';
  const dataLines: string[] = [];
  for (const rawLine of block.split('\n')) {
    if (!rawLine || rawLine.startsWith(':')) continue;
    const colon = rawLine.indexOf(':');
    if (colon < 0) continue;
    const field = rawLine.slice(0, colon);
    let value = rawLine.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'event') event = value;
    else if (field === 'data') dataLines.push(value);
  }
  if (dataLines.length === 0) return null;
  return { event, data: dataLines.join('\n') };
}

/**
 * Lower a raw SSE event into our internal `StreamEvent` union. Unknown
 * event names return `null`; that's a deliberate choice so the renderer
 * never has to silently drop unrecognized payloads — the caller can log.
 */
export function toStreamEvent(raw: RawSSEEvent): StreamEvent | null {
  let payload: unknown;
  try {
    payload = JSON.parse(raw.data);
  } catch {
    return null;
  }
  if (typeof payload !== 'object' || payload === null) return null;
  const p = payload as Record<string, unknown>;

  switch (raw.event) {
    case 'message-start':
      if (typeof p.id !== 'string') return null;
      return { type: 'message-start', id: p.id };
    case 'text-delta':
      if (typeof p.blockId !== 'string' || typeof p.text !== 'string') return null;
      return { type: 'text-delta', blockId: p.blockId, text: p.text };
    case 'text-stop':
      if (typeof p.blockId !== 'string') return null;
      return { type: 'text-stop', blockId: p.blockId };
    case 'tool-use-start':
      if (typeof p.blockId !== 'string' || typeof p.name !== 'string') return null;
      return { type: 'tool-use-start', blockId: p.blockId, name: p.name };
    case 'tool-use-delta':
      if (typeof p.blockId !== 'string' || typeof p.partialInput !== 'string') return null;
      return { type: 'tool-use-delta', blockId: p.blockId, partialInput: p.partialInput };
    case 'tool-use-stop':
      if (typeof p.blockId !== 'string') return null;
      return { type: 'tool-use-stop', blockId: p.blockId };
    case 'tool-result':
      if (typeof p.toolUseId !== 'string' || typeof p.content !== 'string') return null;
      return {
        type: 'tool-result',
        toolUseId: p.toolUseId,
        content: p.content,
        ...(typeof p.isError === 'boolean' && { isError: p.isError }),
      };
    case 'error':
      if (typeof p.message !== 'string') return null;
      return { type: 'error', message: p.message };
    case 'done':
      return { type: 'done' };
    default:
      return null;
  }
}

/**
 * Stateful ACP decoder. Tracks the currently-open assistant text block so
 * we can:
 *
 *   - Mint a fresh `blockId` per turn — without this, every `text-delta`
 *     on the wire used a constant `blockId` and the store kept appending
 *     into the same `assistant-text` item across turns.
 *   - Close the text block on a tool-call boundary so the conversation
 *     renders [text → tool-use → text] as three items, not one.
 *   - Close the text block on the terminal `acp.result` / `error` so the
 *     `streaming` flag flips off in the renderer.
 *
 * The `mintBlockId` seam lets tests assert deterministic IDs.
 */
export interface AcpDecoderState {
  /** Currently-open assistant text block id, or null if none. */
  currentTextBlock: string | null;
  /** Per-state monotonic counter for diagnostics / test determinism. */
  blockSeq: number;
  /** Mints a globally-unique blockId. */
  readonly mintBlockId: (seq: number) => string;
}

export interface CreateAcpDecoderStateOptions {
  /** Override the block-id minter. Defaults to a UUID-prefixed sequence. */
  mintBlockId?: (seq: number) => string;
}

export function createAcpDecoderState(options: CreateAcpDecoderStateOptions = {}): AcpDecoderState {
  return {
    currentTextBlock: null,
    blockSeq: 0,
    mintBlockId: options.mintBlockId ?? defaultMintBlockId,
  };
}

function defaultMintBlockId(seq: number): string {
  // Per-state nonce + sequence guarantees uniqueness across multiple
  // sends folded into the same `MessageStore` (the store keys items by
  // blockId, so a collision would re-open a closed bubble).
  const uuid = globalThis.crypto.randomUUID();
  return `acp:text:${uuid}:${String(seq)}`;
}

/**
 * Lower a raw SSE event into zero-or-more `StreamEvent`s. The ACP
 * provider wraps every notification as `event: message` with `data.type`
 * carrying the discriminator (`acp.session_update`, `acp.result`,
 * `acp.error`); a single notification can fan out into multiple store
 * events (e.g. a `tool_call` while text is open emits both `text-stop`
 * and `tool-use-start`). For non-ACP events this just wraps
 * `toStreamEvent` so callers have a single normalized entry point.
 */
export function toStreamEvents(state: AcpDecoderState, raw: RawSSEEvent): readonly StreamEvent[] {
  if (raw.event === 'message') return toAcpStreamEvents(state, raw.data);

  // Legacy (Anthropic-style) event: if an ACP text block was open at the
  // moment we received a non-ACP event, close it so the renderer flips
  // `streaming: false` correctly.
  const single = toStreamEvent(raw);
  if (!single) return [];
  const events: StreamEvent[] = [];
  if (state.currentTextBlock !== null) {
    events.push({ type: 'text-stop', blockId: state.currentTextBlock });
    state.currentTextBlock = null;
  }
  events.push(single);
  return events;
}

function toAcpStreamEvents(state: AcpDecoderState, data: string): readonly StreamEvent[] {
  let payload: unknown;
  try {
    payload = JSON.parse(data);
  } catch {
    return [];
  }
  if (typeof payload !== 'object' || payload === null) return [];
  const p = payload as Record<string, unknown>;

  switch (p.type) {
    case 'acp.session_update':
      return toAcpSessionUpdateEvents(state, p.update);
    case 'acp.result': {
      const events: StreamEvent[] = [];
      if (state.currentTextBlock !== null) {
        events.push({ type: 'text-stop', blockId: state.currentTextBlock });
        state.currentTextBlock = null;
      }
      events.push({ type: 'done' });
      return events;
    }
    case 'acp.error': {
      const events: StreamEvent[] = [];
      if (state.currentTextBlock !== null) {
        events.push({ type: 'text-stop', blockId: state.currentTextBlock });
        state.currentTextBlock = null;
      }
      const err = p.error as { message?: unknown } | undefined;
      const message = err && typeof err.message === 'string' ? err.message : 'agent error';
      events.push({ type: 'error', message });
      return events;
    }
    default:
      return [];
  }
}

function toAcpSessionUpdateEvents(state: AcpDecoderState, update: unknown): readonly StreamEvent[] {
  if (typeof update !== 'object' || update === null) return [];
  const u = update as Record<string, unknown>;
  const kind = u.sessionUpdate;

  switch (kind) {
    case 'agent_message_chunk': {
      const text = readAcpChunkText(u.content);
      if (text === '') return [];
      if (state.currentTextBlock === null) {
        state.blockSeq += 1;
        state.currentTextBlock = state.mintBlockId(state.blockSeq);
      }
      return [{ type: 'text-delta', blockId: state.currentTextBlock, text }];
    }
    case 'tool_call': {
      if (typeof u.toolCallId !== 'string') return [];
      const events: StreamEvent[] = [];
      // Close any in-flight text block so [text → tool] renders as two
      // sequential items rather than text continuing to accumulate.
      if (state.currentTextBlock !== null) {
        events.push({ type: 'text-stop', blockId: state.currentTextBlock });
        state.currentTextBlock = null;
      }
      const name = readAcpToolName(u);
      events.push({ type: 'tool-use-start', blockId: u.toolCallId, name });
      return events;
    }
    case 'tool_call_update': {
      if (typeof u.toolCallId !== 'string') return [];
      if (u.status !== 'completed') return [];
      const events: StreamEvent[] = [];
      const content = readAcpToolContent(u.content);
      if (content !== '') {
        events.push({
          type: 'tool-result',
          toolUseId: u.toolCallId,
          content,
        });
      }
      events.push({ type: 'tool-use-stop', blockId: u.toolCallId });
      return events;
    }
    case 'available_commands_update': {
      // Not a conversation item — the agent's slash-command catalogue. The
      // transport routes this away from the `MessageStore` to a side-channel
      // callback the composer subscribes to. We always emit the event (even
      // with an empty list) so a cleared command set can propagate downstream.
      const commands = readAcpAvailableCommands(u.availableCommands);
      return [{ type: 'available-commands', commands }];
    }
    default:
      // agent_thought_chunk, usage_update, plan_update, etc. — not surfaced
      // in the conversation list and not (yet) routed elsewhere.
      return [];
  }
}

/**
 * Parse the ACP `available_commands_update.availableCommands` array into the
 * widget's `SlashCommandInfo[]`. Defensive throughout: a non-array yields an
 * empty list, and any entry that isn't an object with a string `name` is
 * skipped rather than throwing. `description` defaults to '' when absent, and
 * `argumentHint` is filled from `input.hint` only when `input` is an object
 * carrying a string `hint`.
 */
function readAcpAvailableCommands(value: unknown): readonly SlashCommandInfo[] {
  if (!Array.isArray(value)) return [];
  const commands: SlashCommandInfo[] = [];
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) continue;
    const e = entry as Record<string, unknown>;
    if (typeof e.name !== 'string') continue;
    const description = typeof e.description === 'string' ? e.description : '';
    const argumentHint = readAcpCommandHint(e.input);
    commands.push({
      name: e.name,
      description,
      ...(argumentHint !== undefined && { argumentHint }),
    });
  }
  return commands;
}

/** Pull the argument hint out of an ACP command's `input` (`{ hint: '...' }`),
 * returning undefined when `input` is absent/null or carries no string hint. */
function readAcpCommandHint(input: unknown): string | undefined {
  if (typeof input !== 'object' || input === null) return undefined;
  const hint = (input as Record<string, unknown>).hint;
  return typeof hint === 'string' ? hint : undefined;
}

/** Pull the user-visible text out of an `agent_message_chunk.content`,
 * which is `{ type: 'text', text: '...' }` (per ACP `ContentBlock`). */
function readAcpChunkText(content: unknown): string {
  if (typeof content !== 'object' || content === null) return '';
  const c = content as { type?: unknown; text?: unknown };
  if (c.type === 'text' && typeof c.text === 'string') return c.text;
  return '';
}

/** Prefer the agent-provided `title` (e.g. "Run Command", "Read File");
 * fall back to claude-code's internal tool name (`Bash`, `Read`, ...) if
 * the title is missing. */
function readAcpToolName(u: Record<string, unknown>): string {
  if (typeof u.title === 'string' && u.title.length > 0) return u.title;
  const meta = u._meta;
  if (typeof meta === 'object' && meta !== null) {
    const cc = (meta as Record<string, unknown>).claudeCode;
    if (typeof cc === 'object' && cc !== null) {
      const tn = (cc as Record<string, unknown>).toolName;
      if (typeof tn === 'string') return tn;
    }
  }
  return 'tool';
}

/** Flatten ACP `tool_call_update.content[]` (`{ type: 'content',
 * content: { type: 'text', text: '...' } }`) into a single string. */
function readAcpToolContent(content: unknown): string {
  if (!Array.isArray(content)) return '';
  const parts: string[] = [];
  for (const entry of content) {
    if (typeof entry !== 'object' || entry === null) continue;
    const e = entry as Record<string, unknown>;
    const inner = e.content;
    if (typeof inner !== 'object' || inner === null) continue;
    const i = inner as { type?: unknown; text?: unknown };
    if (i.type === 'text' && typeof i.text === 'string') parts.push(i.text);
  }
  return parts.join('\n');
}
