import { describe, expect, it } from 'vitest';
import {
  collectComponentRefs,
  dedupeByFile,
  walkComponentAncestors,
  walkFiberTree,
} from './walker.js';
import type { FiberSourceLocation } from './types.js';

interface FiberSeed {
  type?: unknown;
  source?: FiberSourceLocation | null;
  children?: FiberSeed[];
}

interface MutableFiber {
  type?: unknown;
  child: MutableFiber | null;
  sibling: MutableFiber | null;
  return: MutableFiber | null;
  _debugSource?: FiberSourceLocation | null;
}

/**
 * Build a parent → child(sibling-chained) tree of `MutableFiber`s from a
 * seed description. Returns the root fiber.
 */
function buildTree(seed: FiberSeed): MutableFiber {
  const node: MutableFiber = {
    child: null,
    sibling: null,
    return: null,
    ...(seed.type !== undefined && { type: seed.type }),
    ...(seed.source !== undefined && { _debugSource: seed.source }),
  };
  const children = seed.children ?? [];
  let prev: MutableFiber | null = null;
  for (const childSeed of children) {
    const childNode = buildTree(childSeed);
    childNode.return = node;
    if (prev === null) {
      node.child = childNode;
    } else {
      prev.sibling = childNode;
    }
    prev = childNode;
  }
  return node;
}

const SRC_APP: FiberSourceLocation = { fileName: '/src/App.tsx', lineNumber: 10, columnNumber: 4 };
const SRC_BTN: FiberSourceLocation = { fileName: '/src/Button.tsx', lineNumber: 5 };
const SRC_LIST: FiberSourceLocation = { fileName: '/src/List.tsx', lineNumber: 20 };

describe('walkFiberTree', () => {
  it('yields nothing for null / undefined start', () => {
    expect([...walkFiberTree(null)]).toEqual([]);
    expect([...walkFiberTree(undefined)]).toEqual([]);
  });

  it('yields the single root fiber when there are no children', () => {
    const root = buildTree({ type: 'div' });
    const visited = [...walkFiberTree(root)];
    expect(visited).toHaveLength(1);
    expect(visited[0]).toBe(root);
  });

  it('walks in pre-order: parent → first child → child of child → siblings', () => {
    const root = buildTree({
      type: 'A',
      children: [
        {
          type: 'B',
          children: [{ type: 'B1' }, { type: 'B2' }],
        },
        { type: 'C' },
      ],
    });
    const types = [...walkFiberTree(root)].map((f) => f.type);
    expect(types).toEqual(['A', 'B', 'B1', 'B2', 'C']);
  });

  it('is cycle-safe: a sibling pointer that loops back does not infinite-loop', () => {
    const a = buildTree({ type: 'A' });
    const b = buildTree({ type: 'B' });
    a.sibling = b;
    b.sibling = a;
    const visited = [...walkFiberTree(a)];
    expect(visited.map((f) => f.type)).toEqual(['A', 'B']);
  });

  it('respects maxFibers and stops early', () => {
    const root = buildTree({
      type: 'r',
      children: [{ type: '1' }, { type: '2' }, { type: '3' }, { type: '4' }],
    });
    const visited = [...walkFiberTree(root, { maxFibers: 3 })];
    expect(visited).toHaveLength(3);
  });
});

describe('collectComponentRefs (React 19 _debugStack fallback)', () => {
  it('resolves source from _debugStack when _debugSource is absent', () => {
    const fiber = {
      type: function MyComp(): null {
        return null;
      },
      child: null,
      sibling: null,
      return: null,
      _debugStack: {
        stack: [
          'Error',
          '    at Object.jsxDEV (http://localhost:5173/node_modules/.vite/deps/react_jsx-dev-runtime.js?v=abc:21:18)',
          '    at MyComp (http://localhost:5173/src/MyComp.tsx?t=1700:9:3)',
        ].join('\n'),
      },
    } as unknown as MutableFiber;
    expect(collectComponentRefs(fiber)).toEqual([
      {
        componentName: 'MyComp',
        source: { fileName: 'src/MyComp.tsx', lineNumber: 9, columnNumber: 3 },
      },
    ]);
  });

  it('prefers _debugSource over _debugStack when both are present', () => {
    const fiber = {
      type: function MyComp(): null {
        return null;
      },
      child: null,
      sibling: null,
      return: null,
      _debugSource: { fileName: '/src/Legacy.tsx', lineNumber: 1, columnNumber: 1 },
      _debugStack: {
        stack: ['Error', '    at MyComp (http://localhost:5173/src/Other.tsx?t=1:9:3)'].join('\n'),
      },
    } as unknown as MutableFiber;
    expect(collectComponentRefs(fiber)).toEqual([
      {
        componentName: 'MyComp',
        source: { fileName: '/src/Legacy.tsx', lineNumber: 1, columnNumber: 1 },
      },
    ]);
  });
});

