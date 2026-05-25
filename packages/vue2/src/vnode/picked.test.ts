import { describe, expect, it } from 'vitest';
import { describePickedVue2 } from './picked.js';
import type { Vue2ComponentInstance } from './types.js';

function bindInstance(element: Element, instance: Vue2ComponentInstance): void {
  (element as unknown as { __vue__: Vue2ComponentInstance }).__vue__ = instance;
}

describe('describePickedVue2', () => {
  it('falls back to lowercase tagName when element is not rendered by Vue', () => {
    const button = document.createElement('button');
    button.textContent = 'Save';
    document.body.appendChild(button);
    const result = describePickedVue2(button);
    expect(result.componentName).toBe('button');
    expect(result.tagName).toBe('BUTTON');
    expect(result.componentChain).toEqual([]);
    expect(result.source).toBeUndefined();
  });

  it('resolves componentName + source from the bound Vue 2 instance', () => {
    const el = document.createElement('section');
    el.id = 'card';
    el.textContent = 'Counter widget';
    document.body.appendChild(el);
    bindInstance(el, {
      _uid: 1,
      $options: { name: 'CounterCard', __file: '/abs/path/CounterCard.vue' },
      $parent: null,
    });

    const result = describePickedVue2(el);
    expect(result.componentName).toBe('CounterCard');
    expect(result.source).toEqual({ fileName: '/abs/path/CounterCard.vue', lineNumber: 1 });
    expect(result.id).toBe('card');
    expect(result.text).toBe('Counter widget');
  });

  it('builds the leaf-first component chain across $parent ancestors', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const root: Vue2ComponentInstance = {
      _uid: 3,
      $options: { name: 'AppRoot', __file: '/src/App.vue' },
      $parent: null,
    };
    const middle: Vue2ComponentInstance = {
      _uid: 2,
      $options: { name: 'List', __file: '/src/List.vue' },
      $parent: root,
    };
    const leaf: Vue2ComponentInstance = {
      _uid: 1,
      $options: { name: 'Item', __file: '/src/Item.vue' },
      $parent: middle,
    };
    bindInstance(el, leaf);
    const result = describePickedVue2(el);
    expect(result.componentChain.map((c) => c.componentName)).toEqual(['Item', 'List', 'AppRoot']);
  });

  it('walks up the DOM tree when only an ancestor element holds __vue__', () => {
    const root = document.createElement('section');
    const inner = document.createElement('span');
    inner.textContent = 'inside';
    root.appendChild(inner);
    document.body.appendChild(root);
    bindInstance(root, {
      _uid: 1,
      $options: { name: 'Card', __file: '/src/Card.vue' },
      $parent: null,
    });
    const result = describePickedVue2(inner);
    expect(result.componentName).toBe('Card');
    expect(result.source).toEqual({ fileName: '/src/Card.vue', lineNumber: 1 });
  });

  it('truncates outerHTML beyond the configured limit', () => {
    const el = document.createElement('div');
    el.innerHTML = 'x'.repeat(5000);
    document.body.appendChild(el);
    const result = describePickedVue2(el, { outerHTMLLimit: 100 });
    expect(result.outerHTML.length).toBeLessThanOrEqual(100 + 16);
    expect(result.outerHTML.endsWith('…[truncated]')).toBe(true);
  });

  it('serialises sanitised props from instance.$props', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    bindInstance(el, {
      _uid: 1,
      $options: { name: 'X' },
      $parent: null,
      $props: { title: 'hello', onClick: () => undefined, count: 7 },
    });
    const result = describePickedVue2(el);
    expect(result.propsSnapshot).toBeDefined();
    const parsed = JSON.parse(result.propsSnapshot!) as Record<string, unknown>;
    expect(parsed.title).toBe('hello');
    expect(parsed.onClick).toBe('[function]');
    expect(parsed.count).toBe(7);
  });

  it('does not include propsSnapshot when there are no resolved props', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    bindInstance(el, { _uid: 1, $options: { name: 'X' }, $parent: null });
    const result = describePickedVue2(el);
    expect(result.propsSnapshot).toBeUndefined();
  });
});
