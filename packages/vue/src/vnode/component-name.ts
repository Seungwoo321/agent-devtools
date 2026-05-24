import type { ComponentDefinitionLike, ComponentInstanceLike } from './types.js';

/**
 * Resolve the human-readable name for a Vue component instance.
 *
 * Priority order:
 *   1. `instance.type.name`        — explicit `name:` option in SFC <script>.
 *   2. `instance.type.__name`      — injected by `@vitejs/plugin-vue` from
 *                                    SFC filename when `name:` is omitted.
 *   3. `instance.type.displayName` — convention some libraries follow.
 *   4. basename of `instance.type.__file` minus `.vue` extension.
 *   5. `Function.name`             — setup functions defined inline.
 *   6. `'Unknown'`                 — last resort. Never throws.
 */
const UNKNOWN_NAME = 'Unknown';

export function resolveComponentName(instance: ComponentInstanceLike | null | undefined): string {
  if (!instance) return UNKNOWN_NAME;
  const type = instance.type;
  if (!type) return UNKNOWN_NAME;

  if (typeof type === 'function') {
    return type.name && type.name.length > 0 ? type.name : UNKNOWN_NAME;
  }

  const def = type as ComponentDefinitionLike;
  if (typeof def.name === 'string' && def.name.length > 0) return def.name;
  if (typeof def.__name === 'string' && def.__name.length > 0) return def.__name;
  if (typeof def.displayName === 'string' && def.displayName.length > 0) return def.displayName;
  if (typeof def.__file === 'string' && def.__file.length > 0) {
    const file = baseFileName(def.__file);
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
