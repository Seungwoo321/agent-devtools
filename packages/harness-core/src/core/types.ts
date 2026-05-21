/**
 * Core Types — Domain-Agnostic Agent Harness
 *
 * Three domain paradigms are supported:
 *
 *  - Generation: LLM generates code/text → parse → validate → render → output
 *      (e.g. prompt → DSL → HTML/SVG)
 *  - Operation : LLM inspects state via tools → produces a proposal/effect record
 *      (e.g. prompt → tool calls → DB row representing intent)
 *  - Hybrid    : both — Generation domain backed by Operation-style tool rounds
 *      (e.g. read codebase via tools → generate code/script)
 *
 * A `DomainBinding` declares which paradigm it is and supplies the slots
 * relevant to that paradigm. Loop strategies branch on `binding.type` to
 * decide which slots to read.
 */

import type { ChatMessage, ToolDefinition, TokenUsage, LLMProvider } from '../llm/types.js';
import type { ResolvedProvider } from '../llm/session-types.js';

// ── Generation Domain ──────────────────────────────────────────────

/**
 * Generation domain bridge.
 *
 * Used when the LLM's output is a string of code or markup that the harness
 * must parse, validate, and render before returning to the caller.
 */
export interface GenerationDomain {
  /**
   * Parse raw code (already extracted from the LLM response).
   * Return `valid: true` with the canonicalised `code` when parsing
   * succeeds, otherwise `valid: false` with a diagnostic `error`.
   */
  parse(code: string): ParseResult;

  /**
   * Render successfully-parsed code to a consumer-visible artifact
   * (HTML for a UI domain, image for an image domain, etc.).
   */
  render(code: string): RenderResult;

  /**
   * Score-based quality validation of already-parsed code.
   * Synchronous — strategies do not await. Optional; absence is
   * interpreted as "no extra checks". Async validation belongs in
   * `OperationDomain.validateFinal` instead.
   */
  validate?(code: string): ValidationResult;

  /**
   * Convert an LLM output (often JSON) to canonical domain code.
   * Returned when the model emits a structured intermediate form
   * that needs translating before parse/render. Optional.
   */
  convertOutput?(llmOutput: string): ConvertResult;

  /**
   * Extract the raw code block from a free-text LLM response.
   * Required because the LLM commonly wraps code in fences or prose.
   */
  extractCode(content: string): string;
}

// ── Operation Domain ───────────────────────────────────────────────

/**
 * Operation domain bridge.
 *
 * Used when the LLM does not produce code; instead it drives tools to
 * inspect and mutate domain state, leaving the visible output as
 * side-effect records (e.g. proposal rows). Most slots are optional
 * because the loop's record of `messages` and `domainState` is usually
 * sufficient.
 */
export interface OperationDomain {
  /**
   * Produce a human-readable summary of the final state for the caller.
   * Strategies fall back to the last assistant message if absent.
   */
  summarize?(state: LoopState): string;

  /**
   * Final-state validation hook. Returns the same shape as
   * `GenerationDomain.validate` so callers can treat the two uniformly.
   * Optional.
   */
  validateFinal?(state: LoopState): ValidationResult | Promise<ValidationResult>;
}

// ── Domain Binding ─────────────────────────────────────────────────

/**
 * The single object a consumer hands to a loop strategy.
 *
 * The `type` discriminator tells the strategy which slots to read:
 *  - `'generation'`: `generation` is required, `tools` optional.
 *  - `'operation'` : `tools` is required (operation domain *is* tools),
 *                    `operation` is optional (most consumers leave it empty).
 *  - `'hybrid'`    : both `generation` and `tools` required;
 *                    `operation` optional.
 *
 * `prompts` is always required.
 */
export interface DomainBinding {
  type: 'generation' | 'operation' | 'hybrid';
  prompts: PromptProvider;
  tools?: ToolProvider;
  generation?: GenerationDomain;
  operation?: OperationDomain;
}

// ── Result Types ───────────────────────────────────────────────────

export interface ParseResult {
  valid: boolean;
  code?: string;
  error?: string;
}

export interface RenderResult {
  html: string;
  error?: string;
}

export interface ValidationResult {
  score: number;
  issues: ValidationIssue[];
}

export interface ConvertResult {
  code: string;
  error?: string;
}

export interface ValidationIssue {
  severity: string;
  message: string;
  suggestion?: string;
}

// ── Prompt Provider ────────────────────────────────────────────────

/**
 * Prompts handed to the loop strategies.
 *
 * Only `systemPrompt` is required — operation-domain bindings frequently
 * supply nothing else. Generation-domain bindings populate the builders
 * relevant to their phases. Strategies fall back to `systemPrompt` when
 * `systemPromptFull` is absent, and substitute a generic default when an
 * optional builder is missing.
 */
export interface PromptProvider {
  /** Canonical system prompt used by all phases unless overridden. */
  systemPrompt: string;

  /**
   * Heavier system prompt used during code generation when the binding
   * needs more grammar/context than the canonical prompt provides.
   * Strategies use `systemPromptFull ?? systemPrompt`.
   */
  systemPromptFull?: string;

