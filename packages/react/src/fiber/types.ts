/**
 * Minimal structural typing for React fiber nodes. We only model fields we
 * actually read — react itself doesn't export fiber types.
 *
 * Source-location resolution uses three independent channels in
 * `resolveFiberSource` (see `./source.ts`):
 *   1. `_debugSource` — React ≤ 18 set this directly on the fiber from
 *      the JSX `__source` pragma. Removed in React 19.
 *   2. `_debugStack` — React 19's replacement: an `Error` captured at
 *      JSX creation; the call site is recovered by parsing `.stack`.
 *   3. `memoizedProps.__source` — the JSX source pragma as it sits on
 *      element props (Babel + SWC plugin output). Independent of every
 *      React internal debug field, so it survives future React-internal
 *      changes to the `_debug*` shapes.
 */

export interface FiberSourceLocation {
  fileName: string;
  lineNumber: number;
  columnNumber?: number;
}

/**
 * Structural fiber-node shape. Real React fibers have many more fields; we
 * accept any object that exposes these (so tests can build plain literals).
 */
export interface FiberNodeLike {
  // The component identity. For host (DOM) fibers this is a string ('div').
  // For function/class components it's the function/class itself.
  readonly type?: unknown;
  readonly elementType?: unknown;
  readonly tag?: number;
  readonly key?: string | null;
  readonly stateNode?: unknown;
  readonly memoizedProps?: unknown;
  readonly return?: FiberNodeLike | null;
  readonly child?: FiberNodeLike | null;
  readonly sibling?: FiberNodeLike | null;
  readonly _debugSource?: FiberSourceLocation | null;
  readonly _debugStack?: { readonly stack?: unknown } | null;
  readonly _debugOwner?: FiberNodeLike | null;
}

/**
 * A single React component reference, distilled to what the agent needs.
 */
export interface FiberComponentRef {
  /** Component display name (or 'Unknown' if we couldn't infer one). */
  componentName: string;
  /**
   * Source location set by the JSX `__source` pragma. Absent in production
   * builds, in libraries that ship pre-transpiled JSX without `__source`,
   * and for host (DOM) fibers.
   */
  source?: FiberSourceLocation;
}
