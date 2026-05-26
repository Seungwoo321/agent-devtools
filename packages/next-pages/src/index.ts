/**
 * Next.js Pages Router adapter entry. Pages Router renders client
 * components with the same React fiber tree the React adapter walks, so
 * the client-side mount, picker, walker, and transport are reused
 * verbatim. This entry adds Pages-Router-specific helpers that callers
 * can opt into:
 *
 *   - `withAgentDevtools`: a `next.config.{js,mjs,ts}` wrapper that gates
 *     the dev-only bootstrap injection on `NODE_ENV !== 'production'`
 *     and installs a webpack alias that strips the widget chain from
 *     production bundles (Layer 1 guard).
 *   - `mountAgentDevtoolsNextPages`: a thin wrapper around
 *     mountAgentDevtools with a Layer 2 runtime guard for callers that
 *     bypass the bootstrap shim.
 *   - `bootstrapAgentDevtools`: the `pages/_app.tsx` entry that the host
 *     project calls once on first client render.
 *
 * The dev-only guard is documented in `.claude/rules/dev-only-guard.md`.
 */
export { mountAgentDevtoolsNextPages, type MountAgentDevtoolsNextPagesOptions } from './mount.js';
export { withAgentDevtools, type WithAgentDevtoolsOptions } from './config.js';
export { resolveNextPagesRouteFile } from './route.js';
// Framework-uniform aliases. The vite plugin's injected bootstrap imports
// these names verbatim from whichever adapter package the host project
// resolves to, so every adapter must surface the same symbols. Next-pages'
// `mountAgentDevtools` is just the React `mountAgentDevtools` re-exposed
// through the Layer 2 guard, because Pages Router client components render
// through the same React fiber tree.
export { mountAgentDevtoolsNextPages as mountAgentDevtools } from './mount.js';
export {
  createDefaultTransport,
  createRelatedImportsFetcher,
  createSourceSliceFetcher,
  createPageContextEnricher,
  createAgentInfoFetcher,
  createHandoffRequester,
  createSettingsStore,
} from '@agent-devtools/react';
