/**
 * Minimal structural typing for React fiber nodes. We only model fields we
 * actually read — react itself doesn't export fiber types.
 *
 * Source-location resolution spans two React generations:
 *   - React ≤ 18 populated `_debugSource` (set by the legacy
 *     `__source` JSX pragma) with `{fileName, lineNumber, columnNumber}`.
 *   - React 19 removed `_debugSource` and instead stores a captured
 *     `Error` on `_debugStack`; the original JSX call site is recovered
 *     by parsing `_debugStack.stack`.
 *
 * `resolveFiberSource` (see `./source.ts`) tries `_debugSource` first and
 * falls back to `_debugStack` parsing, so this module supports both eras.
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
