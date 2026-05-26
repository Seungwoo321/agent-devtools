/**
 * React adapter public surface. Re-exports the framework-agnostic widget
 * shell from `@agent-devtools/widget-core` and overrides three callsites
 * with React-aware behaviour:
 *   - `mountAgentDevtools` defaults to the React `describePicked` +
 *     fiber-based `collectPageFiles`.
 *   - `buildPageContext` / `describePicked` / `collectPageFilesReact`
 *     resolve component identity through the fiber walker.
 * Callers wanting the DOM-only fallback can import directly from
 * `@agent-devtools/widget-core`.
 */
export * from '@agent-devtools/widget-core';

export {
  buildPageContext,
  collectPageFilesReact,
  describePicked,
  type BuildPageContextReactInput,
  type DescribePickedOptions,
} from './context/index.js';

export * from './fiber/index.js';
export { mountAgentDevtools, type MountAgentDevtoolsReactOptions } from './orchestrator/index.js';
