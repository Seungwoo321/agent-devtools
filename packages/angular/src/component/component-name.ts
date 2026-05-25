import type { AngularComponentInstance } from './types.js';

/**
 * Resolve a human-readable component name for an Angular component instance.
 *
 * Priority order:
 *   1. `instance.constructor.name` (TypeScript class name from the @Component
 *      decorated class). Survives most build pipelines because Angular's
 *      compiler keeps the class identifier; minified production builds may
 *      mangle this but the dev-only guard means we never run there.
 *   2. The constructor's `name` static property (rare but defensive).
 *   3. Falls back to `'Unknown'` so callers can pass the value through
 *      without null-checking — mirrors the convention used by the React
 *      and Vue 2 adapters.
 */
export function resolveComponentName(instance: AngularComponentInstance | null): string {
  if (!instance) return 'Unknown';
  const ctor = instance.constructor;
  if (typeof ctor === 'function' && typeof ctor.name === 'string' && ctor.name.length > 0) {
    return ctor.name;
  }
  return 'Unknown';
}
