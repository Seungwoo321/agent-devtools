/**
 * Next.js mount entry. Next renders client components with the same React
 * fiber tree the React adapter walks, so the default describePicked from
 * @agent-devtools/react resolves correctly — this wrapper exists so the
 * public API mirrors the Vue/Nuxt adapters and lets callers thread Next-
 * specific options (e.g. RSC source pragma fallback) without dropping into
 * the React package directly.
 */
import {
  mountAgentDevtools,
  type AgentDevtoolsHandle,
  type MountAgentDevtoolsOptions,
} from '@agent-devtools/react';

export type MountAgentDevtoolsNextOptions = MountAgentDevtoolsOptions;

export function mountAgentDevtoolsNext(
  options: MountAgentDevtoolsNextOptions = {},
): AgentDevtoolsHandle {
  return mountAgentDevtools(options);
}
