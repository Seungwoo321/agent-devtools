import type { ComponentInstanceLike } from './types.js';

/**
 * Walk the Vue component-instance ancestor chain via `.parent`, leaf-first,
 * yielding instances that have a usable identity (named component options,
 * or a component definition that carries `__file`).
 *
 * Anonymous wrappers (e.g. internal `<Fragment>`, `<Suspense>`, root
 * component without a name and without `__file`) are skipped so the
 * resulting chain is the user-meaningful component hierarchy.
 *
 * Caps at `maxDepth` named ancestors (default 10) to bound the prompt
 * payload size, mirroring the React walker. Cycle-safe.
 */
export function* walkComponentAncestors(
  start: ComponentInstanceLike | null | undefined,
  options: { readonly maxDepth?: number } = {},
): Generator<ComponentInstanceLike> {
  const maxDepth = options.maxDepth ?? 10;
  if (!start) return;
  const seen = new WeakSet<ComponentInstanceLike>();
  let cursor: ComponentInstanceLike | null | undefined = start;
  let yielded = 0;
  while (cursor) {
    if (seen.has(cursor)) return;
    seen.add(cursor);
    if (hasResolvableIdentity(cursor)) {
      yield cursor;
      yielded += 1;
      if (yielded >= maxDepth) return;
    }
    cursor = cursor.parent ?? null;
  }
}

function hasResolvableIdentity(instance: ComponentInstanceLike): boolean {
  const type = instance.type;
  if (!type) return false;
  if (typeof type === 'function') {
    return typeof type.name === 'string' && type.name.length > 0;
  }
  return Boolean(type.name || type.__name || type.displayName || type.__file);
}
