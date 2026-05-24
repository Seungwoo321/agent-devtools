/**
 * Vue 3 mount entry. Delegates to the framework-agnostic widget orchestrator
 * exported by `@agent-devtools/react` (composer / launcher / picker / shadow
 * root are plain DOM modules that depend on no host framework runtime) and
 * injects `describePickedVue` so the picker resolves to Vue component
 * identity instead of React fibers.
 *
 * Why we reuse the React orchestrator instead of porting it: the widget UI
 * is implemented as imperative `document.createElement` factories living
 * inside a closed shadow root. It never imports React. The "React" in the
 * package name refers to the walker (`fiber/`) + the `describePicked`
 * helper — both of which are swappable. A separate Vue port would be code
 * duplication, not isolation.
 */
import {
  mountAgentDevtools,
  type AgentDevtoolsHandle,
  type MountAgentDevtoolsOptions,
} from '@agent-devtools/react';
import { describePickedVue } from '../vnode/picked.js';

export interface MountAgentDevtoolsVueOptions extends Omit<
  MountAgentDevtoolsOptions,
  'describePicked'
> {
  /**
   * Override the default Vue-aware element → PickedEvidence resolver. Most
   * callers should leave this unset; only Nuxt's auto-injection layer
   * passes a different resolver when a host project pins a custom walker.
   */
  describePicked?: MountAgentDevtoolsOptions['describePicked'];
}

export function mountAgentDevtoolsVue(
  options: MountAgentDevtoolsVueOptions = {},
): AgentDevtoolsHandle {
  return mountAgentDevtools({
    ...options,
    describePicked: options.describePicked ?? describePickedVue,
  });
}
