import type { Vue2ComponentInstance, Vue2SourceLocation } from './types.js';

/**
 * Resolve a Vue 2 component instance's authored source location.
 *
 * vite-plugin-vue2 injects `__file` (absolute path to the SFC) on the
 * component options during dev. Vue 2's template compiler does not
 * preserve per-tag line numbers on the runtime component object, so we
 * surface file-level granularity and let the agent grep within the file
 * using the picked element's `outerHTML` + `selector`.
 *
 * Returns `undefined` when:
 *   - `$options` is missing (production build, anonymous wrapper)
 *   - `__file` is absent (library-shipped SFCs, render-function components)
 *   - the value is the wrong type
 */
export function resolveInstanceSource(
  instance: Vue2ComponentInstance | null | undefined,
): Vue2SourceLocation | undefined {
  if (!instance) return undefined;
  const opts = instance.$options;
  if (!opts) return undefined;
  const file = opts.__file;
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
