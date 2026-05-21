/**
 * Session Provider Interface & Types
 *
 * Sibling abstraction to `LLMProvider` (see `./types.ts`). Where `LLMProvider`
 * models per-turn HTTP completions ("provider gives one turn, the strategy
 * loops"), `SessionProvider` models an **agent session** where the provider
 * itself owns the tool-execution loop and streams events as the session
 * progresses.
 *
 * Motivation: the Claude Agent SDK exposes `query(...)` which returns an
 * `AsyncIterable<SDKMessage>` and runs the tool loop internally. Forcing
 * that shape behind `LLMProvider.chatWithTools` (which returns a single
 * `ToolChatResponse` per call and expects the strategy to drive the loop)
 * would either swallow strategy-level controls (`maxIterations`, abort
 * signal, progress emit) or require leaking session state through a
 * single-turn signature. We avoid both by giving SDK-style providers
 * their own interface and their own loop strategy (`sdk-session-loop`).
 *
 * Selection responsibility stays with the consumer: the host picks
 * which provider category fits the user's plan. The core never picks
 * a default (No-Fallback policy, mirrors `factory.ts`).
 */

import type { ChatMessage, ChatOptions, LLMProvider, ToolDefinition, TokenUsage } from './types.js';

/**
 * A provider that runs the entire agent turn loop internally and yields
 * events as the session progresses. Callers (strategies) forward events
 * — they do not drive iteration themselves.
 *
 * Contrast with `LLMProvider`: `chatWithTools` returns one turn and the
 * strategy decides whether to call again. `runSession` runs until the
 * session terminates and yields events along the way.
 */
export interface SessionProvider {
  /**
   * Stable identifier (e.g. `'ClaudeAgentSDK'`). Strategies stamp this
   * onto `AgentOutput.metadata.provider` for downstream telemetry. The
   * harness does not standardise casing — each provider sets its own
   * canonical name.
   */
  readonly providerName: string;

  /**
   * Model identifier the provider is bound to (e.g. `'claude-sonnet-4-5'`).
   * Required at construction — the harness enforces No-Fallback policy, so
   * the model is always known up front. Strategies stamp this onto
   * `AgentOutput.metadata.model` when the caller doesn't override via
   * `SessionInput.options.model`.
   *
   * Why expose this from the provider instead of asking the caller to
   * thread it through `options.model`? With per-turn `LLMProvider`s the
   * actual model used per turn comes back on every `ChatResponse`. Session
   * providers don't return per-turn responses, so the strategy has no other
   * way to learn the model unless it's exposed here.
   */
  readonly model: string;

  /**
   * Session providers must be capable of tool use. A provider that
   * cannot run tools belongs behind `LLMProvider` (per-turn `chat`),
   * not behind this interface.
   */
  readonly supportsTools: true;

  /**
   * Run an agent session. The provider owns the internal tool loop
   * (model turn → tool execution → next turn → …) and yields
   * `SessionEvent` values as work progresses.
   *
   * Cancellation: the caller signals cancellation via `input.options.signal`.
   * Providers must forward cancellation to their underlying session and
   * yield a `done` event with `finishReason: 'cancelled'` rather than
   * throwing — strategies need a deterministic terminal event to attribute
   * the final `AgentOutput`.
   */
  runSession(input: SessionInput): AsyncIterable<SessionEvent>;
}

// ── Input ───────────────────────────────────────────────────────────

export interface SessionInput {
  /**
   * Optional system prompt. Providers translate this into whatever
   * shape their backend expects (Anthropic system block, OpenAI
   * `role: 'system'`, etc.). Strategies pass `binding.buildSystemPrompt`
   * output here.
   */
  systemPrompt?: string;

  /**
   * Conversation messages so far. Reuses `ChatMessage` from `LLMProvider`
   * for shape parity — strategies that share message construction with
   * non-session providers do not need a second translator.
   *
   * Note: tool result messages (`role: 'tool'`) may be present when a
   * strategy is replaying a partial session. Otherwise the provider
   * handles tool results internally.
   */
  messages: ChatMessage[];

  /**
   * Tool definitions the model may call. The provider is responsible
   * for executing these — strategies do not re-execute them outside.
   * Reuses `ToolDefinition` from `LLMProvider` for shape parity.
   *
   * If a binding wants to gate or wrap tool execution (sandboxing,
   * permission prompts), it must do so at the `ToolProvider` layer
   * before the definitions reach this point.
   */
  tools?: ToolDefinition[];

  /**
   * Standard chat options (model override, maxTokens, temperature,
   * abort signal). Reuses `ChatOptions` from `LLMProvider`. `signal`
   * is the only option providers are required to honour; the rest
   * are best-effort and may be ignored if the underlying backend
   * does not expose them.
   */
  options?: ChatOptions;

  /**
   * Provider-specific max turns. The session ends with
   * `finishReason: 'max_turns'` when this limit is hit. Optional —
   * providers without an internal turn counter may ignore this and
   * rely on backend-side limits instead.
   */
  maxTurns?: number;
}

// ── Events ──────────────────────────────────────────────────────────