describe('collectComponentRefs', () => {
  it('returns refs only for fibers with a valid _debugSource', () => {
    const root = buildTree({
      type: 'App',
      source: SRC_APP,
      children: [
        { type: 'div' }, // host: no source
        { type: 'Button', source: SRC_BTN },
      ],
    });
    const refs = collectComponentRefs(root);
    expect(refs).toEqual([
      { componentName: 'App', source: SRC_APP },
      { componentName: 'Button', source: SRC_BTN },
    ]);
  });

  it('drops sources missing fileName or lineNumber', () => {
    const broken1: FiberSourceLocation = {
      fileName: '',
      lineNumber: 1,
    };
    const broken2 = {
      fileName: '/x.tsx',
      lineNumber: Number.NaN,
    } as unknown as FiberSourceLocation;
    const root = buildTree({
      type: 'A',
      children: [
        { type: 'B', source: broken1 },
        { type: 'C', source: broken2 },
        { type: 'D', source: SRC_BTN },
      ],
    });
    expect(collectComponentRefs(root)).toEqual([{ componentName: 'D', source: SRC_BTN }]);
  });

  it('omits columnNumber when it is not a finite number', () => {
    const root = buildTree({
      type: 'App',
      source: { fileName: '/a.tsx', lineNumber: 3 },
    });
    const [ref] = collectComponentRefs(root);
    if (!ref) throw new Error('expected one ref');
    expect(ref.source).toEqual({ fileName: '/a.tsx', lineNumber: 3 });
    expect(ref.source && 'columnNumber' in ref.source).toBe(false);
  });

  it('returns [] when no fibers have a debug source (e.g. production)', () => {
    const root = buildTree({
      type: 'App',
      children: [{ type: 'Inner' }],
    });
    expect(collectComponentRefs(root)).toEqual([]);
  });
});

describe('dedupeByFile', () => {
  it('keeps only the first ref per fileName, preserving walk order', () => {
    const refs = [
      { componentName: 'A', source: SRC_APP },
      { componentName: 'B', source: SRC_BTN },
      { componentName: 'A2', source: { ...SRC_APP, lineNumber: 999 } },
      { componentName: 'L', source: SRC_LIST },
    ];
    expect(dedupeByFile(refs)).toEqual([
      { componentName: 'A', source: SRC_APP },
      { componentName: 'B', source: SRC_BTN },
      { componentName: 'L', source: SRC_LIST },
    ]);
  });

  it('returns [] when input is []', () => {
    expect(dedupeByFile([])).toEqual([]);
  });
});

describe('integration: walker → collect → dedupe', () => {
  it('collects every component once per source file from a realistic tree', () => {
    const root = buildTree({
      type: function App() {},
      source: SRC_APP,
      children: [
        { type: 'div' },
        {
          type: function Button() {},
          source: SRC_BTN,
          children: [{ type: 'span' }],
        },
        {
          type: function ListItem() {},
          source: SRC_LIST,
          children: [
            { type: function ListItem() {}, source: SRC_LIST },
            { type: function ListItem() {}, source: SRC_LIST },
          ],
        },
      ],
    });
    const deduped = dedupeByFile(collectComponentRefs(root));
    expect(deduped.map((r) => r.source?.fileName)).toEqual([
      '/src/App.tsx',
      '/src/Button.tsx',
      '/src/List.tsx',
    ]);
  });
});

describe('walkComponentAncestors', () => {
  function App(): null {
    return null;
  }
  function Layout(): null {
    return null;
  }
  function Card(): null {
    return null;
  }

  function chain(): MutableFiber {
    const appNode: MutableFiber = { type: App, child: null, sibling: null, return: null };
    const layoutNode: MutableFiber = { type: Layout, child: null, sibling: null, return: appNode };
    // A host (string-type) fiber between Card and Layout; it must be
    // skipped by walkComponentAncestors.
    const hostNode: MutableFiber = { type: 'div', child: null, sibling: null, return: layoutNode };
    const cardNode: MutableFiber = { type: Card, child: null, sibling: null, return: hostNode };
    return cardNode;
  }

  it('yields named ancestors leaf-first, skipping host fibers', () => {
    const start = chain();
    const names = Array.from(walkComponentAncestors(start)).map((f) => {
      const t = f.type as { name?: string };
      return typeof t === 'function' ? t.name : String(t);
    });
    expect(names).toEqual(['Card', 'Layout', 'App']);
  });

  it('returns nothing when start is null/undefined', () => {
    expect(Array.from(walkComponentAncestors(null))).toEqual([]);
    expect(Array.from(walkComponentAncestors(undefined))).toEqual([]);
  });

  it('stops at maxDepth named ancestors', () => {
    const start = chain();
    const limited = Array.from(walkComponentAncestors(start, { maxDepth: 2 })).map(
      (f) => (f.type as { name?: string }).name,
    );
    expect(limited).toEqual(['Card', 'Layout']);
  });

  it('is cycle-safe', () => {
    const a: MutableFiber = { type: App, child: null, sibling: null, return: null };
    const b: MutableFiber = { type: Layout, child: null, sibling: null, return: a };
    a.return = b; // cycle
    const yielded = Array.from(walkComponentAncestors(b));
    expect(yielded.length).toBeLessThanOrEqual(2);
  });
});
