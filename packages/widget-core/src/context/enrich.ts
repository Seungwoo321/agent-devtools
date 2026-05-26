/**
 * Async enrichment hook injected by the Vite plugin's bootstrap. The
 * orchestrator awaits this between `buildPageContext` and the transport
 * send, so the agent receives a richer picked evidence without the widget
 * having to issue a follow-up read.
 *
 * The default enricher attaches up to two pieces of evidence in parallel:
 *
 *   - `relatedImports` — workspace-relative paths of the source files the
 *     picked component's own file imports, derived from the dev server's
 *     module graph (Vite `ViteDevServer.moduleGraph`).
 *   - `sourceSlice` — a window of source code around the picked line,
 *     read from disk by the dev server (workspace-rooted, ten lines on
 *     each side by default).
 *
 * Each fetcher is optional — pass only what the host can answer. Any
 * fetch failure or abort returns the original page context untouched
 * (enrichment is best-effort by contract). Fields that the picked
 * evidence already carries are skipped so an adapter can pre-populate
 * either piece without triggering a redundant network call.
 */
import type { PageContext, PickedEvidence, SourceSlice } from './types.js';
import type { RelatedImportsFetcher, SourceSliceFetcher } from '../transport/sse-transport.js';

export interface CreatePageContextEnricherOptions {
  /**
   * Fetches the workspace-relative imports for a given workspace-relative
   * source file. Normally `createRelatedImportsFetcher` from the
   * transport module, but kept as an injection point so tests can stub
   * the network out. Omit to skip related-imports enrichment.
   */
  fetchRelatedImports?: RelatedImportsFetcher;
  /**
   * Fetches a small source window centered on the picked line. Normally
   * `createSourceSliceFetcher` from the transport module. Omit to skip
   * source-slice enrichment.
   */
  fetchSourceSlice?: SourceSliceFetcher;
}

export type PageContextEnricher = (
  pageContext: PageContext,
  signal: AbortSignal,
) => Promise<PageContext>;

export function createPageContextEnricher(
  options: CreatePageContextEnricherOptions,
): PageContextEnricher {
  return async function enrichPageContext(pageContext, signal) {
    if (signal.aborted) return pageContext;
    const picked = pageContext.picked;
    const fileName = picked?.source?.fileName;
    if (!picked || !fileName) return pageContext;

    const tasks: Array<Promise<unknown>> = [];

    const needRelated =
      options.fetchRelatedImports !== undefined &&
      !(Array.isArray(picked.relatedImports) && picked.relatedImports.length > 0);
    let importsResult: readonly string[] | undefined;
    if (needRelated && options.fetchRelatedImports) {
      const fetcher = options.fetchRelatedImports;
      tasks.push(
        (async (): Promise<void> => {
          try {
            importsResult = await fetcher(fileName, signal);
          } catch {
            importsResult = undefined;
          }
        })(),
      );
    }

    const lineNumber = picked.source?.lineNumber;
    const needSlice =
      options.fetchSourceSlice !== undefined &&
      picked.sourceSlice === undefined &&
      typeof lineNumber === 'number' &&
      Number.isFinite(lineNumber) &&
      lineNumber >= 1;
    let sliceResult: SourceSlice | null | undefined;
    if (needSlice && options.fetchSourceSlice && typeof lineNumber === 'number') {
      const fetcher = options.fetchSourceSlice;
      tasks.push(
        (async (): Promise<void> => {
          try {
            sliceResult = await fetcher(fileName, lineNumber, signal);
          } catch {
            sliceResult = null;
          }
        })(),
      );
    }

    if (tasks.length === 0) return pageContext;
    await Promise.all(tasks);
    if (signal.aborted) return pageContext;

    const nextPicked: PickedEvidence = { ...picked };
    let changed = false;
    if (importsResult && importsResult.length > 0) {
      nextPicked.relatedImports = importsResult;
      changed = true;
    }
    if (sliceResult && sliceResult.code.length > 0) {
      nextPicked.sourceSlice = sliceResult;
      changed = true;
    }
    if (!changed) return pageContext;
    return { ...pageContext, picked: nextPicked };
  };
}
