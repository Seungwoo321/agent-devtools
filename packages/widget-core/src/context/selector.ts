/**
 * Build a best-effort CSS selector for an arbitrary element. We prefer a
 * stable id when available, otherwise a chain of tag + :nth-of-type(...)
 * walked up to a configurable depth.
 *
 * This selector is intended to give the agent a *human-readable handle*,
 * not a robust click-target — apps with reactive DOM trees change index
 * positions on every render. Use the React fiber path for stable identity.
 */

const DEFAULT_MAX_DEPTH = 6;

export interface BuildSelectorOptions {
  maxDepth?: number;
}

export function buildSelector(element: Element, options: BuildSelectorOptions = {}): string {
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const segments: string[] = [];
  let current: Element | null = element;
  let depth = 0;
  while (current && depth < maxDepth) {
    const id = idSegment(current);
    if (id !== null) {
      segments.unshift(id);
      return segments.join(' > ');
    }
    segments.unshift(segmentFor(current));
    current = current.parentElement;
    depth += 1;
  }
  return segments.join(' > ');
}

function idSegment(el: Element): string | null {
  const id = el.id;
  if (typeof id !== 'string' || id.length === 0) return null;
  if (!isSafeIdent(id)) return null;
  return `#${id}`;
}

function segmentFor(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const parent = el.parentElement;
  if (!parent) return tag;
  // Position among siblings of the same tag — stable across most renders
  // (text-node siblings don't shift the count).
  const siblings = Array.from(parent.children).filter((s) => s.tagName === el.tagName);
  if (siblings.length === 1) return tag;
  const index = siblings.indexOf(el) + 1;
  return `${tag}:nth-of-type(${index})`;
}

function isSafeIdent(id: string): boolean {
  // Conservative: only allow ASCII letters, digits, dashes, underscores.
  return /^[A-Za-z][\w-]*$/.test(id);
}
