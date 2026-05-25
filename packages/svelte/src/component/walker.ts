import { readSvelteMeta } from './dom-bridge.js';
import { deriveComponentName, resolveSourceFromMeta } from './source.js';
import type { SvelteComponentRef } from './types.js';

/**
 * Walk DOM ancestors yielding a `SvelteComponentRef` for each level
 * whose `__svelte_meta` resolves to a unique source file. Two sibling
 * elements rendered by the same `.svelte` file share the same `file`
 * path; we deduplicate by file path so a component appears once in
 * the chain.
 */
export function* walkComponentAncestors(
  element: Element | null | undefined,
  options: { readonly maxDepth?: number } = {},
): Generator<SvelteComponentRef> {
  const maxDepth = options.maxDepth ?? 10;
  if (!element) return;
  const seenFiles = new Set<string>();
  let cursor: Element | null = element;
  let yielded = 0;
  while (cursor) {
    const meta = readSvelteMeta(cursor);
    const file = meta?.loc?.file;
    if (typeof file === 'string' && file.length > 0 && !seenFiles.has(file)) {
      seenFiles.add(file);
      const source = resolveSourceFromMeta(meta);
      const ref: SvelteComponentRef = {
        componentName: deriveComponentName(file),
      };
      if (source) ref.source = source;
      yield ref;
      yielded += 1;
      if (yielded >= maxDepth) return;
    }
    cursor = cursor.parentElement;
  }
}
