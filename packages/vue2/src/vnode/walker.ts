import type { Vue2ComponentInstance } from './types.js';

export function* walkComponentAncestors(
  start: Vue2ComponentInstance | null | undefined,
  options: { readonly maxDepth?: number } = {},
): Generator<Vue2ComponentInstance> {
  const maxDepth = options.maxDepth ?? 10;
  if (!start) return;
  const seen = new WeakSet<Vue2ComponentInstance>();
  let cursor: Vue2ComponentInstance | null | undefined = start;
  let yielded = 0;
  while (cursor) {
    if (seen.has(cursor)) return;
    seen.add(cursor);
    if (hasResolvableIdentity(cursor)) {
      yield cursor;
      yielded += 1;
      if (yielded >= maxDepth) return;
    }
    cursor = cursor.$parent ?? null;
  }
}

function hasResolvableIdentity(instance: Vue2ComponentInstance): boolean {
  const opts = instance.$options;
  if (!opts) return false;
  return Boolean(opts.name || opts.__name || opts.displayName || opts._componentTag || opts.__file);
}
