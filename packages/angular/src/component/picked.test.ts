import { afterEach, describe, expect, it } from 'vitest';
import { describePickedAngular } from './picked.js';

interface MockComponent {
  constructor: { name: string };
}

function installNg(map: Map<Element, MockComponent>): void {
  (window as unknown as { ng: { getOwningComponent: (el: Element) => unknown } }).ng = {
    getOwningComponent: (el: Element) => map.get(el) ?? null,
  };
}

afterEach(() => {
  if (typeof window !== 'undefined') {
    delete (window as unknown as { ng?: unknown }).ng;
  }
  document.body.innerHTML = '';
});

describe('describePickedAngular', () => {
  it('falls back to lowercased tagName when no Angular owner', () => {
    document.body.innerHTML = '<header id="h">Hi</header>';
    const header = document.getElementById('h')!;
    const evidence = describePickedAngular(header);
    expect(evidence.componentName).toBe('header');
    expect(evidence.componentChain).toEqual([]);
    expect(evidence.source).toBeUndefined();
    expect(evidence.tagName).toBe('HEADER');
    expect(evidence.selector).toContain('#h');
  });

  it('uses the owning component class name when ng debug api resolves it', () => {
    document.body.innerHTML = '<div id="root"><button id="b">x</button></div>';
    const root = document.getElementById('root')!;
    const button = document.getElementById('b')!;
    class AppComponent {}
    const appInstance: MockComponent = {
      constructor: AppComponent as unknown as { name: string },
    };
    const map = new Map<Element, MockComponent>();
    map.set(root, appInstance);
    map.set(button, appInstance);
    installNg(map);
    const evidence = describePickedAngular(button);
    expect(evidence.componentName).toBe('AppComponent');
    expect(evidence.componentChain.map((c) => c.componentName)).toEqual(['AppComponent']);
  });

  it('omits source field for all cases (no AOT location data yet)', () => {
    document.body.innerHTML = '<section id="s">hello</section>';
    const evidence = describePickedAngular(document.getElementById('s')!);
    expect(evidence.source).toBeUndefined();
  });
});
