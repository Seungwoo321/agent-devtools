import { getComponentInstanceForElement } from './dom-bridge.js';
import { resolveComponentName } from './component-name.js';
import { resolveInstanceSource } from './source.js';
import type { AngularComponentInstance, AngularComponentRef } from './types.js';

/**
 * Walk DOM ancestors yielding the Angular component instance owning each
 * level. Angular's runtime does not expose a `parent` pointer on the
 * component instance itself — instead the `ng.getOwningComponent` debug
 * API tells us which component owns a given DOM element, and we hop up
 * the host element chain to gather ancestors. Visited instances are
 * deduplicated so a component that owns multiple sibling nodes only
 * yields once.
 */
export function* walkComponentAncestors(
  element: Element | null | undefined,
  options: { readonly maxDepth?: number } = {},
): Generator<AngularComponentRef> {
  const maxDepth = options.maxDepth ?? 10;
  if (!element) return;
  const seen = new WeakSet<AngularComponentInstance>();
  let cursor: Element | null = element;
  let yielded = 0;
  while (cursor) {
    const instance = getComponentInstanceForElement(cursor);
    if (instance && !seen.has(instance)) {
      seen.add(instance);
      yield {
        instance,
        componentName: resolveComponentName(instance),
        ...(resolveInstanceSource(instance) !== undefined
          ? { source: resolveInstanceSource(instance)! }
          : {}),
      };
      yielded += 1;
      if (yielded >= maxDepth) return;
    }
    cursor = cursor.parentElement;
  }
}
