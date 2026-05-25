import type { SvelteElementMeta } from './types.js';

/**
 * Read the Svelte dev-mode metadata that the compiler attaches to every
 * DOM element it created. Returns `null` when the element was not
 * rendered by Svelte (static HTML, third-party widget) or when the host
 * is built in production mode (compiler strips `__svelte_meta`).
 */
export function readSvelteMeta(element: Element | null): SvelteElementMeta | null {
  if (!element) return null;
  const meta = (element as unknown as { __svelte_meta?: SvelteElementMeta }).__svelte_meta;
  if (!meta || typeof meta !== 'object') return null;
  return meta;
}
