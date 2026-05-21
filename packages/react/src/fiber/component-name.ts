import type { FiberNodeLike } from './types.js';

/**
 * Resolve a human-readable component name from a fiber's `type`. Handles:
 *   - host components (string tag like 'div')
 *   - named function/class components (Function.name)
 *   - `displayName` overrides (forwardRef, memo, custom)
 *   - React.memo wrappers (`type.type`)
 *   - React.forwardRef wrappers (`type.render`)
 *   - lazy / context / fragment fallthrough → 'Unknown'
 *
 * Returns 'Unknown' when nothing is recoverable so the caller never has to
 * branch on undefined.
 */
export function resolveComponentName(fiber: FiberNodeLike): string {
  return fromType(fiber.type) ?? fromType(fiber.elementType) ?? 'Unknown';
}

function fromType(type: unknown): string | undefined {
  if (type == null) return undefined;
  if (typeof type === 'string') return type;
  if (typeof type === 'function') {
    const fn = type as { displayName?: unknown; name?: unknown };
    return pickName(fn.displayName) ?? pickName(fn.name);
  }
  if (typeof type === 'object') {
    const wrapper = type as {
      displayName?: unknown;
      type?: unknown; // memo(...).type
      render?: unknown; // forwardRef(...).render
    };
    const fromDisplay = pickName(wrapper.displayName);
    if (fromDisplay) return fromDisplay;
    if (wrapper.type !== undefined) {
      const inner = fromType(wrapper.type);
      if (inner) return inner;
    }
    if (typeof wrapper.render === 'function') {
      const inner = fromType(wrapper.render);
      if (inner) return inner;
    }
  }
  return undefined;
}

function pickName(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
