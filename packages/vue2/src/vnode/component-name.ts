import type { Vue2ComponentInstance, Vue2ComponentOptions } from './types.js';

/**
 * Resolve the human-readable name for a Vue 2 component instance.
 *
 * Priority order:
 *   1. `$options.name`          — explicit `name:` option in SFC <script>.
 *   2. `$options.__name`        — injected by vite-plugin-vue2 from the SFC
 *                                 filename when `name:` is omitted.
 *   3. `$options.displayName`   — convention some libraries follow.
 *   4. `$options._componentTag` — runtime-recorded tag for components
 *                                 registered locally without `name:`.
 *   5. basename of `$options.__file` minus `.vue` extension.
 *   6. `'Unknown'`              — last resort. Never throws.
 */
const UNKNOWN_NAME = 'Unknown';

export function resolveComponentName(instance: Vue2ComponentInstance | null | undefined): string {
  if (!instance) return UNKNOWN_NAME;
  const opts = instance.$options as Vue2ComponentOptions | undefined;
  if (!opts) return UNKNOWN_NAME;

  if (typeof opts.name === 'string' && opts.name.length > 0) return opts.name;
  if (typeof opts.__name === 'string' && opts.__name.length > 0) return opts.__name;
  if (typeof opts.displayName === 'string' && opts.displayName.length > 0) return opts.displayName;
  if (typeof opts._componentTag === 'string' && opts._componentTag.length > 0)
    return opts._componentTag;
  if (typeof opts.__file === 'string' && opts.__file.length > 0) {
    const file = baseFileName(opts.__file);
    const stripped = file.endsWith('.vue') ? file.slice(0, -4) : file;
    if (stripped.length > 0) return stripped;
  }
  return UNKNOWN_NAME;
}

function baseFileName(file: string): string {
  const normalised = file.replace(/\\/g, '/');
  const slash = normalised.lastIndexOf('/');
  return slash >= 0 ? normalised.slice(slash + 1) : normalised;
}
