import {
  buildPageContext as baseBuildPageContext,
  type BuildPageContextInput,
  type PageContext,
  type PageFileEntry,
} from '@agent-devtools/widget-core';
import { getHostRootFiber } from '../fiber/dom-bridge.js';
import { collectComponentRefs, dedupeByFile } from '../fiber/walker.js';
import type { FiberNodeLike } from '../fiber/types.js';
import { describePicked } from './picked.js';

/**
 * Walk the React fiber tree rooted at `rootContainer` and emit a deduped
 * list of component source files. The shared widget-core builder accepts
 * any `collectPageFiles` callback with this shape; non-React adapters
 * inject their own walker (Vue ComponentInternalInstance, Svelte meta,
 * etc.) so the framework-agnostic builder stays out of fiber territory.
 */
export function collectPageFilesReact(rootContainer: Element | null): PageFileEntry[] {
  if (!rootContainer) return [];
  const host = getHostRootFiber(rootContainer);
  const start: FiberNodeLike | null = host?.child ?? host ?? null;
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
  }
  return entries;
}

export interface BuildPageContextReactInput extends Omit<
  BuildPageContextInput,
  'collectPageFiles' | 'describePicked'
> {
  /** Override the fiber-tree starting point (tests / debugging). */
  startingFiber?: FiberNodeLike | null;
}

/**
 * React-flavored page context builder. Threads the fiber walker into
 * widget-core's framework-agnostic `buildPageContext`. When the caller
 * passes `startingFiber`, that overrides the fiber discovered from
 * `rootContainer` — used by tests to inject mock fiber trees.
 */
export function buildPageContext(input: BuildPageContextReactInput = {}): PageContext {
  const { startingFiber, ...rest } = input;
  const collect =
    startingFiber === undefined ? collectPageFilesReact : () => collectFromFiber(startingFiber);
  return baseBuildPageContext({
    ...rest,
    describePicked,
    collectPageFiles: collect,
  });
}

function collectFromFiber(start: FiberNodeLike | null): PageFileEntry[] {
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
  }
  return entries;
}
