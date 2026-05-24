import { describe, expect, it } from 'vitest';
import { describePickedVue } from './picked.js';
import type { ComponentInstanceLike } from './types.js';

function bindInstance(element: Element, instance: ComponentInstanceLike): void {
  (element as unknown as { __vueParentComponent: ComponentInstanceLike }).__vueParentComponent =
    instance;
}

describe('describePickedVue', () => {
  it('falls back to lowercase tagName when element is not rendered by Vue', () => {
    const button = document.createElement('button');
    button.textContent = 'Save';
    document.body.appendChild(button);
    const result = describePickedVue(button);
    expect(result.componentName).toBe('button');
    expect(result.tagName).toBe('BUTTON');
    expect(result.componentChain).toEqual([]);
    expect(result.source).toBeUndefined();
  });

  it('resolves componentName + source from the bound Vue instance', () => {
    const el = document.createElement('section');
    el.id = 'card';
    el.textContent = 'Counter widget';
    document.body.appendChild(el);
    bindInstance(el, {
      uid: 1,
      type: { name: 'CounterCard', __file: '/abs/path/CounterCard.vue' },
      parent: null,
    });

    const result = describePickedVue(el);
    expect(result.componentName).toBe('CounterCard');
    expect(result.source).toEqual({ fileName: '/abs/path/CounterCard.vue', lineNumber: 1 });
    expect(result.id).toBe('card');
    expect(result.text).toBe('Counter widget');
  });

  it('builds the leaf-first component chain across ancestors', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const root: ComponentInstanceLike = {
      uid: 3,
      type: { name: 'AppRoot', __file: '/src/App.vue' },
      parent: null,
    };
    const middle: ComponentInstanceLike = {
      uid: 2,
      type: { name: 'List', __file: '/src/List.vue' },
      parent: root,
    };
    const leaf: ComponentInstanceLike = {
      uid: 1,
      type: { name: 'Item', __file: '/src/Item.vue' },
      parent: middle,
    };
    bindInstance(el, leaf);
    const result = describePickedVue(el);
    expect(result.componentChain.map((c) => c.componentName)).toEqual(['Item', 'List', 'AppRoot']);
  });

  it('truncates outerHTML beyond the configured limit', () => {
    const el = document.createElement('div');
    el.innerHTML = 'x'.repeat(5000);
    document.body.appendChild(el);
    const result = describePickedVue(el, { outerHTMLLimit: 100 });
    expect(result.outerHTML.length).toBeLessThanOrEqual(100 + 16);
    expect(result.outerHTML.endsWith('…[truncated]')).toBe(true);
  });

  it('serialises sanitised props from instance.props', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    bindInstance(el, {
      uid: 1,
      type: { name: 'X' },
      parent: null,
      props: { title: 'hello', onClick: () => undefined, count: 7 },
    });
    const result = describePickedVue(el);
    expect(result.propsSnapshot).toBeDefined();
    const parsed = JSON.parse(result.propsSnapshot!) as Record<string, unknown>;
    expect(parsed.title).toBe('hello');
    expect(parsed.onClick).toBe('[function]');
    expect(parsed.count).toBe(7);
  });

  it('does not include propsSnapshot when there are no resolved props', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    bindInstance(el, { uid: 1, type: { name: 'X' }, parent: null });
    const result = describePickedVue(el);
    expect(result.propsSnapshot).toBeUndefined();
  });
});
