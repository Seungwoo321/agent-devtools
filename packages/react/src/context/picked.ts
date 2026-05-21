/**
 * Pick-time evidence collector. The widget gives the agent everything it
 * needs to reason about the picked element without a follow-up tool call:
 * identity (component / tag / selector / source path), DOM evidence
 * (outerHTML / bounding rect / attributes), and React evidence (parent
 * component chain + sanitised props).
 *
 * Truncation defaults are sized for prompt economy:
 *   - outerHTML capped so even a moderately complex element (a card with
 *     a handful of children) survives, but a hand-pasted "entire page"
 *     element gets clipped.
 *   - propsSnapshot is JSON-serialised with a replacer that elides
 *     functions, React elements, DOM nodes and circulars; the encoded
 *     string is then size-capped.
 *   - componentChain stops at 10 named ancestors — far more than any
 *     real explanation needs.
 */
import { resolveComponentName } from '../fiber/component-name.js';
import { getFiberForElement } from '../fiber/dom-bridge.js';
import { resolveFiberSource } from '../fiber/source.js';
import { walkComponentAncestors } from '../fiber/walker.js';
import type { FiberNodeLike } from '../fiber/types.js';
import { buildSelector, type BuildSelectorOptions } from './selector.js';
import type { BoundingRect, ComponentChainEntry, PickedEvidence } from './types.js';

const DEFAULT_TEXT_LIMIT = 120;
const DEFAULT_OUTER_HTML_LIMIT = 4096;
const DEFAULT_PROPS_LIMIT = 4096;
const DEFAULT_COMPONENT_CHAIN_DEPTH = 10;
const TRUNCATION_MARKER = '…[truncated]';

export interface DescribePickedOptions {
  selector?: BuildSelectorOptions;
  /** Max characters of textContent to include. Default 120. */
  textLimit?: number;
  /** Max characters of outerHTML to include. Default 4096. */
  outerHTMLLimit?: number;
  /** Max characters of the serialised propsSnapshot. Default 4096. */
  propsSnapshotLimit?: number;
  /** Max named ancestors to include in componentChain. Default 10. */
  componentChainDepth?: number;
}

/**
 * Build a `PickedEvidence` for the given DOM element.
 */
export function describePicked(
  element: Element,
  options: DescribePickedOptions = {},
): PickedEvidence {
  const fiber = getFiberForElement(element);
  const componentName = fiber ? resolveComponentName(fiber) : element.tagName.toLowerCase();
  const textLimit = options.textLimit ?? DEFAULT_TEXT_LIMIT;
  const outerHTMLLimit = options.outerHTMLLimit ?? DEFAULT_OUTER_HTML_LIMIT;
  const propsLimit = options.propsSnapshotLimit ?? DEFAULT_PROPS_LIMIT;
  const chainDepth = options.componentChainDepth ?? DEFAULT_COMPONENT_CHAIN_DEPTH;

  const result: PickedEvidence = {
    componentName,
    tagName: element.tagName,
    selector: buildSelector(element, options.selector ?? {}),
    outerHTML: clampString(element.outerHTML ?? '', outerHTMLLimit),
    attributes: collectAttributes(element),
    componentChain: collectComponentChain(fiber, chainDepth),
  };

  const source = resolveFiberSource(fiber);
  if (source) result.source = source;

  const rect = readBoundingRect(element);
  if (rect) result.boundingRect = rect;

  const text = extractText(element, textLimit);
  if (text !== undefined) result.text = text;
  if (element.id) result.id = element.id;
  const className = readClassName(element);
  if (className !== undefined) result.className = className;

  const props = serialiseProps(fiber, propsLimit);
  if (props !== undefined) result.propsSnapshot = props;

  return result;
}

function clampString(raw: string, max: number): string {
  if (raw.length <= max) return raw;
  return raw.slice(0, max) + TRUNCATION_MARKER;
}

function collectAttributes(element: Element): Readonly<Record<string, string>> {
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

function readBoundingRect(element: Element): BoundingRect | undefined {
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

function extractText(el: Element, limit: number): string | undefined {
  const raw = el.textContent;
  if (raw === null || raw === undefined) return undefined;
  const trimmed = raw.replace(/\s+/g, ' ').trim();
  if (trimmed.length === 0) return undefined;
  return trimmed.length <= limit ? trimmed : `${trimmed.slice(0, limit)}…`;
}

function readClassName(el: Element): string | undefined {
  const raw = el.className;
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function collectComponentChain(
  fiber: FiberNodeLike | null,
  maxDepth: number,
): readonly ComponentChainEntry[] {
  if (!fiber) return [];
  const out: ComponentChainEntry[] = [];
  for (const ancestor of walkComponentAncestors(fiber, { maxDepth })) {
    const entry: ComponentChainEntry = {
      componentName: resolveComponentName(ancestor),
    };
    const src = resolveFiberSource(ancestor);
    if (src) entry.source = src;
    out.push(entry);
  }
  return out;
}

/**
 * Serialise the picked component's memoizedProps with a replacer that
 * drops React children, functions, DOM nodes and circular references.
 * The result is a string (not an object) because the server embeds it
 * verbatim into the prompt — keeping it a string avoids a second JSON
 * roundtrip on the wire and lets the caller cap the size precisely.
 */
function serialiseProps(fiber: FiberNodeLike | null, limit: number): string | undefined {
  const props = fiber?.memoizedProps;
  if (props == null || typeof props !== 'object') return undefined;
  const seen = new WeakSet<object>();
  let json: string;
  try {
    json = JSON.stringify(props, (key, value) => {
      if (key === 'children') return '[children]';
      if (typeof value === 'function') return '[function]';
      if (typeof value === 'symbol') return value.toString();
      if (typeof value === 'bigint') return value.toString();
      if (value && typeof value === 'object') {
        // DOM node or fiber-like shape — refuse to walk; it's cyclical
        // and not useful in a prompt.
        if (isDomLike(value) || isFiberLike(value) || isReactElement(value)) {
          return '[non-serialisable]';
        }
        if (seen.has(value as object)) return '[circular]';
        seen.add(value as object);
      }
      return value;
    });
  } catch {
    return undefined;
  }
  if (!json) return undefined;
  return clampString(json, limit);
}

function isDomLike(v: unknown): boolean {
  if (!v || typeof v !== 'object') return false;
  return typeof (v as { nodeType?: unknown }).nodeType === 'number';
}

function isFiberLike(v: unknown): boolean {
  if (!v || typeof v !== 'object') return false;
  // Fibers expose `stateNode` + `return` + `tag` — a heuristic, but
  // false positives just get tagged "[non-serialisable]".
  const f = v as { stateNode?: unknown; return?: unknown; tag?: unknown };
  return f.stateNode !== undefined && (f.return !== undefined || typeof f.tag === 'number');
}

function isReactElement(v: unknown): boolean {
  if (!v || typeof v !== 'object') return false;
  const $$typeof = (v as { $$typeof?: unknown }).$$typeof;
  return typeof $$typeof === 'symbol';
}
