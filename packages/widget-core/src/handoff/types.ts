/**
 * Wire types for the terminal-handoff feature. The widget POSTs a
 * `HandoffRequest` to `/v1/agent/handoff`; the server writes a markdown
 * artifact and returns a `HandoffResult` with the absolute file path and
 * the `claude --append-system-prompt-file …` command the user pastes into
 * their terminal.
 *
 * Mirrors the server's `HandoffRequestPayload` / `HandoffTurn` shape (see
 * `packages/core/src/server/handoff.ts`). Duplicated here on purpose so the
 * widget bundle doesn't pull in the server package — the price is exactly
 * one schema-coupling test on each side.
 */
import type { PageContext, PickedEvidence } from '../context/index.js';
import type { PermissionMode } from '../settings/index.js';
import type { HandoffResult } from './modal.js';

export type { HandoffResult };

export interface HandoffTurn {
  readonly role: 'user' | 'assistant';
  readonly text: string;
}

export interface HandoffRequest {
  readonly conversation: readonly HandoffTurn[];
  readonly picked?: PickedEvidence | null;
  readonly pageContext?: PageContext | null;
  readonly permissionMode?: PermissionMode;
  /** Abort the in-flight fetch (modal close, unmount). */
  readonly signal?: AbortSignal;
}

/**
 * Function the orchestrator calls when the user clicks the handoff button.
 * The Vite plugin's bootstrap binds this to `createHandoffRequester(...)`
 * over the same baseUrl + pairing token used for streaming, so the widget
 * stays in one origin and one credential.
 */
export type HandoffRequester = (request: HandoffRequest) => Promise<HandoffResult>;
