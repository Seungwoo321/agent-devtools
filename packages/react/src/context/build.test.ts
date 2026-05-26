import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildPageContext } from './build.js';
import type { ErrorRecord } from '@agent-devtools/widget-core';
import type { FiberNodeLike, FiberSourceLocation } from '../fiber/types.js';

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  document.body.innerHTML = '';
});

interface Mutable {
  type?: unknown;
  child: Mutable | null;
  sibling: Mutable | null;
  return: Mutable | null;
  _debugSource?: FiberSourceLocation;
}

function fiber(type: unknown, source?: FiberSourceLocation, children: Mutable[] = []): Mutable {
  const node: Mutable = { type, child: null, sibling: null, return: null };
  if (source) node._debugSource = source;
  let prev: Mutable | null = null;
  for (const c of children) {
    c.return = node;
    if (prev === null) node.child = c;
    else prev.sibling = c;
    prev = c;
  }
  return node;
}

describe('buildPageContext', () => {
  it('returns the schema version and current timestamp', () => {
    const before = Date.now();
    const ctx = buildPageContext();
    const after = Date.now();
    expect(ctx.schemaVersion).toBe(2);
    expect(ctx.capturedAt).toBeGreaterThanOrEqual(before);
    expect(ctx.capturedAt).toBeLessThanOrEqual(after);
  });

  it('pulls url + route from the document location', () => {
    const ctx = buildPageContext();
    expect(ctx.url).toBe(window.location.href);
    expect(ctx.route.pathname).toBe(window.location.pathname);
  });

  it('returns empty pageFiles when no root container is provided', () => {
    expect(buildPageContext().pageFiles).toEqual([]);
  });

  it('collects pageFiles from a starting fiber', () => {
    function App(): null {
      return null;
    }
    function Button(): null {
      return null;
    }
    const tree = fiber(App, { fileName: '/app.tsx', lineNumber: 1 }, [
      fiber(Button, { fileName: '/button.tsx', lineNumber: 5 }),
      fiber('div'),
    ]);
    const ctx = buildPageContext({ startingFiber: tree as FiberNodeLike });
    expect(ctx.pageFiles).toEqual([
      { fileName: '/app.tsx', componentName: 'App', lineNumber: 1 },
      { fileName: '/button.tsx', componentName: 'Button', lineNumber: 5 },
    ]);
  });

  it('respects maxFiles cap', () => {
    function A(): null {
      return null;
    }
    function B(): null {
      return null;
    }
    function C(): null {
      return null;
    }
    const tree = fiber(A, { fileName: '/a.tsx', lineNumber: 1 }, [
      fiber(B, { fileName: '/b.tsx', lineNumber: 2 }),
      fiber(C, { fileName: '/c.tsx', lineNumber: 3 }),
    ]);
    const ctx = buildPageContext({
      startingFiber: tree as FiberNodeLike,
      maxFiles: 2,
    });
    expect(ctx.pageFiles).toHaveLength(2);
  });

  it('includes picked descriptor when pickedElement is provided', () => {
    document.body.innerHTML = '<button id="go">Run</button>';
    const btn = document.querySelector('button') as HTMLElement;
    const ctx = buildPageContext({ pickedElement: btn });
    expect(ctx.picked).toMatchObject({
      tagName: 'BUTTON',
      id: 'go',
      text: 'Run',
    });
  });

  it('keeps only the last N errors', () => {
    const errors: ErrorRecord[] = [
      { kind: 'console-error', timestamp: 1, message: 'a' },
      { kind: 'console-error', timestamp: 2, message: 'b' },
      { kind: 'console-error', timestamp: 3, message: 'c' },
      { kind: 'console-error', timestamp: 4, message: 'd' },
    ];
    const ctx = buildPageContext({ errors, maxErrors: 2 });
    expect(ctx.errors.map((e) => e.message)).toEqual(['c', 'd']);
  });

  it('returns errors: [] when none provided', () => {
    expect(buildPageContext().errors).toEqual([]);
  });

  it('omits picked when pickedElement is null', () => {
    const ctx = buildPageContext({ pickedElement: null });
    expect(ctx.picked).toBeUndefined();
  });

  it('walks from rootContainer via __reactContainer$X', () => {
    document.body.innerHTML = '<div id="root"></div>';
    const container = document.querySelector('#root') as HTMLElement;
    function App(): null {
      return null;
    }
    const appFiber = fiber(App, { fileName: '/main.tsx', lineNumber: 7 });
    const hostRoot: Mutable = { child: appFiber, sibling: null, return: null };
    (container as unknown as Record<string, unknown>)['__reactContainer$xyz'] = hostRoot;
    const ctx = buildPageContext({ rootContainer: container });
    expect(ctx.pageFiles).toEqual([{ fileName: '/main.tsx', componentName: 'App', lineNumber: 7 }]);
  });
});
