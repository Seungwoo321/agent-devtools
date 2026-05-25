import type { Vue2ComponentInstance } from './types.js';

const VUE2_INSTANCE_PROP = '__vue__';

/**
 * Vue 2 attaches a back-reference from the root DOM node of a component
 * instance via the property `__vue__`. Unlike Vue 3 (which sets a parent
 * reference on every rendered host node), Vue 2 only stamps the root
 * element of each component, so a click on a deeper descendant requires
 * walking up the DOM tree until we find the first element that owns an
 * instance reference.
 *
 * Returns null when no Vue 2 instance is reachable from the target — the
 * picker then degrades to DOM-only evidence instead of throwing.
 */
export function getComponentInstanceForElement(
  target: Element | null | undefined,
): Vue2ComponentInstance | null {
  if (target == null) return null;
  let cursor: Element | null = target;
  while (cursor) {
    const owner = cursor as unknown as Record<string, unknown>;
    const value = owner[VUE2_INSTANCE_PROP];
    if (value != null && typeof value === 'object') {
      return value as Vue2ComponentInstance;
    }
    cursor = cursor.parentElement;
  }
  return null;
}