  /**
   * Build the analysis prompt for text input. Generation domains.
   *
   * `previousOutput` is the prior round's code surfaced from
   * `AgentInput.previousOutput`. When present, the analyzer is expected
   * to reason about the existing artifact (delta intent), not from
   * scratch. Bindings that do not take previous output into account at
   * the analyze phase can simply ignore the second argument.
   */
  buildAnalyzePrompt?(input: string, previousOutput?: string): string;

  /** Build the analysis prompt for image input. Generation domains. */
  buildAnalyzeImagePrompt?(): string;

  /**
   * Build the generation prompt with input + analysis context.
   *
   * `previousOutput`, when present, signals an iterative-edit round —
   * the binding decides how to embed it (e.g. fenced "existing code,
   * modify this" block). Absent on first-round generation.
   */
  buildGeneratePrompt?(input: string, analysis: string, previousOutput?: string): string;

  /** Build the fix prompt for retry with previous code + errors. */
  buildFixPrompt?(code: string, issues: string, parseError: string | null): string;
}

// ── Tool Provider ──────────────────────────────────────────────────

/**
 * Tool definitions + executor for model-driven loops.
 *
 * `execute` is async and receives already-parsed arguments. Strategies
 * own JSON.parse on the raw `tool_call.function.arguments` string before
 * dispatching, so individual ToolProviders never see raw JSON. Async is
 * required because operation-domain tools commonly hit databases or
 * external APIs; generation-domain tools that are synchronous simply
 * return `Promise.resolve(...)` (or use an `async` body).
 */
export interface ToolProvider {
  /** Tool schemas for LLM function calling */
  definitions: ToolDefinition[];

  /**
   * Execute a tool by name. `args` is parsed (not the raw JSON string).
   * Return value is whatever the tool wants the model to see — strategies
   * forward it verbatim as the `tool` message content.
   */
  execute(name: string, args: Record<string, unknown>): Promise<string>;

  /**
   * Map tool name → StreamEvent step for progress reporting.
   * Optional; absence yields a generic 'generate' step.
   */
  getStep?(toolName: string): StreamEventStep | undefined;

  /**
   * Map tool name → user-facing progress message.
   * Optional; absence yields the tool name itself.
   */
  getMessage?(toolName: string): string | undefined;
}

// ── Loop Config ────────────────────────────────────────────────────

/** Configuration shared by all loop strategies */
export interface LoopConfig {
  /** Maximum iterations (retries for orchestrator, turns for model-driven) */
  maxIterations: number;

  /** Quality score threshold — retry if below (default 70) */
  qualityThreshold?: number;
}

// ── Agent I/O ──────────────────────────────────────────────────────

export interface AgentInput {
  type: 'text' | 'image';
  content: string;
  imageUrl?: string;
  imageMimeType?: string;
  /**
   * Output from a previous generation round, supplied as the editing
   * target for the next round. Domain-agnostic at this layer — core only
   * threads it through to the prompt provider; what counts as "code" and
   * how it should be embedded into the prompt is the domain binding's
   * call (e.g. a generation domain may insert a fenced "modify this"
   * block; an operation-domain binding might use it as a prior-state snapshot).
   *
   * Optional. When absent, builders behave as a pure first-round generator.
   */
  previousOutput?: string;
  options?: AgentOptions;
}

export interface AgentOptions {
  /** Maximum iterations (default 3 for orchestrator, 15 for model-driven) */
  maxIterations?: number;
  /** @deprecated Use maxIterations */
  maxRetries?: number;
  /** Model override */
  model?: string;
  /**
   * Caller-supplied abort signal. Strategies forward this to every LLM
   * call so client cancellation (HTTP disconnect, explicit abort)
   * propagates all the way to the underlying `fetch`. The route bridges
   * the consumer's request signal here.
   */
  signal?: AbortSignal;
}

export interface AgentOutput {
  code: string;
  html: string;
  /** Number of iterations used */
  iterations: number;
  /** @deprecated Use iterations */
  attempts?: number;
  duration: number;
  validation?: AgentValidation;
  /**
   * Run-level metadata: model id, provider name, accumulated token usage.
   * Strategies stamp this so callers can attribute cost/latency without
   * re-deriving them from the streamed events.
   */
  metadata?: AgentMetadata;
}

export interface AgentValidation {
  valid: boolean;
  score?: number;
  issues?: ValidationIssue[];
}

/**
 * Per-run metadata produced by a loop strategy.
 *
 * `model` is the last model id reported by the provider — strategies that
 * make multiple LLM calls overwrite it on each call so the value reflects
 * what actually generated the final code. `usage` is accumulated across
 * every LLM call in the run; absent when no provider returned usage data.
 */
export interface AgentMetadata {
  model: string;
  provider?: string;
  usage?: TokenUsage;
}

// ── Stream Events ──────────────────────────────────────────────────

