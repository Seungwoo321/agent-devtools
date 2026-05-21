export type { FiberComponentRef, FiberNodeLike, FiberSourceLocation } from './types.js';
export { resolveComponentName } from './component-name.js';
export {
  collectComponentRefs,
  dedupeByFile,
  walkComponentAncestors,
  walkFiberTree,
  type WalkOptions,
} from './walker.js';
export { getFiberForElement, getHostRootFiber } from './dom-bridge.js';
export { normalizeLegacyDebugSource, parseDebugStack, resolveFiberSource } from './source.js';
