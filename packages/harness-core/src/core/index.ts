/**
 * Core Module — Domain-Agnostic Agent Harness
 */

// Domain interfaces (Plan B: type-discriminated DomainBinding)
export type {
  GenerationDomain,
  OperationDomain,
  DomainBinding,
  PromptProvider,
  ToolProvider,
  LoopConfig,
  LoopState,
  AgentInput,
  AgentOptions,
  AgentOutput,
  AgentMetadata,
  AgentValidation,
  StreamEvent,
  StreamEventStep,
  StreamErrorCode,
  BoundLoopFn,
  TierResolution,
  TierResolver,
  ParseResult,
  RenderResult,
  ValidationResult,
  ConvertResult,
  ValidationIssue,
} from './types.js';

// Resolved provider (re-exported from llm so route layers can branch on
// `provider.kind` without importing two modules).
export type { ResolvedProvider } from '../llm/session-types.js';

// State
export { createLoopState } from './state.js';
export type { LoopPhase } from './state.js';

// Errors
export { formatError, formatErrorWithPrefix } from './errors.js';

// Strategies
export {
  orchestratorLoop,
  modelDrivenLoop,
  langgraphLoop,
  sdkSessionLoop,
} from './strategies/index.js';
