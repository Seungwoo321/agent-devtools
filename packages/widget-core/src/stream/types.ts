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
 * Transient placeholder rendered between the moment the user submits a turn
 * and the moment the first concrete assistant event arrives (text delta,
 * tool use start, error, or done). Lets the renderer paint the conventional
 * three dot typing indicator so the surface never looks frozen while the
 * model is warming up. Never persisted — a re-hydrated conversation has no
 * in-flight turn to wait on.
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
 * Stream events normalized from the server's SSE wire format. We keep a
 * single envelope shape so the store doesn't need to know whether the
 * underlying transport is fetch + ReadableStream, EventSource, or a unit
 * test stub.
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
  | { type: 'done' };
