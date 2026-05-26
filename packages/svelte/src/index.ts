export {
  mountAgentDevtoolsSvelte,
  type MountAgentDevtoolsSvelteOptions,
} from './orchestrator/mount.js';
export { describePickedSvelte, type DescribePickedSvelteOptions } from './component/picked.js';
export { walkComponentAncestors } from './component/walker.js';
export { readSvelteMeta } from './component/dom-bridge.js';
export { deriveComponentName, resolveSourceFromMeta } from './component/source.js';
export type {
  SvelteComponentRef,
  SvelteElementMeta,
  SvelteSourceLocation,
} from './component/types.js';
// Framework-uniform aliases. The vite plugin's injected bootstrap imports
// these names verbatim from whichever adapter package the host project
// resolves to, so every adapter must surface the same symbols.
export { mountAgentDevtoolsSvelte as mountAgentDevtools } from './orchestrator/mount.js';
export {
  createDefaultTransport,
  createRelatedImportsFetcher,
  createSourceSliceFetcher,
  createPageContextEnricher,
  createAgentInfoFetcher,
  createHandoffRequester,
  createSettingsStore,
} from '@agent-devtools/widget-core';
