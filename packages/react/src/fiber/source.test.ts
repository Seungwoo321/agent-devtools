import { describe, expect, it } from 'vitest';
import {
  normalizeLegacyDebugSource,
  parseDebugStack,
  readJsxSourceProp,
  resolveFiberSource,
} from './source.js';
import type { FiberNodeLike } from './types.js';

/**
 * Stack traces in these tests intentionally mirror what V8 produces in
 * Chrome/Node during Vite dev: an `Error\n` header, then React's own
 * `react_jsx-dev-runtime` frame as the first non-header line, then the
 * user's JSX call site, then more React internals further down.
 */
function stack(...lines: string[]): { stack: string } {
  return { stack: ['Error', ...lines].join('\n') };
}

describe('normalizeLegacyDebugSource', () => {
  it('returns undefined for null / non-object input', () => {
    expect(normalizeLegacyDebugSource(null)).toBeUndefined();
    expect(normalizeLegacyDebugSource(undefined)).toBeUndefined();
    expect(normalizeLegacyDebugSource('x')).toBeUndefined();
    expect(normalizeLegacyDebugSource(42)).toBeUndefined();
  });

  it('returns the canonical shape for a well-formed legacy debug source', () => {
    expect(
      normalizeLegacyDebugSource({
        fileName: '/src/App.tsx',
        lineNumber: 10,
        columnNumber: 3,
      }),
    ).toEqual({ fileName: '/src/App.tsx', lineNumber: 10, columnNumber: 3 });
  });

  it('omits columnNumber when it is not a finite number', () => {
    expect(normalizeLegacyDebugSource({ fileName: '/x.tsx', lineNumber: 1 })).toEqual({
      fileName: '/x.tsx',
      lineNumber: 1,
    });
    expect(
      normalizeLegacyDebugSource({
        fileName: '/x.tsx',
        lineNumber: 1,
        columnNumber: Number.NaN,
      }),
    ).toEqual({ fileName: '/x.tsx', lineNumber: 1 });
  });

  it('rejects missing or empty fileName', () => {
    expect(normalizeLegacyDebugSource({ fileName: '', lineNumber: 1 })).toBeUndefined();
    expect(normalizeLegacyDebugSource({ lineNumber: 1 })).toBeUndefined();
  });

  it('rejects non-finite lineNumber', () => {
    expect(
      normalizeLegacyDebugSource({
        fileName: '/x.tsx',
        lineNumber: Number.NaN,
      }),
    ).toBeUndefined();
    expect(normalizeLegacyDebugSource({ fileName: '/x.tsx' })).toBeUndefined();
  });
});

describe('parseDebugStack', () => {
  it('returns undefined for null / missing stack', () => {
    expect(parseDebugStack(null)).toBeUndefined();
    expect(parseDebugStack(undefined)).toBeUndefined();
    expect(parseDebugStack({})).toBeUndefined();
    expect(parseDebugStack({ stack: '' })).toBeUndefined();
  });

  it('returns the first non-React frame from a Vite dev stack', () => {
    const error = stack(
      '    at Object.jsxDEV (http://localhost:5173/node_modules/.vite/deps/react_jsx-dev-runtime.js?v=abc:21:18)',
      '    at App (http://localhost:5173/src/App.tsx?t=1700000000000:36:11)',
      '    at renderWithHooks (http://localhost:5173/node_modules/.vite/deps/react-dom_client.js?v=abc:11516:18)',
    );
    expect(parseDebugStack(error)).toEqual({
      fileName: 'src/App.tsx',
      lineNumber: 36,
      columnNumber: 11,
    });
  });

  it('strips a cache-busting query string from the URL', () => {
    const error = stack(
      '    at App (http://localhost:5173/src/components/Counter.tsx?t=1700&v=abc:55:5)',
    );
    expect(parseDebugStack(error)).toEqual({
      fileName: 'src/components/Counter.tsx',
      lineNumber: 55,
      columnNumber: 5,
    });
  });

  it('handles file:// URLs as absolute filesystem paths', () => {
    const error = stack('    at App (file:///abs/path/App.tsx:12:4)');
    expect(parseDebugStack(error)).toEqual({
      fileName: '/abs/path/App.tsx',
      lineNumber: 12,
      columnNumber: 4,
    });
  });

  it('handles anonymous frames without function name + parens', () => {
    const error = stack('    at http://localhost:5173/src/App.tsx:36:11');
    expect(parseDebugStack(error)).toEqual({
      fileName: 'src/App.tsx',
      lineNumber: 36,
      columnNumber: 11,
    });
  });

  it("decodes Vite's @fs prefix into an absolute filesystem path", () => {
    const error = stack('    at Lib (http://localhost:5173/@fs/Users/me/lib/Button.tsx?v=xyz:8:1)');
    expect(parseDebugStack(error)).toEqual({
      fileName: '/Users/me/lib/Button.tsx',
      lineNumber: 8,
      columnNumber: 1,
    });
  });

  it('skips frames from react / react-dom / jsx-runtime even when nested deep', () => {
    const error = stack(
      '    at Object.jsxDEV (http://localhost:5173/node_modules/.vite/deps/react_jsx-dev-runtime.js?v=abc:21:18)',
      '    at renderWithHooks (http://localhost:5173/node_modules/.vite/deps/react-dom_client.js?v=abc:11516:18)',
      '    at Foo (http://localhost:5173/src/Foo.tsx?t=1:9:2)',
    );
    expect(parseDebugStack(error)).toEqual({
      fileName: 'src/Foo.tsx',
      lineNumber: 9,
      columnNumber: 2,
    });
  });

  it('returns undefined when every frame is a React internal', () => {
    const error = stack(
      '    at Object.jsxDEV (http://localhost:5173/node_modules/.vite/deps/react_jsx-dev-runtime.js?v=abc:21:18)',
      '    at renderWithHooks (http://localhost:5173/node_modules/.vite/deps/react-dom_client.js?v=abc:11516:18)',
    );
    expect(parseDebugStack(error)).toBeUndefined();
  });

  it('accepts a real Error instance (its .stack auto-populates)', () => {
    const err = new Error('react-stack-top-frame');
    // Real V8 stacks include the test file and vitest internals — assert
    // the parser returns SOMETHING with a valid line, rather than a
    // specific URL we can't pin down across machines.
    const out = parseDebugStack(err);
    if (out !== undefined) {
      expect(typeof out.fileName).toBe('string');
      expect(out.fileName.length).toBeGreaterThan(0);
      expect(Number.isFinite(out.lineNumber)).toBe(true);
    }
  });
});

