export {
  mountAgentDevtoolsVue2,
  type MountAgentDevtoolsVue2Options,
} from './orchestrator/mount.js';
export { describePickedVue2, type DescribePickedVue2Options } from './vnode/picked.js';
export { walkComponentAncestors } from './vnode/walker.js';
export { resolveComponentName } from './vnode/component-name.js';
export { resolveInstanceSource } from './vnode/source.js';
export { getComponentInstanceForElement } from './vnode/dom-bridge.js';
export type {
  Vue2ComponentInstance,
  Vue2ComponentOptions,
  Vue2ComponentRef,
  Vue2SourceLocation,
} from './vnode/types.js';
// Framework-uniform aliases. The vite plugin's injected bootstrap imports
// these names verbatim from whichever adapter package the host project
// resolves to, so every adapter must surface the same symbols. The
// `mountAgentDevtools` alias is the framework-specific wrapper — calling
// it from the bootstrap still routes through the Vue 2 `describePicked`.
export { mountAgentDevtoolsVue2 as mountAgentDevtools } from './orchestrator/mount.js';
export {
  createDefaultTransport,
  createRelatedImportsFetcher,
  createSourceSliceFetcher,
  createPageContextEnricher,
  createAgentInfoFetcher,
  createAgentCommandsFetcher,
  createHandoffRequester,
  createSettingsStore,
} from '@agent-devtools/widget-core';
