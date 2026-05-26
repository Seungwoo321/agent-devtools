export { describePickedVue } from './vnode/picked.js';
export { getComponentInstanceForElement } from './vnode/dom-bridge.js';
export { walkComponentAncestors } from './vnode/walker.js';
export { resolveComponentName } from './vnode/component-name.js';
export { resolveInstanceSource } from './vnode/source.js';
export type { ComponentInstanceLike } from './vnode/types.js';
export { mountAgentDevtoolsVue, type MountAgentDevtoolsVueOptions } from './orchestrator/mount.js';
// Framework-uniform aliases. The vite plugin's injected bootstrap imports
// these names verbatim from whichever adapter package the host project
// resolves to (`@agent-devtools/{react,vue,vue2,next,nuxt}`), so every
// adapter must surface the same symbols. The `mountAgentDevtools` alias
// is the framework-specific wrapper (`mountAgentDevtoolsVue`) — calling
// it from the bootstrap still routes through the Vue `describePicked`.
export { mountAgentDevtoolsVue as mountAgentDevtools } from './orchestrator/mount.js';
export {
  createDefaultTransport,
  createRelatedImportsFetcher,
  createSourceSliceFetcher,
  createPageContextEnricher,
  createAgentInfoFetcher,
  createHandoffRequester,
  createSettingsStore,
} from '@agent-devtools/widget-core';
