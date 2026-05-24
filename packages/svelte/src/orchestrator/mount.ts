import {
  mountAgentDevtools,
  type AgentDevtoolsHandle,
  type MountAgentDevtoolsOptions,
} from '@agent-devtools/react';
import { describePickedSvelte } from '../component/picked.js';

export interface MountAgentDevtoolsSvelteOptions extends Omit<
  MountAgentDevtoolsOptions,
  'describePicked'
> {
  describePicked?: MountAgentDevtoolsOptions['describePicked'];
}

export function mountAgentDevtoolsSvelte(
  options: MountAgentDevtoolsSvelteOptions = {},
): AgentDevtoolsHandle {
  // Use globalThis.process so tsup's browser-platform build can't statically
  // eliminate the guard via dead-code analysis — the redundant Layer 2 check
  // must survive into dist alongside the @agent-devtools/react guard.
  const proc = typeof globalThis !== 'undefined' ? globalThis.process : undefined;
  if (proc?.env?.NODE_ENV === 'production') {
    throw new Error(
      '@agent-devtools/svelte: mountAgentDevtoolsSvelte must not run in production. ' +
        'Ensure the bundler strips this import in production builds.',
    );
  }
  return mountAgentDevtools({
    ...options,
    describePicked: options.describePicked ?? describePickedSvelte,
  });
}
