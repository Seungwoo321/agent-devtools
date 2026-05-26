import {
  buildSelector,
  type BoundingRect,
  type BuildSelectorOptions,
  type ComponentChainEntry,
  type PickedEvidence,
} from '@agent-devtools/widget-core';
import { getComponentInstanceForElement } from './dom-bridge.js';
import { resolveComponentName } from './component-name.js';
import { resolveInstanceSource } from './source.js';
import { walkComponentAncestors } from './walker.js';
import type { Vue2ComponentInstance } from './types.js';

const DEFAULT_TEXT_LIMIT = 120;
const DEFAULT_OUTER_HTML_LIMIT = 4096;
const DEFAULT_PROPS_LIMIT = 4096;
const DEFAULT_COMPONENT_CHAIN_DEPTH = 10;
const TRUNCATION_MARKER = '…[truncated]';

export interface DescribePickedVue2Options {
  selector?: BuildSelectorOptions;
  textLimit?: number;
  outerHTMLLimit?: number;
  propsSnapshotLimit?: number;
  componentChainDepth?: number;
}

/**
 * Build a `PickedEvidence` for a DOM element rendered by Vue 2.
 *
 * Same evidence shape the React adapter emits — the widget UI and the
 * server prompt formatter are framework-agnostic, so a Vue 2 picker just
 * needs to fill the same fields using Vue 2's component instance graph
 * (`$parent`, `$options.__file`) instead of fibers. When an element was
 * not rendered by Vue (static HTML, third-party widget), only the
 * DOM-derived fields are populated and componentChain comes back empty.
 */
export function describePickedVue2(
  element: Element,
  options: DescribePickedVue2Options = {},
): PickedEvidence {
  const instance = getComponentInstanceForElement(element);
  const componentName = instance ? resolveComponentName(instance) : element.tagName.toLowerCase();
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
    componentChain: collectComponentChain(instance, chainDepth),
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

  const props = serialiseProps(instance, propsLimit);
  if (props !== undefined) result.propsSnapshot = props;

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

function collectComponentChain(
  instance: Vue2ComponentInstance | null,
  maxDepth: number,
): readonly ComponentChainEntry[] {
  if (!instance) return [];
  const out: ComponentChainEntry[] = [];
  for (const ancestor of walkComponentAncestors(instance, { maxDepth })) {
    const entry: ComponentChainEntry = {
      componentName: resolveComponentName(ancestor),
    };
    const src = resolveInstanceSource(ancestor);
    if (src) entry.source = src;
    out.push(entry);
  }
  return out;
}

/**
 * Serialise the picked component's resolved props. We prefer `$props`
 * (the public, resolved props) over `$attrs` because `$attrs` includes
 * inherited bindings the user didn't author. Drop functions, DOM nodes,
 * vnodes, circulars — same replacer strategy as React/Vue3 adapters.
 */
function serialiseProps(instance: Vue2ComponentInstance | null, limit: number): string | undefined {
  const props = instance?.$props;
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
        if (isDomLike(value) || isVnodeLike(value)) return '[non-serialisable]';
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

function isVnodeLike(v: unknown): boolean {
  if (!v || typeof v !== 'object') return false;
  const candidate = v as { tag?: unknown; componentInstance?: unknown; componentOptions?: unknown };
  return candidate.componentInstance != null || candidate.componentOptions != null;
}
