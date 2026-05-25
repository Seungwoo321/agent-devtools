import { afterEach, describe, expect, it } from 'vitest';
import { walkComponentAncestors } from './walker.js';

interface MockComponent {
  constructor: { name: string };
}

function installNg(map: Map<Element, MockComponent>): void {
  (globalThis as unknown as { window: Window }).window = globalThis as unknown as Window;
  (window as unknown as { ng: { getOwningComponent: (el: Element) => unknown } }).ng = {
    getOwningComponent: (el: Element) => map.get(el) ?? null,
  };
}

function clearNg(): void {
  if (typeof window !== 'undefined') {
    delete (window as unknown as { ng?: unknown }).ng;
  }
}

afterEach(() => {
  clearNg();
  document.body.innerHTML = '';
});

describe('walkComponentAncestors (angular)', () => {
  it('yields no entries when element is null', () => {
    const out = Array.from(walkComponentAncestors(null));
    expect(out).toEqual([]);
  });

  it('yields no entries when ng debug api is missing', () => {
    document.body.innerHTML = '<div id="host"><button id="b">click</button></div>';
    const button = document.getElementById('b')!;
    const out = Array.from(walkComponentAncestors(button));
    expect(out).toEqual([]);
  });

  it('walks DOM parents and yields each owning component once', () => {
    document.body.innerHTML = `
      <div id="app"><section id="card"><button id="b">click</button></section></div>
    `;
    const app = document.getElementById('app')!;
    const card = document.getElementById('card')!;
    const button = document.getElementById('b')!;
    class AppComponent {}
    class CardComponent {}
    const appInstance: MockComponent = {
      constructor: AppComponent as unknown as { name: string },
    };
    const cardInstance: MockComponent = {
      constructor: CardComponent as unknown as { name: string },
    };
    const map = new Map<Element, MockComponent>();
    map.set(app, appInstance);
    map.set(card, cardInstance);
    map.set(button, cardInstance);
    installNg(map);
    const out = Array.from(walkComponentAncestors(button));
    expect(out.map((r) => r.componentName)).toEqual(['CardComponent', 'AppComponent']);
  });

  it('respects maxDepth', () => {
    document.body.innerHTML = `
      <div id="a"><div id="b"><div id="c"><div id="d">x</div></div></div></div>
    `;
    const ids = ['a', 'b', 'c', 'd'];
    const map = new Map<Element, MockComponent>();
    ids.forEach((id, idx) => {
      class C {}
      Object.defineProperty(C, 'name', { value: `C${String(idx)}` });
      map.set(document.getElementById(id)!, { constructor: C as unknown as { name: string } });
    });
    installNg(map);
    const out = Array.from(walkComponentAncestors(document.getElementById('d'), { maxDepth: 2 }));
    expect(out).toHaveLength(2);
    expect(out.map((r) => r.componentName)).toEqual(['C3', 'C2']);
  });
});
