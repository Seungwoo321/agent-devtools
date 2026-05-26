import type { ErrorRecord } from '../observers/types.js';
import { describePicked as defaultDescribePicked, type DescribePickedOptions } from './picked.js';
import { extractRoute, type RouteFileResolver } from './route.js';
import {
  PAGE_CONTEXT_SCHEMA_VERSION,
  type PageContext,
  type PageFileEntry,
  type PickedEvidence,
} from './types.js';

const DEFAULT_MAX_FILES = 50;
const DEFAULT_MAX_ERRORS = 50;

export interface BuildPageContextInput {
  document?: Document;
  /** Root DOM container the host framework mounted into. */
  rootContainer?: Element | null;
  /** Element the user picked, if any. */
  pickedElement?: Element | null;
  /** Pre-collected error records — typically `observer.getRecords()`. */
  errors?: readonly ErrorRecord[];
  maxFiles?: number;
  maxErrors?: number;
  pickedOptions?: DescribePickedOptions;
  /**
   * Adapter-injected pick resolver. When omitted, the DOM-only fallback
   * (`describePicked` from `./picked.ts`) is used — same shape, just
   * without componentName / componentChain / source / propsSnapshot
   * populated from a framework graph.
   */
  describePicked?: (element: Element, options?: DescribePickedOptions) => PickedEvidence;
  /**
   * Adapter-injected page-file collector. When provided, the result is
   * trimmed to `maxFiles` and emitted as `pageContext.pageFiles`. When
   * omitted, `pageFiles` comes back empty — the agent simply has fewer
   * files to grep, not a malformed context.
   */
  collectPageFiles?: (rootContainer: Element | null) => readonly PageFileEntry[];
  /**
   * Adapter-injected resolver for the current route's source file. Next
   * Pages Router and Nuxt provide this; framework-less hosts leave it
   * unset and `route.routeFile` simply stays absent.
   */
  resolveRouteFile?: RouteFileResolver;
}

/**
 * Assemble the page context shipped to the agent. None of the inputs are
 * mandatory: when a source is missing we emit the corresponding part as an
 * empty default (empty pageFiles array, no picked field, empty errors).
 * That keeps the contract stable for the server prompt formatter.
 */
export function buildPageContext(input: BuildPageContextInput = {}): PageContext {
  const doc = input.document ?? globalThis.document;
  const location = doc?.defaultView?.location ?? globalThis.location;
  const url = typeof location?.href === 'string' ? location.href : '';
  const maxFiles = input.maxFiles ?? DEFAULT_MAX_FILES;
  const maxErrors = input.maxErrors ?? DEFAULT_MAX_ERRORS;
  const describer = input.describePicked ?? defaultDescribePicked;

  const pageFiles = input.collectPageFiles
    ? takeFirst(input.collectPageFiles(input.rootContainer ?? null), maxFiles)
    : [];

  const context: PageContext = {
    schemaVersion: PAGE_CONTEXT_SCHEMA_VERSION,
    capturedAt: Date.now(),
    url,
    route: extractRoute(location, input.resolveRouteFile),
    pageFiles,
    errors: takeLast(input.errors ?? [], maxErrors),
  };
  if (input.pickedElement) {
    context.picked = describer(input.pickedElement, input.pickedOptions ?? {});
  }
  return context;
}

function takeFirst<T>(items: readonly T[], n: number): T[] {
  if (items.length <= n) return items.slice();
  return items.slice(0, n);
}

function takeLast<T>(items: readonly T[], n: number): T[] {
  if (items.length <= n) return items.slice();
  return items.slice(items.length - n);
}
