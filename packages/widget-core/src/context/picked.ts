/**
 * Framework-agnostic pick-time evidence collector. Produces a
 * `PickedEvidence` from raw DOM only — no fiber walker, no Vue instance
 * graph, no Svelte meta. Adapters (`@agent-devtools/react`,
 * `@agent-devtools/vue`, ...) override this default by passing their own
 * `describePicked` to `mountAgentDevtools`, so they can fill in
 * `componentName`, `source`, `componentChain`, and `propsSnapshot` from
 * the framework's internal graph.
 *
 * When this default runs, the agent still gets enough to grep for the
 * picked element: `outerHTML`, `selector`, `tagName`, `id`, `className`,
 * `attributes`, and `text`. `componentName` falls back to the tag name
 * and `componentChain` comes back empty — matching Case C in
 * `.claude/rules/picker-coverage.md`.
 *
 * Truncation defaults are sized for prompt economy.
 */
import { buildSelector, type BuildSelectorOptions } from './selector.js';
import type { BoundingRect, PickedEvidence } from './types.js';

const DEFAULT_TEXT_LIMIT = 120;
const DEFAULT_OUTER_HTML_LIMIT = 4096;
const DEFAULT_COMPONENT_CHAIN_DEPTH = 10;
const TRUNCATION_MARKER = '…[truncated]';

export interface DescribePickedOptions {
  selector?: BuildSelectorOptions;
  /** Max characters of textContent to include. Default 120. */
  textLimit?: number;
  /** Max characters of outerHTML to include. Default 4096. */
  outerHTMLLimit?: number;
  /** Max characters of the serialised propsSnapshot. Default 4096. Ignored by the DOM-only default — adapters use it. */
  propsSnapshotLimit?: number;
  /** Max named ancestors to include in componentChain. Default 10. Ignored by the DOM-only default — adapters use it. */
  componentChainDepth?: number;
}

/**
 * Build a DOM-only `PickedEvidence` for the given element. Adapters
 * override this with framework-aware versions.
 */
export function describePicked(
  element: Element,
  options: DescribePickedOptions = {},
): PickedEvidence {
  const textLimit = options.textLimit ?? DEFAULT_TEXT_LIMIT;
  const outerHTMLLimit = options.outerHTMLLimit ?? DEFAULT_OUTER_HTML_LIMIT;

  const result: PickedEvidence = {
    componentName: element.tagName.toLowerCase(),
    tagName: element.tagName,
    selector: buildSelector(element, options.selector ?? {}),
    outerHTML: clampString(element.outerHTML ?? '', outerHTMLLimit),
    attributes: collectAttributes(element),
    componentChain: [],
  };

  const rect = readBoundingRect(element);
  if (rect) result.boundingRect = rect;

  const text = extractText(element, textLimit);
  if (text !== undefined) result.text = text;
  if (element.id) result.id = element.id;
  const className = readClassName(element);
  if (className !== undefined) result.className = className;

  return result;
}

export { DEFAULT_COMPONENT_CHAIN_DEPTH };

export function clampString(raw: string, max: number): string {
  if (raw.length <= max) return raw;
  return raw.slice(0, max) + TRUNCATION_MARKER;
}

export function collectAttributes(element: Element): Readonly<Record<string, string>> {
  const out: Record<string, string> = {};
  // `element.attributes` is a live NamedNodeMap. Iterate by index — the
  // for…of form depends on Symbol.iterator which jsdom/happy-dom
  // implement, but indexed access is universal.
  for (let i = 0; i < element.attributes.length; i += 1) {
    const attr = element.attributes.item(i);
    if (!attr) continue;
    out[attr.name] = attr.value;
  }
  return out;
}

export function readBoundingRect(element: Element): BoundingRect | undefined {
  const fn = (element as { getBoundingClientRect?: () => DOMRect }).getBoundingClientRect;
  if (typeof fn !== 'function') return undefined;
  let rect: DOMRect;
  try {
    rect = fn.call(element);
  } catch {
    return undefined;
  }
  if (!rect) return undefined;
  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  };
}

export function extractText(el: Element, limit: number): string | undefined {
  const raw = el.textContent;
  if (raw === null || raw === undefined) return undefined;
  const trimmed = raw.replace(/\s+/g, ' ').trim();
  if (trimmed.length === 0) return undefined;
  return trimmed.length <= limit ? trimmed : `${trimmed.slice(0, limit)}…`;
}

export function readClassName(el: Element): string | undefined {
  const raw = el.className;
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
