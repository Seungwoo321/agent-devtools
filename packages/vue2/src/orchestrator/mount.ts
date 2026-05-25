import {
  mountAgentDevtools,
  type AgentDevtoolsHandle,
  type MountAgentDevtoolsOptions,
} from '@agent-devtools/react';
import { describePickedVue2 } from '../vnode/picked.js';

export interface MountAgentDevtoolsVue2Options extends Omit<
  MountAgentDevtoolsOptions,
  'describePicked'
> {
  describePicked?: MountAgentDevtoolsOptions['describePicked'];
}

export function mountAgentDevtoolsVue2(
  options: MountAgentDevtoolsVue2Options = {},
): AgentDevtoolsHandle {
  if (typeof process !== 'undefined' && process?.env?.NODE_ENV === 'production') {
    throw new Error(
      '@agent-devtools/vue2: mountAgentDevtoolsVue2 must not run in production. ' +
        'Ensure the bundler strips this import in production builds.',
    );
  }
  return mountAgentDevtools({
    ...options,
    describePicked: options.describePicked ?? describePickedVue2,
  });
}
