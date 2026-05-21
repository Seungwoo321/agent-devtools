/**
 * Fiber → source-location resolver. Supports React ≤ 18 (legacy
 * `_debugSource` field) and React 19 (no `_debugSource`; the JSX call
 * site is recovered by parsing the captured `_debugStack.stack`).
 *
 * Why this exists: React 19 removed `_debugSource` from fibers (see
 * `react-dom/cjs/react-dom-client.development.js`'s fiber constructor —
 * it initializes `_debugStack`/`_debugOwner`/`_debugInfo`/`_debugTask`
 * but not `_debugSource`). The replacement is `_debugStack`, an `Error`
 * captured at JSX creation. Its `.stack` string has the user's JSX call
 * site as the first frame that isn't React's own jsx-runtime / jsx-dev-
 * runtime / react-dom internals. Parse it, return the same
 * `FiberSourceLocation` shape the rest of the codebase already consumes,
 * and the picked-element preamble + page-files listing keep working
 * without per-call-site React-version branches.
 *
 * Path normalization: Vite serves dev modules from
 * `http://localhost:<port>/src/App.tsx?t=<bust>`. We strip the origin
 * and the cache-busting query so the result is workspace-relative
 * (`src/App.tsx`) — the form `FileTools.resolveForRead` resolves against
 * the workspace root.
 */
import type { FiberNodeLike, FiberSourceLocation } from './types.js';

/**
 * Resolve a fiber's authored source location.
 *
 * Returns the legacy `_debugSource` if present (React ≤ 18 path), then
 * falls back to parsing `_debugStack.stack` (React 19 path). Returns
 * `undefined` when neither yields a usable location — host (DOM) fibers,
 * production builds, libraries shipping pre-transpiled JSX without
 * source preservation, etc.
 */
export function resolveFiberSource(
  fiber: FiberNodeLike | null | undefined,
): FiberSourceLocation | undefined {
  if (!fiber) return undefined;
  const legacy = normalizeLegacyDebugSource(fiber._debugSource);
  if (legacy) return legacy;
  return parseDebugStack(fiber._debugStack);
}

/**
 * Validate + clone a legacy `_debugSource` value. We don't trust the
 * shape: `fileName` must be a non-empty string and `lineNumber` must be
 * a finite number; otherwise we return `undefined` rather than emitting
 * a half-broken location.
 */
export function normalizeLegacyDebugSource(raw: unknown): FiberSourceLocation | undefined {
  if (raw == null || typeof raw !== 'object') return undefined;
  const candidate = raw as {
    fileName?: unknown;
    lineNumber?: unknown;
    columnNumber?: unknown;
  };
  if (typeof candidate.fileName !== 'string' || candidate.fileName.length === 0) {
    return undefined;
  }
  if (typeof candidate.lineNumber !== 'number' || !Number.isFinite(candidate.lineNumber)) {
    return undefined;
  }
  const location: FiberSourceLocation = {
    fileName: candidate.fileName,
    lineNumber: candidate.lineNumber,
  };
  if (typeof candidate.columnNumber === 'number' && Number.isFinite(candidate.columnNumber)) {
    location.columnNumber = candidate.columnNumber;
  }
  return location;
}

/**
 * Parse a React 19 `_debugStack` value into a source location.
 *
 * Exported for unit testing the V8 stack-trace grammar in isolation. In
 * production, callers should prefer `resolveFiberSource(fiber)`, which
 * combines this with the `_debugSource` fallthrough.
 */
export function parseDebugStack(
  debugStack: { readonly stack?: unknown } | null | undefined,
): FiberSourceLocation | undefined {
  if (!debugStack || typeof debugStack !== 'object') return undefined;
  const stack = (debugStack as { stack?: unknown }).stack;
  if (typeof stack !== 'string' || stack.length === 0) return undefined;
  for (const line of stack.split('\n')) {
    const frame = parseFrame(line);
    if (!frame) continue;
    if (isReactInternalFrame(frame.fileName)) continue;
    return frame;
  }
  return undefined;
}

