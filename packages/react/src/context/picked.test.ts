import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { describePicked } from './picked.js';

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  document.body.innerHTML = '';
});

function attachFiber(el: Element, fiber: object): void {
  (el as unknown as Record<string, unknown>)['__reactFiber$test'] = fiber;
}

describe('describePicked', () => {
  it('describes a plain DOM element with no fiber', () => {
    document.body.innerHTML = '<button class="primary">Click me</button>';
    const btn = document.querySelector('button') as HTMLElement;
    const out = describePicked(btn);
    expect(out.componentName).toBe('button');
    expect(out.tagName).toBe('BUTTON');
    expect(out.text).toBe('Click me');
    expect(out.className).toBe('primary');
    expect(out.id).toBeUndefined();
    expect(out.source).toBeUndefined();
  });

  it('pulls componentName and source from an attached fiber', () => {
    document.body.innerHTML = '<div></div>';
    const div = document.querySelector('div') as HTMLElement;
    function MyComponent(): null {
      return null;
    }
    attachFiber(div, {
      type: MyComponent,
      _debugSource: { fileName: '/x.tsx', lineNumber: 12, columnNumber: 3 },
    });
    const out = describePicked(div);
    expect(out.componentName).toBe('MyComponent');
    expect(out.source).toEqual({ fileName: '/x.tsx', lineNumber: 12, columnNumber: 3 });
  });

  it('includes the id when present', () => {
    document.body.innerHTML = '<div id="root"></div>';
    const el = document.querySelector('#root') as HTMLElement;
    expect(describePicked(el).id).toBe('root');
  });

  it('collapses whitespace and truncates long text', () => {
    document.body.innerHTML = '<p>  hello   world  </p>';
    const p = document.querySelector('p') as HTMLElement;
    expect(describePicked(p).text).toBe('hello world');

    p.textContent = 'x'.repeat(500);
    const truncated = describePicked(p, { textLimit: 50 }).text;
    expect(truncated?.length).toBeLessThanOrEqual(51);
    expect(truncated?.endsWith('…')).toBe(true);
  });

  it('omits text when textContent is whitespace-only', () => {
    document.body.innerHTML = '<div>   </div>';
    const div = document.querySelector('div') as HTMLElement;
    expect(describePicked(div).text).toBeUndefined();
  });

  it('captures outerHTML, attributes and bounding rect of the picked element', () => {
    document.body.innerHTML = '<button id="go" data-x="42" class="primary">Go</button>';
    const btn = document.querySelector('button') as HTMLElement;
    const out = describePicked(btn);
    expect(out.outerHTML).toContain('<button');
    expect(out.outerHTML).toContain('Go');
    expect(out.attributes.id).toBe('go');
    expect(out.attributes['data-x']).toBe('42');
    expect(out.attributes.class).toBe('primary');
    // happy-dom defaults bounding rects to zero — the field is present
    // either way.
    expect(out.boundingRect).toBeDefined();
  });

  it('truncates outerHTML past the configured limit with a marker', () => {
    document.body.innerHTML = `<div>${'x'.repeat(5000)}</div>`;
    const div = document.querySelector('div') as HTMLElement;
    const out = describePicked(div, { outerHTMLLimit: 200 });
    expect(out.outerHTML.length).toBeLessThanOrEqual(200 + '…[truncated]'.length);
    expect(out.outerHTML.endsWith('…[truncated]')).toBe(true);
  });

  it('collects a leaf-first component ancestor chain with sources', () => {
    document.body.innerHTML = '<div></div>';
    const div = document.querySelector('div') as HTMLElement;
    function App(): null {
      return null;
    }
    function Layout(): null {
      return null;
    }
    function Card(): null {
      return null;
    }
    const appFiber = {
      type: App,
      _debugSource: { fileName: '/app.tsx', lineNumber: 1 },
      return: null,
    };
    const layoutFiber = {
      type: Layout,
      _debugSource: { fileName: '/layout.tsx', lineNumber: 2 },
      return: appFiber,
    };
    const cardFiber = {
      type: Card,
      _debugSource: { fileName: '/card.tsx', lineNumber: 3 },
      return: layoutFiber,
    };
    attachFiber(div, cardFiber);
    const out = describePicked(div);
    expect(out.componentChain.map((c) => c.componentName)).toEqual(['Card', 'Layout', 'App']);
    expect(out.componentChain[0]?.source).toEqual({ fileName: '/card.tsx', lineNumber: 3 });
    expect(out.componentChain[2]?.source).toEqual({ fileName: '/app.tsx', lineNumber: 1 });
  });

  it('serialises memoizedProps but elides children/functions/DOM/circular', () => {
    document.body.innerHTML = '<div></div>';
    const div = document.querySelector('div') as HTMLElement;
    const circular: Record<string, unknown> = { name: 'self' };
    circular.self = circular;
    function MyComponent(): null {
      return null;
    }
    attachFiber(div, {
      type: MyComponent,
      memoizedProps: {
        label: 'Click me',
        count: 7,
        onClick: () => undefined,
        children: 'a-react-child',
        node: div,
        ring: circular,
      },
    });
    const out = describePicked(div);
    expect(typeof out.propsSnapshot).toBe('string');
    const parsed = JSON.parse(out.propsSnapshot as string) as Record<string, unknown>;
    expect(parsed.label).toBe('Click me');
    expect(parsed.count).toBe(7);
    expect(parsed.onClick).toBe('[function]');
    expect(parsed.children).toBe('[children]');
    expect(parsed.node).toBe('[non-serialisable]');
    expect(parsed.ring).toEqual({ name: 'self', self: '[circular]' });
  });

  it('omits propsSnapshot when memoizedProps is missing or non-object', () => {
    document.body.innerHTML = '<div></div>';
    const div = document.querySelector('div') as HTMLElement;
    expect(describePicked(div).propsSnapshot).toBeUndefined();
  });

  it('truncates propsSnapshot past the configured limit', () => {
    document.body.innerHTML = '<div></div>';
    const div = document.querySelector('div') as HTMLElement;
    function MyComponent(): null {
      return null;
    }
    attachFiber(div, {
      type: MyComponent,
      memoizedProps: { huge: 'a'.repeat(10_000) },
    });
    const snap = describePicked(div, { propsSnapshotLimit: 200 }).propsSnapshot;
    expect(snap?.length).toBeLessThanOrEqual(200 + '…[truncated]'.length);
    expect(snap?.endsWith('…[truncated]')).toBe(true);
  });

  it('uses fiber source columnNumber only when finite', () => {
    document.body.innerHTML = '<div></div>';
    const div = document.querySelector('div') as HTMLElement;
    attachFiber(div, {
      type: function X(): null {
        return null;
      },
      _debugSource: { fileName: '/y.tsx', lineNumber: 1 },
    });
    const out = describePicked(div);
    expect(out.source).toEqual({ fileName: '/y.tsx', lineNumber: 1 });
    expect(out.source && 'columnNumber' in out.source).toBe(false);
  });

  it('falls back to _debugStack when _debugSource is absent (React 19)', () => {
    document.body.innerHTML = '<div></div>';
    const div = document.querySelector('div') as HTMLElement;
    function MyComponent(): null {
      return null;
    }
    attachFiber(div, {
      type: MyComponent,
      _debugStack: {
        stack: [
          'Error',
          '    at Object.jsxDEV (http://localhost:5173/node_modules/.vite/deps/react_jsx-dev-runtime.js?v=abc:21:18)',
          '    at MyComponent (http://localhost:5173/src/MyComponent.tsx?t=1700000000000:42:7)',
        ].join('\n'),
      },
    });
    const out = describePicked(div);
    expect(out.componentName).toBe('MyComponent');
    expect(out.source).toEqual({
      fileName: 'src/MyComponent.tsx',
      lineNumber: 42,
      columnNumber: 7,
    });
  });

  it('resolves the ancestor chain via _debugStack on React 19', () => {
    document.body.innerHTML = '<div></div>';
    const div = document.querySelector('div') as HTMLElement;
    function App(): null {
      return null;
    }
    function Card(): null {
      return null;
    }
    const appFiber = {
      type: App,
      _debugStack: {
        stack: [
          'Error',
          '    at Object.jsxDEV (http://localhost:5173/node_modules/.vite/deps/react_jsx-dev-runtime.js?v=abc:21:18)',
          '    at App (http://localhost:5173/src/App.tsx?t=1:10:1)',
        ].join('\n'),
      },
      return: null,
    };
    const cardFiber = {
      type: Card,
      _debugStack: {
        stack: [
          'Error',
          '    at Object.jsxDEV (http://localhost:5173/node_modules/.vite/deps/react_jsx-dev-runtime.js?v=abc:21:18)',
          '    at Card (http://localhost:5173/src/Card.tsx?t=1:5:2)',
        ].join('\n'),
      },
      return: appFiber,
    };
    attachFiber(div, cardFiber);
    const out = describePicked(div);
    expect(out.componentChain.map((c) => c.componentName)).toEqual(['Card', 'App']);
    expect(out.componentChain[0]?.source).toEqual({
      fileName: 'src/Card.tsx',
      lineNumber: 5,
      columnNumber: 2,
    });
    expect(out.componentChain[1]?.source).toEqual({
      fileName: 'src/App.tsx',
      lineNumber: 10,
      columnNumber: 1,
    });
  });
});
