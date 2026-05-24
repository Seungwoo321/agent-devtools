import type { ComponentDefinitionLike, ComponentInstanceLike, VueSourceLocation } from './types.js';

/**
 * Resolve a Vue component instance's authored source location.
 *
 * `@vitejs/plugin-vue` injects `__file` (absolute path to the SFC) on the
 * component definition during dev. We surface that as the `fileName` and
 * default to line 1 because Vue's SFC compiler does not preserve per-tag
 * line numbers on the runtime component object — file-level granularity
 * is honest about the data we have, and the agent can still grep within
 * the file using the picked element's `outerHTML` + `selector`.
 *
 * Returns `undefined` when:
 *   - `instance.type` is missing (production build, anonymous wrapper)
 *   - `__file` is absent (library-shipped SFCs, render-function components)
 *   - the value is the wrong type
 */
export function resolveInstanceSource(
  instance: ComponentInstanceLike | null | undefined,
): VueSourceLocation | undefined {
  if (!instance) return undefined;
  const type = instance.type;
  if (!type || typeof type === 'function') return undefined;
  const def = type as ComponentDefinitionLike;
  const file = def.__file;
  if (typeof file !== 'string' || file.length === 0) return undefined;
  return {
    fileName: toWorkspacePath(file),
    lineNumber: 1,
  };
}

/**
 * Normalise a path so the agent can grep against the workspace root.
 *
 * Mirrors the React adapter's `toWorkspacePath` policy:
 *   - `http://localhost:5173/src/App.vue?t=…` → `src/App.vue`
 *   - `/abs/path/App.vue`                     → unchanged (absolute path)
 *   - `src/App.vue`                           → unchanged
 *   - `file:///abs/App.vue`                   → `/abs/App.vue`
 *
 * Returns the input string when it cannot be parsed — better to send a
 * raw path than to drop the location entirely.
 */
function toWorkspacePath(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return '';
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      const path = url.pathname.replace(/^\/+/, '');
      if (path.startsWith('@fs/')) return path.slice('@fs'.length);
      return path;
    } catch {
      return trimmed;
    }
  }
  if (/^file:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      return decodeURIComponent(url.pathname);
    } catch {
      return trimmed;
    }
  }
  return trimmed.replace(/[?#].*$/, '');
}
