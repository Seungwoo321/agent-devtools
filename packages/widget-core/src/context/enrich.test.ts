import { describe, expect, it, vi } from 'vitest';
import { createPageContextEnricher } from './enrich.js';
import { PAGE_CONTEXT_SCHEMA_VERSION } from './types.js';
import type { PageContext, PickedEvidence } from './types.js';

function makePicked(over: Partial<PickedEvidence> = {}): PickedEvidence {
  return {
    componentName: 'Picked',
    tagName: 'DIV',
    selector: '#picked',
    outerHTML: '<div id="picked"></div>',
    attributes: {},
    componentChain: [],
    ...over,
  };
}

function makeContext(picked: PickedEvidence | undefined): PageContext {
  return {
    schemaVersion: PAGE_CONTEXT_SCHEMA_VERSION,
    capturedAt: 0,
    url: 'http://localhost/',
    route: { pathname: '/', search: '', hash: '' },
    pageFiles: [],
    errors: [],
    ...(picked ? { picked } : {}),
  };
}

describe('createPageContextEnricher', () => {
  it('attaches relatedImports onto picked when fetcher returns values', async () => {
    const fetchRelatedImports = vi.fn(async () => ['src/App.tsx', 'src/util.ts']);
    const enrich = createPageContextEnricher({ fetchRelatedImports });
    const ctx = makeContext(makePicked({ source: { fileName: 'src/Picked.tsx', lineNumber: 1 } }));

    const next = await enrich(ctx, new AbortController().signal);

    expect(fetchRelatedImports).toHaveBeenCalledWith('src/Picked.tsx', expect.any(AbortSignal));
    expect(next.picked?.relatedImports).toEqual(['src/App.tsx', 'src/util.ts']);
    // Original context is not mutated.
    expect(ctx.picked?.relatedImports).toBeUndefined();
  });

  it('returns the input untouched when no picked element is present', async () => {
    const fetchRelatedImports = vi.fn(async () => ['ignored']);
    const enrich = createPageContextEnricher({ fetchRelatedImports });
    const ctx = makeContext(undefined);

    const next = await enrich(ctx, new AbortController().signal);

    expect(next).toBe(ctx);
    expect(fetchRelatedImports).not.toHaveBeenCalled();
  });

  it('returns the input untouched when picked has no source.fileName', async () => {
    const fetchRelatedImports = vi.fn(async () => ['x']);
    const enrich = createPageContextEnricher({ fetchRelatedImports });
    const ctx = makeContext(makePicked());

    const next = await enrich(ctx, new AbortController().signal);

    expect(next).toBe(ctx);
    expect(fetchRelatedImports).not.toHaveBeenCalled();
  });

  it('returns the input untouched when the fetcher returns an empty list', async () => {
    const fetchRelatedImports = vi.fn(async () => []);
    const enrich = createPageContextEnricher({ fetchRelatedImports });
    const ctx = makeContext(makePicked({ source: { fileName: 'src/Picked.tsx', lineNumber: 1 } }));

    const next = await enrich(ctx, new AbortController().signal);

    expect(next).toBe(ctx);
  });

  it('swallows fetcher rejections and returns the input context', async () => {
    const fetchRelatedImports = vi.fn(async () => {
      throw new Error('boom');
    });
    const enrich = createPageContextEnricher({ fetchRelatedImports });
    const ctx = makeContext(makePicked({ source: { fileName: 'src/Picked.tsx', lineNumber: 1 } }));

    const next = await enrich(ctx, new AbortController().signal);

    expect(next).toBe(ctx);
  });

  it('returns the input context when the signal is already aborted', async () => {
    const fetchRelatedImports = vi.fn(async () => ['x']);
    const enrich = createPageContextEnricher({ fetchRelatedImports });
    const ctx = makeContext(makePicked({ source: { fileName: 'src/Picked.tsx', lineNumber: 1 } }));
    const controller = new AbortController();
    controller.abort();

    const next = await enrich(ctx, controller.signal);

    expect(next).toBe(ctx);
    expect(fetchRelatedImports).not.toHaveBeenCalled();
  });

  it('returns the input context when the signal aborts mid-fetch', async () => {
    const controller = new AbortController();
    const fetchRelatedImports = vi.fn(async () => {
      controller.abort();
      return ['src/Late.tsx'];
    });
    const enrich = createPageContextEnricher({ fetchRelatedImports });
    const ctx = makeContext(makePicked({ source: { fileName: 'src/Picked.tsx', lineNumber: 1 } }));

    const next = await enrich(ctx, controller.signal);

    expect(next).toBe(ctx);
  });

  it('skips fetching when relatedImports is already populated', async () => {
    const fetchRelatedImports = vi.fn(async () => ['ignored']);
    const enrich = createPageContextEnricher({ fetchRelatedImports });
    const ctx = makeContext(
      makePicked({
        source: { fileName: 'src/Picked.tsx', lineNumber: 1 },
        relatedImports: ['existing.ts'],
      }),
    );

    const next = await enrich(ctx, new AbortController().signal);

    expect(next).toBe(ctx);
    expect(fetchRelatedImports).not.toHaveBeenCalled();
  });

  it('attaches a sourceSlice when the fetcher returns a payload', async () => {
    const fetchSourceSlice = vi.fn(async () => ({
      code: 'a\nb\nc',
      startLine: 1,
      endLine: 3,
    }));
    const enrich = createPageContextEnricher({ fetchSourceSlice });
    const ctx = makeContext(makePicked({ source: { fileName: 'src/Picked.tsx', lineNumber: 12 } }));

    const next = await enrich(ctx, new AbortController().signal);

    expect(fetchSourceSlice).toHaveBeenCalledWith('src/Picked.tsx', 12, expect.any(AbortSignal));
    expect(next.picked?.sourceSlice).toEqual({
      code: 'a\nb\nc',
      startLine: 1,
      endLine: 3,
    });
    expect(ctx.picked?.sourceSlice).toBeUndefined();
  });

  it('runs related-imports and source-slice fetchers in parallel', async () => {
    const fetchRelatedImports = vi.fn(async () => ['src/App.tsx']);
    const fetchSourceSlice = vi.fn(async () => ({
      code: 'x',
      startLine: 1,
      endLine: 1,
    }));
    const enrich = createPageContextEnricher({ fetchRelatedImports, fetchSourceSlice });
    const ctx = makeContext(makePicked({ source: { fileName: 'src/Picked.tsx', lineNumber: 7 } }));

    const next = await enrich(ctx, new AbortController().signal);

    expect(fetchRelatedImports).toHaveBeenCalledTimes(1);
    expect(fetchSourceSlice).toHaveBeenCalledTimes(1);
    expect(next.picked?.relatedImports).toEqual(['src/App.tsx']);
    expect(next.picked?.sourceSlice).toEqual({ code: 'x', startLine: 1, endLine: 1 });
  });

  it('skips source-slice when lineNumber is non-finite or below one', async () => {
    const fetchSourceSlice = vi.fn(async () => ({
      code: 'x',
      startLine: 1,
      endLine: 1,
    }));
    const enrich = createPageContextEnricher({ fetchSourceSlice });
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, 0, -1]) {
      const ctx = makeContext(
        makePicked({ source: { fileName: 'src/Picked.tsx', lineNumber: bad } }),
      );
      const next = await enrich(ctx, new AbortController().signal);
      expect(next).toBe(ctx);
    }
    expect(fetchSourceSlice).not.toHaveBeenCalled();
  });

  it('skips source-slice when picked.sourceSlice is already populated', async () => {
    const fetchSourceSlice = vi.fn(async () => ({
      code: 'fresh',
      startLine: 1,
      endLine: 1,
    }));
    const enrich = createPageContextEnricher({ fetchSourceSlice });
    const ctx = makeContext(
      makePicked({
        source: { fileName: 'src/Picked.tsx', lineNumber: 4 },
        sourceSlice: { code: 'existing', startLine: 1, endLine: 1 },
      }),
    );

    const next = await enrich(ctx, new AbortController().signal);

    expect(next).toBe(ctx);
    expect(fetchSourceSlice).not.toHaveBeenCalled();
  });

  it('swallows source-slice fetcher rejection without affecting the context', async () => {
    const fetchSourceSlice = vi.fn(async () => {
      throw new Error('boom');
    });
    const enrich = createPageContextEnricher({ fetchSourceSlice });
    const ctx = makeContext(makePicked({ source: { fileName: 'src/Picked.tsx', lineNumber: 4 } }));

    const next = await enrich(ctx, new AbortController().signal);

    expect(next).toBe(ctx);
  });

  it('treats an empty slice code string as no enrichment', async () => {
    const fetchSourceSlice = vi.fn(async () => ({
      code: '',
      startLine: 1,
      endLine: 1,
    }));
    const enrich = createPageContextEnricher({ fetchSourceSlice });
    const ctx = makeContext(makePicked({ source: { fileName: 'src/Picked.tsx', lineNumber: 4 } }));

    const next = await enrich(ctx, new AbortController().signal);

    expect(next).toBe(ctx);
  });
});
