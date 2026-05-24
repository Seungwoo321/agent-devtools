import type { SvelteElementMeta, SvelteSourceLocation } from './types.js';

/**
 * Resolve a `SvelteSourceLocation` from a `__svelte_meta` entry. The
 * file path is normalised to a workspace-relative form when possible
 * (strips Vite's `/@fs/` prefix, decodes `file://` URLs, removes a
 * trailing `?t=<bust>` query string) so the agent can grep for it
 * directly. Returns `undefined` when the meta lacks a file or line.
 */
export function resolveSourceFromMeta(
  meta: SvelteElementMeta | null,
): SvelteSourceLocation | undefined {
  if (!meta?.loc) return undefined;
  const { file, line, column } = meta.loc;
  if (typeof file !== 'string' || file.length === 0) return undefined;
  if (typeof line !== 'number' || !Number.isFinite(line)) return undefined;
  const fileName = normalisePath(file);
  if (typeof column === 'number' && Number.isFinite(column)) {
    return { fileName, lineNumber: line, columnNumber: column };
  }
  return { fileName, lineNumber: line };
}

function normalisePath(raw: string): string {
  let path = raw;
  if (path.startsWith('file://')) {
    try {
      path = decodeURIComponent(new URL(path).pathname);
    } catch {
      // fall through
    }
  }
  const queryAt = path.indexOf('?');
  if (queryAt >= 0) path = path.slice(0, queryAt);
  if (path.startsWith('/@fs/')) path = path.slice('/@fs'.length);
  return path;
}

/**
 * Derive a human-readable component name from a Svelte source path.
 * Strategy: use the file's basename without extension. Falls back to
 * `'Unknown'` when nothing usable is present, mirroring the convention
 * shared by the React and Vue adapters.
 */
export function deriveComponentName(file: string | undefined): string {
  if (typeof file !== 'string' || file.length === 0) return 'Unknown';
  const cleaned = normalisePath(file);
  const lastSlash = cleaned.lastIndexOf('/');
  const base = lastSlash >= 0 ? cleaned.slice(lastSlash + 1) : cleaned;
  const dot = base.lastIndexOf('.');
  const name = dot > 0 ? base.slice(0, dot) : base;
  return name.length > 0 ? name : 'Unknown';
}
