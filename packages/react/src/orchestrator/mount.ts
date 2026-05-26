/**
 * React-flavored wrapper around `@agent-devtools/widget-core`'s
 * framework-agnostic `mountAgentDevtools`. Injects the React-aware
 * `describePicked` (fiber walker → component / source / chain) and the
 * fiber-based `collectPageFiles` so the widget mounts with full React
 * evidence by default. Callers can still override either with the
 * same-named option.
 */
import {
  mountAgentDevtools as baseMountAgentDevtools,
  type AgentDevtoolsHandle,
  type MountAgentDevtoolsOptions,
} from '@agent-devtools/widget-core';
import { describePicked } from '../context/picked.js';
import { collectPageFilesReact } from '../context/build.js';

export type MountAgentDevtoolsReactOptions = MountAgentDevtoolsOptions;

export function mountAgentDevtools(options: MountAgentDevtoolsOptions = {}): AgentDevtoolsHandle {
  return baseMountAgentDevtools({
    ...options,
    describePicked: options.describePicked ?? describePicked,
    collectPageFiles: options.collectPageFiles ?? collectPageFilesReact,
  });
}