/**
 * One event in the session stream. Strategies forward these into
 * the host's `StreamEvent` channel (mapping happens in the strategy,
 * not here — `StreamEvent` is core/-internal).
 *
 * Discriminated by `type`. New variants can be added without breaking
 * existing consumers as long as they switch exhaustively (a default
 * branch that re-yields unknown events is the recommended pattern).
 */
export type SessionEvent =
  | SessionAssistantTextEvent
  | SessionToolUseEvent
  | SessionToolResultEvent
  | SessionUsageEvent
  | SessionDoneEvent;

/**
 * Model produced text content during a turn. `turn` is the 1-indexed
 * turn number (first model response is `turn: 1`). Multiple text events
 * within a single turn are possible if the provider streams partial
 * deltas — concatenate them downstream.
 */
export interface SessionAssistantTextEvent {
  type: 'assistant_text';
  text: string;
  turn: number;
  /**
   * `true` when the provider is emitting an incremental delta (more
   * text for the same turn coming). `false` (or absent) when the text
   * is final for this turn.
   */
  delta?: boolean;
}

/**
 * Model invoked a tool. The provider has not yet executed it (or has
 * just started). Surfaced primarily for telemetry — strategies should
 * forward this as a progress event so the user can see "tool X being
 * called" without waiting for the result.
 */
export interface SessionToolUseEvent {
  type: 'tool_use';
  toolCallId: string;
  name: string;
  /**
   * Parsed tool input. The provider is responsible for JSON-decoding
   * (SDKs typically deliver this parsed; raw HTTP providers parse the
   * `arguments` string before emitting).
   */
  input: unknown;
  turn: number;
}

/**
 * Tool execution result. `isError` distinguishes a tool that ran but
 * returned an error from a tool that crashed — both still terminate
 * the tool call, but downstream UI may want to render them differently.
 */
export interface SessionToolResultEvent {
  type: 'tool_result';
  toolCallId: string;
  /**
   * Stringified output. Binary content (images, blobs) must be encoded
   * (base64) by the provider before emission — `SessionEvent` is a
   * pure-JSON shape so it can cross process boundaries unchanged.
   */
  output: string;
  isError: boolean;
}

/**
 * Token usage snapshot. May be emitted multiple times within a session
 * (incremental per turn) or only once at the end (total). Strategies
 * should accumulate the latest value per session and forward only the
 * final cumulative number into `AgentOutput.metadata.usage`.
 */
export interface SessionUsageEvent {
  type: 'usage';
  usage: TokenUsage;
}

/**
 * Terminal event. Exactly one `done` MUST be yielded per session —
 * including on error and cancellation paths. Strategies treat this
 * as the cue to assemble the final `AgentOutput`.
 */
export interface SessionDoneEvent {
  type: 'done';
  /**
   *  - `stop`       — natural completion (model decided to stop)
   *  - `max_turns`  — hit `SessionInput.maxTurns` or backend limit
   *  - `cancelled`  — `options.signal` aborted mid-session
   *  - `error`      — provider/backend error; `error` field populated
   */
  finishReason: 'stop' | 'max_turns' | 'cancelled' | 'error';

  /**
   * Final assembled text content (concatenation of all
   * `assistant_text` events excluding tool-call turns). Strategies
   * may use this directly or recompute from event history.
   */
  finalContent: string;

  /**
   * Cumulative usage for the entire session. Optional because not
   * every backend reports breakdowns.
   */
  usage?: TokenUsage;

  /**
   * Populated only when `finishReason === 'error'`. Strategies map
   * `code` to `StreamErrorCode` for the host's HTTP response.
   *
   * Provider responsibilities:
   *  - Sub-4xx caller-fix errors → `code: 'INVALID_INPUT'`
   *  - Auth/credential failures  → `code: 'LLM_ERROR'`   (host-config)
   *  - Subscription credit out   → `code: 'QUOTA_EXCEEDED'`
   *  - Network/5xx/unknown       → `code: 'LLM_ERROR'`
   *  - Internal provider crash   → `code: 'INTERNAL_ERROR'`
   */
  error?: {
    code: 'INVALID_INPUT' | 'QUOTA_EXCEEDED' | 'LLM_ERROR' | 'INTERNAL_ERROR';
    message: string;
  };
}

// ── Resolved provider (used by TierResolver in T4) ──────────────────

/**
 * Tagged union that lets a `TierResolver` return either a per-turn
 * provider (`LLMProvider`) or a session provider (`SessionProvider`).
 *
 * Routes branch on `kind` to pick the matching strategy:
 *   - `kind: 'llm'`     + `supportsTools` → `model-driven-loop`
 *   - `kind: 'llm'`     + !`supportsTools` → `orchestrator-loop`
 *   - `kind: 'session'`                    → `sdk-session-loop`
 *
 * Defined here (next to `SessionProvider`) rather than in `core/types.ts`
 * so the LLM module owns its own discriminator surface; the core types
 * module only re-exports.
 */
export type ResolvedProvider =
  | { kind: 'llm'; provider: LLMProvider }
  | { kind: 'session'; provider: SessionProvider };