/**
 * Recommended values for `StreamEvent.data.step`. Generation-domain
 * strategies use these; operation-domain strategies are free to emit
 * their own strings (e.g. `'tool_round_3'`, `'proposal_created'`).
 */
export type StreamEventStep = 'analyze' | 'plan' | 'generate' | 'validate' | 'render';

/**
 * Classification carried on `error` stream events. Mirrors the JSON
 * error response shape so SSE consumers and JSON consumers see the
 * same vocabulary, and so HTTP routes can pick a status without
 * re-classifying error message strings.
 *
 *   INVALID_INPUT   — caller can fix by changing input (provider 4xx)
 *   QUOTA_EXCEEDED  — consumer policy refused the request (e.g. monthly
 *                     quota exhausted). Caller-fixable by upgrading the
 *                     plan or waiting; routes map this to HTTP 429.
 *   LLM_ERROR       — upstream LLM problem the caller cannot fix
 *                     (auth, rate limit, 5xx, empty response)
 *   INTERNAL_ERROR  — harness-side bug or unexpected failure
 */
export type StreamErrorCode = 'INVALID_INPUT' | 'QUOTA_EXCEEDED' | 'LLM_ERROR' | 'INTERNAL_ERROR';

export interface StreamEvent {
  type: 'start' | 'progress' | 'complete' | 'error';
  data: {
    /** Step vocabulary is open — see `StreamEventStep` for the generation defaults. */
    step?: string;
    message?: string;
    code?: string;
    html?: string;
    iteration?: number;
    /** @deprecated Use iteration */
    attempt?: number;
    validation?: AgentValidation;
    output?: AgentOutput;
    error?: string;
    /**
     * Classification for `type: 'error'` events. Absent on non-error
     * events. Strategies set this from the thrown error type — the
     * route then maps it to an HTTP status without re-classifying.
     */
    errorCode?: StreamErrorCode;
    /** Free slot for operation-domain payloads (e.g. proposal id, tool result). */
    domainData?: Record<string, unknown>;
  };
}

// ── Loop State ─────────────────────────────────────────────────────

/**
 * Mutable state object shared by all loop strategies. Each strategy
 * reads and writes the slots relevant to its paradigm. Generation slots
 * remain nullable so strategies can explicitly clear with `null`.
 *
 * Operation-domain bindings put their schema-specific data into
 * `domainState` — strategies pass it through untouched.
 */
export interface LoopState {
  // Input
  inputType: 'text' | 'image';
  input: string;
  imageMimeType: string | undefined;

  // Progress (string so operation domains can name their own phases)
  phase: string;
  iteration: number;
  maxIterations: number;

  // Generation slots
  analysis: string | null;
  plan: string | null;
  code: string | null;
  html: string | null;

  // Validation
  validation: AgentValidation | null;
  parseError: string | null;

  // Error
  error: string | null;

  // Timing
  startTime: number;

  // Message history (model-driven / langgraph)
  messages: ChatMessage[];

  /**
   * Free slot for operation-domain bindings. Strategies forward this
   * untouched; the binding owns the schema. Examples: a proposal-style
   * binding might store `proposalId`, `inspectedState`, `riskAssessment` here.
   */
  domainState?: Record<string, unknown>;
}

// ── Loop Strategy Signature ────────────────────────────────────────

/** Common signature for all loop strategies after domain binding */
export type BoundLoopFn = (input: AgentInput, llm: LLMProvider) => AsyncGenerator<StreamEvent>;

// ── Tier Resolver ──────────────────────────────────────────────────

/**
 * Outcome of resolving a per-request provider decision against a host's
 * tier / quota policy. Discriminated union so route layers can branch on
 * `ok` without importing host-specific error classes. `code` maps
 * directly to HTTP status — see `StreamErrorCode`.
 *
 * `provider` is a `ResolvedProvider` tagged union — routes branch on
 * `provider.kind` (`'llm'` vs `'session'`) to pick the matching loop
 * strategy. Hosts that only deal in per-turn LLM providers wrap their
 * `createProvider(...)` return value as `{ kind: 'llm', provider }`;
 * hosts that route to the Claude Agent SDK (or any future session-style
 * provider) return `{ kind: 'session', provider }`.
 */
export type TierResolution =
  | { ok: true; provider: ResolvedProvider }
  | { ok: false; code: StreamErrorCode; message: string };

/**
 * Consumer-owned policy hook. Given a consumer-defined `context` value
 * (whatever the consumer needs to make a routing decision — a user plan
 * id, a region, a workspace id, or nothing at all), returns either a
 * constructed `LLMProvider` or a classified error.
 *
 * `TCtx` is generic so core stays domain-agnostic — a consumer's tier
 * vocabulary (free/basic/pro, region tags, workspace ids, etc.) never
 * leaks into core. Each consumer ships a factory that closes over policy
 * state and returns a `TierResolver<TCtx>` for their context type.
 *
 * Tier semantics (allow-lists, model selection, quota) are owned by the
 * consumer — core stays neutral per the No-Fallback policy.
 */
export type TierResolver<TCtx = void> = (context: TCtx) => TierResolution;
