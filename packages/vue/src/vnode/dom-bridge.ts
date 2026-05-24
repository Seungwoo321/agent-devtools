import type { ComponentInstanceLike } from './types.js';

/**
 * Vue 3 attaches a back-reference from a rendered DOM node to the closest
 * owning component instance via the non-enumerable property
 * `__vueParentComponent` (set at patch time by the runtime renderer). The
 * field name has been stable since Vue 3.2 and survives in Vue 3.5 / 3.6.
 *
 * Unlike React's `__reactFiber$<nonce>`, Vue's property name has no random
 * suffix, so we read it directly. If the element was not rendered by Vue
 * (static HTML, another framework, devtools-injected DOM), the lookup
 * returns null and the picker degrades to DOM-only evidence — never throws.
 */
const PARENT_COMPONENT_PROP = '__vueParentComponent';

export function getComponentInstanceForElement(
  target: object | null | undefined,
): ComponentInstanceLike | null {
  if (target == null) return null;
  const owner = target as Record<string, unknown>;
  const value = owner[PARENT_COMPONENT_PROP];
  if (value != null && typeof value === 'object') {
    return value as ComponentInstanceLike;
  }
  return null;
}
