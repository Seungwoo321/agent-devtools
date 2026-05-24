import { afterEach, describe, expect, it } from 'vitest';
import { walkComponentAncestors } from './walker.js';

function tag(el: Element, file: string, line: number, column = 0): void {
  (el as unknown as { __svelte_meta: object }).__svelte_meta = {
    loc: { file, line, column },
  };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('walkComponentAncestors (svelte)', () => {
  it('yields no entries when element is null', () => {
    expect(Array.from(walkComponentAncestors(null))).toEqual([]);
  });

  it('yields no entries when no element on the chain has svelte meta', () => {
    document.body.innerHTML = '<div><span id="x">x</span></div>';
    const x = document.getElementById('x')!;
    expect(Array.from(walkComponentAncestors(x))).toEqual([]);
  });

  it('yields one entry per unique file in DOM-ancestor order', () => {
    document.body.innerHTML = `
      <div id="a"><section id="b"><button id="c">x</button></section></div>
    `;
    const a = document.getElementById('a')!;
    const b = document.getElementById('b')!;
    const c = document.getElementById('c')!;
    tag(a, '/src/App.svelte', 1);
    tag(b, '/src/Card.svelte', 5);
    tag(c, '/src/Card.svelte', 12);
    const out = Array.from(walkComponentAncestors(c));
    expect(out.map((r) => r.componentName)).toEqual(['Card', 'App']);
    expect(out[0]?.source?.fileName).toBe('/src/Card.svelte');
    expect(out[0]?.source?.lineNumber).toBe(12);
    expect(out[1]?.source?.fileName).toBe('/src/App.svelte');
  });

  it('respects maxDepth', () => {
    document.body.innerHTML = `
      <div id="a"><div id="b"><div id="c"><div id="d">x</div></div></div></div>
    `;
    ['a', 'b', 'c', 'd'].forEach((id, idx) => {
      tag(document.getElementById(id)!, `/src/L${String(idx)}.svelte`, idx + 1);
    });
    const out = Array.from(walkComponentAncestors(document.getElementById('d'), { maxDepth: 2 }));
    expect(out).toHaveLength(2);
    expect(out.map((r) => r.componentName)).toEqual(['L3', 'L2']);
  });
});
