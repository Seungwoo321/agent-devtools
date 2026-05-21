import { getHostRootFiber } from '../fiber/dom-bridge.js';
import { collectComponentRefs, dedupeByFile } from '../fiber/walker.js';
import type { FiberNodeLike } from '../fiber/types.js';
import type { ErrorRecord } from '../observers/types.js';
import { describePicked, type DescribePickedOptions } from './picked.js';
import { extractRoute } from './route.js';
import { PAGE_CONTEXT_SCHEMA_VERSION, type PageContext, type PageFileEntry } from './types.js';

const DEFAULT_MAX_FILES = 50;
const DEFAULT_MAX_ERRORS = 50;

export interface BuildPageContextInput {
  document?: Document;
  /** Root DOM container that React mounted into (passed to `createRoot`). */
  rootContainer?: Element | null;
  /** Element the user picked, if any. */
  pickedElement?: Element | null;
  /** Pre-collected error records — typically `observer.getRecords()`. */
  errors?: readonly ErrorRecord[];
  /** Override the fiber-tree starting point (tests / debugging). */
  startingFiber?: FiberNodeLike | null;
  maxFiles?: number;
  maxErrors?: number;
  pickedOptions?: DescribePickedOptions;
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

  const startingFiber =
    input.startingFiber !== undefined
      ? input.startingFiber
      : findStartingFiber(input.rootContainer);
  const pageFiles = collectPageFiles(startingFiber, maxFiles);

  const context: PageContext = {
    schemaVersion: PAGE_CONTEXT_SCHEMA_VERSION,
    capturedAt: Date.now(),
    url,
    route: extractRoute(location),
    pageFiles,
    errors: takeLast(input.errors ?? [], maxErrors),
  };
  if (input.pickedElement) {
    context.picked = describePicked(input.pickedElement, input.pickedOptions ?? {});
  }
  return context;
}

function findStartingFiber(rootContainer: Element | null | undefined): FiberNodeLike | null {
  if (!rootContainer) return null;
  const host = getHostRootFiber(rootContainer);
  return host?.child ?? host ?? null;
}

function collectPageFiles(start: FiberNodeLike | null, max: number): PageFileEntry[] {
  if (!start) return [];
  const refs = dedupeByFile(collectComponentRefs(start));
  const entries: PageFileEntry[] = [];
  for (const ref of refs) {
    if (!ref.source) continue;
    const entry: PageFileEntry = {
      fileName: ref.source.fileName,
      componentName: ref.componentName,
      lineNumber: ref.source.lineNumber,
      ...(typeof ref.source.columnNumber === 'number' && {
        columnNumber: ref.source.columnNumber,
      }),
    };
    entries.push(entry);
    if (entries.length >= max) break;
  }
  return entries;
}

function takeLast<T>(items: readonly T[], n: number): T[] {
  if (items.length <= n) return items.slice();
  return items.slice(items.length - n);
}
