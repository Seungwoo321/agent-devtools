/**
 * Next.js 15 adapter entry. Next renders client components with the same
 * React fiber tree the React adapter walks, so the client-side mount,
 * picker, walker, and transport are reused verbatim. This entry adds
 * Next-specific helpers that callers can opt into:
 *
 *   - `withAgentDevtools`: a `next.config.{js,mjs,ts}` wrapper that gates
 *     the dev-only bootstrap injection on `NODE_ENV !== 'production'`.
 *   - `mountAgentDevtoolsNext`: a thin re-export of mountAgentDevtools so
 *     "Continue in terminal" client code can be framework-uniform.
 *
 * Note: the dev-only injection for `app/` and `pages/` routers is handled
 * by `@agent-devtools/vite` callers today. The `withAgentDevtools` helper
 * is wired up for projects that prefer to inject through next.config.
 */
export { mountAgentDevtoolsNext, type MountAgentDevtoolsNextOptions } from './mount.js';
export { withAgentDevtools, type WithAgentDevtoolsOptions } from './config.js';
// Framework-uniform aliases. The vite plugin's injected bootstrap imports
// these names verbatim from whichever adapter package the host project
// resolves to, so every adapter must surface the same symbols. Next's
// `mountAgentDevtools` is just the React `mountAgentDevtools` re-exposed,
// because Next client components render through the same React fiber tree.
export { mountAgentDevtoolsNext as mountAgentDevtools } from './mount.js';
export {
  createDefaultTransport,
  createRelatedImportsFetcher,
  createSourceSliceFetcher,
  createPageContextEnricher,
  createAgentInfoFetcher,
  createHandoffRequester,
  createSettingsStore,
} from '@agent-devtools/react';
