/**
 * Next.js mount entry. Next renders client components with the same React
 * fiber tree the React adapter walks, so the default describePicked from
 * @agent-devtools/react resolves correctly — this wrapper exists so the
 * public API mirrors the Vue/Nuxt adapters and lets callers thread Next-
 * specific options (e.g. RSC source pragma fallback) without dropping into
 * the React package directly.
 *
 * The wrapper also installs a default `resolveRouteFile` that maps the
 * current `window.location.pathname` onto an `app/**\/page.tsx` candidate
 * path. The result is a best-effort heuristic — the runtime cannot stat
 * the filesystem to verify the file actually exists — but it gives the
 * agent a starting point so it does not have to grep `app/` from scratch
 * to find which route file owns the picked element.
 */
import {
  mountAgentDevtools,
  type AgentDevtoolsHandle,
  type MountAgentDevtoolsOptions,
} from '@agent-devtools/react';
import { resolveNextAppRouterRouteFile } from './route.js';

export type MountAgentDevtoolsNextOptions = MountAgentDevtoolsOptions;

export function mountAgentDevtoolsNext(
  options: MountAgentDevtoolsNextOptions = {},
): AgentDevtoolsHandle {
  return mountAgentDevtools({
    ...options,
    resolveRouteFile: options.resolveRouteFile ?? resolveNextAppRouterRouteFile,
  });
}
