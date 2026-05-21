import { resolveComponentName } from './component-name.js';
import { resolveFiberSource } from './source.js';
import type { FiberComponentRef, FiberNodeLike } from './types.js';

/**
 * Maximum number of fibers to visit in a single walk. React trees in real
 * apps stay well below this; the cap exists to bound walk cost when an
 * adversarial / malformed fiber graph contains cycles.
 */
const DEFAULT_MAX_FIBERS = 50_000;

export interface WalkOptions {
  /** Hard cap on fibers visited. Default 50,000. */
  maxFibers?: number;
}

/**
 * Iterate the fiber subtree rooted at `start` in pre-order (parent → child →
 * sibling) using an explicit stack. Returns every visited fiber once. Cycle
 * safe: never visits the same node twice.
 */
export function* walkFiberTree(
  start: FiberNodeLike | null | undefined,
  options: WalkOptions = {},
): Generator<FiberNodeLike> {
  if (!start) return;
  const maxFibers = options.maxFibers ?? DEFAULT_MAX_FIBERS;
  const seen = new WeakSet<FiberNodeLike>();
  const stack: FiberNodeLike[] = [start];
  let visited = 0;
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node || seen.has(node)) continue;
    seen.add(node);
    yield node;
    visited += 1;
    if (visited >= maxFibers) return;
    // Push sibling first so child is processed next (pre-order).
    if (node.sibling) stack.push(node.sibling);
    if (node.child) stack.push(node.child);
  }
}

/**
 * Collect every fiber's source location and component name. Fibers
 * without a resolvable source (host fibers, production builds, libraries
 * without source preservation) are skipped. The returned array preserves
 * walk order; use `dedupeSources` if you want to group by file.
 *
 * Source resolution spans React generations: `_debugSource` for React
 * ≤ 18, `_debugStack` parsing for React 19. See `./source.ts`.
 */
export function collectComponentRefs(
  start: FiberNodeLike | null | undefined,
  options: WalkOptions = {},
): FiberComponentRef[] {
  const refs: FiberComponentRef[] = [];
  for (const fiber of walkFiberTree(start, options)) {
    const source = resolveFiberSource(fiber);
    if (!source) continue;
    refs.push({
      componentName: resolveComponentName(fiber),
      source,
    });
  }
  return refs;
}

/**
 * Walk the fiber ancestor chain via `.return`, leaf-first, yielding named
 * component fibers (function/class). Host fibers (DOM intrinsics) are
 * skipped because they have no useful component name. Stops after
 * `maxDepth` named ancestors so a deep tree doesn't bloat the context
 * payload. Cycle-safe.
 */
export function* walkComponentAncestors(
  start: FiberNodeLike | null | undefined,
  options: { readonly maxDepth?: number } = {},
): Generator<FiberNodeLike> {
  const maxDepth = options.maxDepth ?? 10;
  if (!start) return;
  const seen = new WeakSet<FiberNodeLike>();
  let cursor: FiberNodeLike | null | undefined = start;
  let yielded = 0;
  while (cursor) {
    if (seen.has(cursor)) return;
    seen.add(cursor);
    if (isComponentFiber(cursor)) {
      yield cursor;
      yielded += 1;
      if (yielded >= maxDepth) return;
    }
    cursor = cursor.return ?? null;
  }
}

function isComponentFiber(fiber: FiberNodeLike): boolean {
  // Host fibers (DOM tags) have a string `type`. Function / class
  // components carry the component function / class.
  const t = fiber.type;
  return typeof t === 'function' || (typeof t === 'object' && t !== null);
}

/**
 * Collapse multiple refs that share the same fileName, keeping the first
 * encountered location for that file. Order matches first appearance.
 */
export function dedupeByFile(refs: FiberComponentRef[]): FiberComponentRef[] {
  const seen = new Set<string>();
  const result: FiberComponentRef[] = [];
  for (const ref of refs) {
    if (!ref.source) continue;
    const key = ref.source.fileName;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(ref);
  }
  return result;
}
