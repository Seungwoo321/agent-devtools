import type { AngularComponentInstance, AngularSourceLocation } from './types.js';

/**
 * Resolve a workspace-relative source location for an Angular component
 * instance. Angular's template compiler does not emit `__source` style
 * props the way React's JSX dev transform does, and the runtime exposes
 * no file-level metadata for component classes. Production-quality
 * location resolution requires an AOT build step that records template
 * positions, which Phase 0 does not ship.
 *
 * Until a dedicated source-extraction transform lands, this resolver
 * returns `undefined` so picker evidence simply omits the `source` field.
 * The component class name plus selector still gives the agent enough to
 * locate the file via grep — see `picker-coverage.md` for the policy.
 */
export function resolveInstanceSource(
  _instance: AngularComponentInstance | null,
): AngularSourceLocation | undefined {
  return undefined;
}