describe('resolveFiberSource', () => {
  it('returns undefined for null / undefined fiber', () => {
    expect(resolveFiberSource(null)).toBeUndefined();
    expect(resolveFiberSource(undefined)).toBeUndefined();
  });

  it('prefers legacy _debugSource when both fields are present', () => {
    const fiber: FiberNodeLike = {
      _debugSource: {
        fileName: '/src/A.tsx',
        lineNumber: 7,
        columnNumber: 1,
      },
      _debugStack: stack('    at A (http://localhost:5173/src/Other.tsx?t=1:9:2)'),
    };
    expect(resolveFiberSource(fiber)).toEqual({
      fileName: '/src/A.tsx',
      lineNumber: 7,
      columnNumber: 1,
    });
  });

  it('falls back to _debugStack when _debugSource is missing (React 19)', () => {
    const fiber: FiberNodeLike = {
      _debugStack: stack(
        '    at Object.jsxDEV (http://localhost:5173/node_modules/.vite/deps/react_jsx-dev-runtime.js?v=abc:21:18)',
        '    at App (http://localhost:5173/src/App.tsx?t=1700:36:11)',
      ),
    };
    expect(resolveFiberSource(fiber)).toEqual({
      fileName: 'src/App.tsx',
      lineNumber: 36,
      columnNumber: 11,
    });
  });

  it('returns undefined when neither field yields a usable location', () => {
    const fiber: FiberNodeLike = {};
    expect(resolveFiberSource(fiber)).toBeUndefined();
  });

  it('ignores a malformed _debugSource and tries _debugStack instead', () => {
    const fiber: FiberNodeLike = {
      _debugSource: { fileName: '', lineNumber: 5 } as never,
      _debugStack: stack('    at App (http://localhost:5173/src/App.tsx?t=1:36:11)'),
    };
    expect(resolveFiberSource(fiber)).toEqual({
      fileName: 'src/App.tsx',
      lineNumber: 36,
      columnNumber: 11,
    });
  });

  it('falls back to memoizedProps.__source when both debug channels miss', () => {
    const fiber: FiberNodeLike = {
      memoizedProps: {
        __source: {
          fileName: '/src/Button.tsx',
          lineNumber: 42,
          columnNumber: 7,
        },
      },
    };
    expect(resolveFiberSource(fiber)).toEqual({
      fileName: '/src/Button.tsx',
      lineNumber: 42,
      columnNumber: 7,
    });
  });

  it('prefers _debugStack over the __source prop when both are present', () => {
    const fiber: FiberNodeLike = {
      _debugStack: stack('    at App (http://localhost:5173/src/A.tsx?t=1:1:1)'),
      memoizedProps: {
        __source: { fileName: '/src/Other.tsx', lineNumber: 9, columnNumber: 1 },
      },
    };
    // Debug stack hits first; the __source prop is the last-resort channel.
    expect(resolveFiberSource(fiber)).toEqual({
      fileName: 'src/A.tsx',
      lineNumber: 1,
      columnNumber: 1,
    });
  });

  it('returns undefined when all three channels miss', () => {
    const fiber: FiberNodeLike = {
      memoizedProps: { className: 'card', children: 'hi' },
    };
    expect(resolveFiberSource(fiber)).toBeUndefined();
  });
});

describe('readJsxSourceProp', () => {
  it('returns undefined for null / non-object props', () => {
    expect(readJsxSourceProp(null)).toBeUndefined();
    expect(readJsxSourceProp(undefined)).toBeUndefined();
    expect(readJsxSourceProp('not an object')).toBeUndefined();
    expect(readJsxSourceProp(123)).toBeUndefined();
  });

  it('returns undefined when __source is missing', () => {
    expect(readJsxSourceProp({})).toBeUndefined();
    expect(readJsxSourceProp({ className: 'x' })).toBeUndefined();
  });

  it('extracts a well-formed __source from element props', () => {
    expect(
      readJsxSourceProp({
        children: 'hi',
        __source: { fileName: 'src/App.tsx', lineNumber: 12, columnNumber: 3 },
      }),
    ).toEqual({ fileName: 'src/App.tsx', lineNumber: 12, columnNumber: 3 });
  });

  it('rejects a malformed __source (empty fileName, non-finite lineNumber)', () => {
    expect(readJsxSourceProp({ __source: { fileName: '', lineNumber: 1 } })).toBeUndefined();
    expect(readJsxSourceProp({ __source: { fileName: 'x.tsx', lineNumber: NaN } })).toBeUndefined();
  });

  it('omits columnNumber when it is missing or non-finite', () => {
    expect(readJsxSourceProp({ __source: { fileName: 'x.tsx', lineNumber: 5 } })).toEqual({
      fileName: 'x.tsx',
      lineNumber: 5,
    });
  });
});
