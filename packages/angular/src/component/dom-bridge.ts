import type { AngularComponentInstance } from './types.js';

/**
 * Returns the Angular component instance that owns the given DOM element,
 * or null if the element is outside of any component (or Ivy debug data is
 * unavailable, e.g. production build).
 *
 * Strategy:
 *   1. Prefer the public `window.ng.getOwningComponent` debug API. Ivy
 *      exposes this in dev mode and it walks the LView ancestry for us.
 *   2. Fall back to `window.ng.getComponent` which returns the component
 *      hosted at the exact element (only set on component root nodes).
 *
 * Both APIs are dev-only and disappear when Angular is bootstrapped with
 * `enableProdMode()` — that matches the dev-only guard rule.
 */
type AngularDebugApi = {
  getOwningComponent?: (element: unknown) => unknown;
  getComponent?: (element: unknown) => unknown;
};

function getDebugApi(): AngularDebugApi | null {
  if (typeof window === 'undefined') return null;
  const ng = (window as unknown as { ng?: AngularDebugApi }).ng;
  if (!ng || typeof ng !== 'object') return null;
  return ng;
}

export function getComponentInstanceForElement(
  element: Element | null,
): AngularComponentInstance | null {
  if (!element) return null;
  const api = getDebugApi();
  if (!api) return null;

  if (typeof api.getOwningComponent === 'function') {
    const owning = api.getOwningComponent(element);
    if (isComponentInstance(owning)) return owning;
  }
  if (typeof api.getComponent === 'function') {
    const hosted = api.getComponent(element);
    if (isComponentInstance(hosted)) return hosted;
  }
  return null;
}

function isComponentInstance(value: unknown): value is AngularComponentInstance {
  return Boolean(value) && typeof value === 'object';
}
