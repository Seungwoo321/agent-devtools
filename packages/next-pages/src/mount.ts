/**
 * Pages Router mount entry. Next.js Pages Router renders client components
 * through the same React fiber tree the React adapter walks, so the
 * default describePicked from @agent-devtools/react resolves correctly —
 * this wrapper exists so the public API mirrors the @agent-devtools/next
 * adapter (App Router) and lets callers thread Pages-Router-specific
 * options without dropping into the React package directly.
 *
 * The Layer 2 guard uses globalThis.process so tsup's browser-platform
 * build cannot statically prove the branch dead. process.env.NODE_ENV
 * is preserved as a literal token by tsup.config.ts's define option so
 * the host bundler (webpack DefinePlugin in `next build`) can substitute
 * it and DCE the early-return — Layer 1 of the dev-only guard pair.
 */
import {
  mountAgentDevtools,
  type AgentDevtoolsHandle,
  type MountAgentDevtoolsOptions,
} from '@agent-devtools/react';
import { resolveNextPagesRouteFile } from './route.js';

export type MountAgentDevtoolsNextPagesOptions = MountAgentDevtoolsOptions;

export function mountAgentDevtoolsNextPages(
  options: MountAgentDevtoolsNextPagesOptions = {},
): AgentDevtoolsHandle {
  const proc =
    typeof globalThis !== 'undefined'
      ? (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
      : undefined;
  if (proc?.env?.NODE_ENV === 'production') {
    throw new Error(
      '@agent-devtools/next-pages: mountAgentDevtoolsNextPages must not run in production. Ensure the bundler strips this import in production builds.',
    );
  }
  return mountAgentDevtools({
    ...options,
    resolveRouteFile: options.resolveRouteFile ?? resolveNextPagesRouteFile,
  });
}
