export {
  mountAgentDevtoolsAngular,
  type MountAgentDevtoolsAngularOptions,
} from './orchestrator/mount.js';
export { describePickedAngular, type DescribePickedAngularOptions } from './component/picked.js';
export { walkComponentAncestors } from './component/walker.js';
export { resolveComponentName } from './component/component-name.js';
export { resolveInstanceSource } from './component/source.js';
export { getComponentInstanceForElement } from './component/dom-bridge.js';
export type {
  AngularComponentInstance,
  AngularComponentRef,
  AngularSourceLocation,
} from './component/types.js';
// Framework-uniform aliases. The vite plugin's injected bootstrap imports
// these names verbatim from whichever adapter package the host project
// resolves to, so every adapter must surface the same symbols.
export { mountAgentDevtoolsAngular as mountAgentDevtools } from './orchestrator/mount.js';
export {
  createDefaultTransport,
  createRelatedImportsFetcher,
  createSourceSliceFetcher,
  createPageContextEnricher,
  createAgentInfoFetcher,
  createHandoffRequester,
  createSettingsStore,
} from '@agent-devtools/widget-core';
