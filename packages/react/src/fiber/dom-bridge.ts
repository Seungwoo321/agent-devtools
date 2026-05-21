import type { FiberNodeLike } from './types.js';

/**
 * React attaches the fiber for a rendered DOM node as a property
 * `__reactFiber$<random>` on the element itself. The root container
 * additionally gets `__reactContainer$<random>` pointing at the host root
 * fiber. The random suffix is stable for the lifetime of the renderer
 * instance — we discover it by enumerating the element's own properties.
 *
 * Both prefixes have been the public-but-unofficial contract since React 17
 * and survive in React 19. We treat them as the only supported way to bridge
 * the DOM ↔ fiber boundary — if React changes the prefix in the future, this
 * function returns null and the agent context becomes "DOM-only" rather than
 * crashing.
 */

const FIBER_PREFIX = '__reactFiber$';
const CONTAINER_PREFIX = '__reactContainer$';

/**
 * Look up the fiber for an arbitrary DOM element (typically the picked
 * element under the pointer). Returns null if the element was not rendered
 * by React, or if React's internal property names changed.
 */
export function getFiberForElement(target: object | null | undefined): FiberNodeLike | null {
  return findKeyedFiber(target, FIBER_PREFIX);
}

/**
 * Look up the host root fiber from a React root container element (the DOM
 * node passed to `createRoot(...)`). Returns null if the element is not a
 * root container. To get the App-level fiber you typically take
 * `getHostRootFiber(container)?.child`.
 */
export function getHostRootFiber(container: object | null | undefined): FiberNodeLike | null {
  return findKeyedFiber(container, CONTAINER_PREFIX);
}

function findKeyedFiber(target: object | null | undefined, prefix: string): FiberNodeLike | null {
  if (target == null) return null;
  const owner = target as Record<string, unknown>;
  for (const key of Object.keys(owner)) {
    if (!key.startsWith(prefix)) continue;
    const value = owner[key];
    if (value != null && typeof value === 'object') {
      return value as FiberNodeLike;
    }
  }
  return null;
}