/**
 * Parse a single V8-format stack frame:
 *   `    at fnName (URL:line:col)`     — most common form
 *   `    at URL:line:col`              — anonymous frames
 *
 * Returns `undefined` for any other shape (Error header line,
 * `<anonymous>`, eval frames, etc).
 */
function parseFrame(line: string): FiberSourceLocation | undefined {
  // Greedy `(.+)` matches the URL portion up to the final `:line:col`
  // anchor at end-of-string-or-paren, which handles `http://host:port/...`
  // (colons inside the URL).
  const withParen = /\bat\s+.+?\s+\((.+):(\d+):(\d+)\)\s*$/.exec(line);
  const withoutParen = /\bat\s+(.+):(\d+):(\d+)\s*$/.exec(line);
  const match = withParen ?? withoutParen;
  if (!match) return undefined;
  const rawUrl = match[1];
  const lineNumber = Number.parseInt(match[2] ?? '', 10);
  const columnNumber = Number.parseInt(match[3] ?? '', 10);
  if (!rawUrl) return undefined;
  if (!Number.isFinite(lineNumber)) return undefined;
  const fileName = toWorkspacePath(rawUrl);
  if (!fileName) return undefined;
  const out: FiberSourceLocation = { fileName, lineNumber };
  if (Number.isFinite(columnNumber)) out.columnNumber = columnNumber;
  return out;
}

/**
 * Convert a raw stack-frame URL into the path form the workspace
 * `FileTools` consumes:
 *
 *   - `http(s)://host:port/src/App.tsx?t=…` → `src/App.tsx`
 *     (workspace-relative, no origin, no query bust)
 *   - `file:///abs/path/App.tsx`            → `/abs/path/App.tsx`
 *     (absolute filesystem path)
 *   - `/abs/path/App.tsx`                   → unchanged
 *   - `src/App.tsx`                         → unchanged
 *
 * Returns an empty string for unparseable input so the caller falls
 * through to the next stack frame.
 */
function toWorkspacePath(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return '';
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      // `pathname` keeps a leading slash; strip it so the result is
      // workspace-relative (Vite's dev URLs are rooted at project root).
      const path = url.pathname.replace(/^\/+/, '');
      // Vite's `@fs/<abs-path>` prefix maps to a real filesystem path
      // outside the project root — surface it as an absolute path so
      // FileTools' workspace-boundary check, not URL parsing, makes the
      // call on whether the file is readable.
      if (path.startsWith('@fs/')) return path.slice('@fs'.length);
      return path;
    } catch {
      return '';
    }
  }
  if (/^file:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      return decodeURIComponent(url.pathname);
    } catch {
      return '';
    }
  }
  // Strip a trailing `?query` / `#hash` defensively — some bundlers
  // append cache-busting suffixes to bare paths too.
  return trimmed.replace(/[?#].*$/, '');
}

/**
 * Skip frames pointing at React's own JSX runtime + reconciler. These
 * are always the first frame(s) in `_debugStack.stack`; we want the
 * user's call site, which sits one frame below.
 *
 * Matches both the unbundled CJS layout (`/react/cjs/…`) and Vite's
 * `.vite/deps/` pre-bundle cache (`react_jsx-dev-runtime.js`).
 */
function isReactInternalFrame(path: string): boolean {
  if (path.length === 0) return true;
  if (path.includes('react_jsx-runtime') || path.includes('react_jsx-dev-runtime')) return true;
  if (path.includes('react/jsx-runtime') || path.includes('react/jsx-dev-runtime')) return true;
  if (path.includes('react-dom/')) return true;
  if (/(?:^|[/\\])\.vite[/\\]deps[/\\]react[._-]/.test(path)) return true;
  if (/(?:^|[/\\])react[/\\](?:cjs[/\\])?react\./.test(path)) return true;
  return false;
}
