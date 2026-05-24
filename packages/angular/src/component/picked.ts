import {
  buildSelector,
  type BoundingRect,
  type BuildSelectorOptions,
  type ComponentChainEntry,
  type PickedEvidence,
} from '@agent-devtools/react';
import { getComponentInstanceForElement } from './dom-bridge.js';
import { resolveComponentName } from './component-name.js';
import { resolveInstanceSource } from './source.js';
import { walkComponentAncestors } from './walker.js';

const DEFAULT_TEXT_LIMIT = 120;
const DEFAULT_OUTER_HTML_LIMIT = 4096;
const DEFAULT_COMPONENT_CHAIN_DEPTH = 10;
const TRUNCATION_MARKER = '…[truncated]';

export interface DescribePickedAngularOptions {
  selector?: BuildSelectorOptions;
  textLimit?: number;
  outerHTMLLimit?: number;
  componentChainDepth?: number;
}

/**
 * Build a `PickedEvidence` for a DOM element rendered by Angular Ivy.
 *
 * The shape mirrors what the React and Vue adapters produce — the widget
 * UI and server prompt formatter consume any adapter's evidence
 * unchanged. Source location is intentionally omitted for now (see
 * `resolveInstanceSource`), but componentName + componentChain + selector
 * are enough for the agent to grep for the right `.ts` / `.html` file.
 */
export function describePickedAngular(
  element: Element,
  options: DescribePickedAngularOptions = {},
): PickedEvidence {
  const instance = getComponentInstanceForElement(element);
  const componentName = instance ? resolveComponentName(instance) : element.tagName.toLowerCase();
  const textLimit = options.textLimit ?? DEFAULT_TEXT_LIMIT;
  const outerHTMLLimit = options.outerHTMLLimit ?? DEFAULT_OUTER_HTML_LIMIT;
  const chainDepth = options.componentChainDepth ?? DEFAULT_COMPONENT_CHAIN_DEPTH;

  const result: PickedEvidence = {
    componentName,
    tagName: element.tagName,
    selector: buildSelector(element, options.selector ?? {}),
    outerHTML: clampString(element.outerHTML ?? '', outerHTMLLimit),
    attributes: collectAttributes(element),
    componentChain: collectComponentChain(element, chainDepth),
  };

  const source = resolveInstanceSource(instance);
  if (source) result.source = source;

  const rect = readBoundingRect(element);
  if (rect) result.boundingRect = rect;

  const text = extractText(element, textLimit);
  if (text !== undefined) result.text = text;
  if (element.id) result.id = element.id;
  const className = readClassName(element);
  if (className !== undefined) result.className = className;

  return result;
}

function clampString(raw: string, max: number): string {
  if (raw.length <= max) return raw;
  return raw.slice(0, max) + TRUNCATION_MARKER;
}

function collectAttributes(element: Element): Readonly<Record<string, string>> {
  const out: Record<string, string> = {};
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
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
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

function collectComponentChain(element: Element, maxDepth: number): readonly ComponentChainEntry[] {
  const out: ComponentChainEntry[] = [];
  for (const ref of walkComponentAncestors(element, { maxDepth })) {
    const entry: ComponentChainEntry = { componentName: ref.componentName };
    if (ref.source) entry.source = ref.source;
    out.push(entry);
  }
  return out;
}
