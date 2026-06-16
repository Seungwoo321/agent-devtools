/**
 * The minimal conversation shape the agent-devtools widget renders. The
 * server speaks SSE that the parser (./sse.ts) lowers into these events,
 * and the store (./store.ts) folds them into a flat list of `MessageItem`s
 * the renderer (./renderer.ts) draws.
 *
 * The shape is deliberately a flat list (no nested tool calls under
 * assistant turns) so streaming deltas can update a single item in place
 * without rewriting parent structures. tool_use and tool_result appear in
 * order as their own items, linked by `toolUseId`.
 */

import type { PickedEvidence } from '../context/types.js';

export type MessageRole = 'user' | 'assistant' | 'system';

export interface UserMessageItem {
  readonly kind: 'user';
  readonly id: string;
  readonly text: string;
  /**
   * Full evidence payload that was attached to this turn — same shape the
   * server received. Carried on the user item so the rendered bubble can
   * surface the structured detail (component chain, attributes, outer HTML,
   * source slice, ...) behind an expand affordance, letting a developer
   * audit exactly what reached the agent for that turn.
   */
  readonly pickedEvidence?: PickedEvidence;
}

export interface AssistantTextItem {
  /** Streaming text block — may be appended to as deltas arrive. */
  readonly kind: 'assistant-text';
  readonly id: string;
  readonly text: string;
  readonly streaming: boolean;
}

/**
 * Transient "assistant is working" placeholder that lets the renderer paint
 * the conventional three dot typing indicator. It sits at the tail of the list
 * during any in-flight period where the assistant is not actively emitting
 * content — after the user submits (warming up), while a tool executes, and
 * while the model round-trips on a tool result — and is dropped the moment
 * text or tool input streams again, or the turn ends (done / error). Never
 * persisted: a re-hydrated conversation has no in-flight turn to wait on.
 */
export interface AssistantPendingItem {
  readonly kind: 'assistant-pending';
  readonly id: string;
}

export interface ToolUseItem {
  readonly kind: 'tool-use';
  readonly id: string;
  readonly name: string;
  /** May be a partial JSON string while streaming. */
  readonly inputPreview: string;
  readonly streaming: boolean;
}

export interface ToolResultItem {
  readonly kind: 'tool-result';
  readonly id: string;
  readonly toolUseId: string;
  readonly content: string;
  readonly isError: boolean;
}

export interface ErrorItem {
  readonly kind: 'error';
  readonly id: string;
  readonly message: string;
}

export type MessageItem =
  | UserMessageItem
  | AssistantTextItem
  | AssistantPendingItem
  | ToolUseItem
  | ToolResultItem
  | ErrorItem;

/**
 * A single slash command the agent advertises via the ACP
 * `available_commands_update` session notification. This is the canonical
 * command shape the composer consumes for its slash-command menu — it lives
 * here so the stream decoder, the transport side-channel, and the composer
 * all share one definition.
 *
 * Commands are widget UI state, not conversation items, so they never enter
 * the `MessageStore`; the transport routes them to a side-channel callback
 * instead (see `available-commands` below).
 */
export interface SlashCommandInfo {
  readonly name: string;
  readonly description: string;
  /**
   * Hint text for the command's argument, when the agent provides one (ACP
   * `input.hint`). Absent when the command takes no argument or the agent
   * omitted the hint.
   */
  readonly argumentHint?: string;
}

/**
 * Stream events normalized from the server's SSE wire format. We keep a
 * single envelope shape so the store doesn't need to know whether the
 * underlying transport is fetch + ReadableStream, EventSource, or a unit
 * test stub.
 *
 * Most variants fold into the conversation `MessageStore`. The
 * `available-commands` variant is the exception: it carries widget UI state
 * (the slash-command list) rather than a conversation item, so the transport
 * routes it to a side-channel callback and the store never sees it.
 */
export type StreamEvent =
  | { type: 'message-start'; id: string }
  | { type: 'text-delta'; blockId: string; text: string }
  | { type: 'text-stop'; blockId: string }
  | { type: 'tool-use-start'; blockId: string; name: string }
  | { type: 'tool-use-delta'; blockId: string; partialInput: string }
  | { type: 'tool-use-stop'; blockId: string }
  | { type: 'tool-result'; toolUseId: string; content: string; isError?: boolean }
  | { type: 'error'; message: string }
  | { type: 'available-commands'; commands: readonly SlashCommandInfo[] }
  | { type: 'done' };
